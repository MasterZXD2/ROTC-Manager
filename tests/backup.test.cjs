const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
const firestore = require('firebase/firestore');

function loadSource(name, overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', name + '.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const sourceRequire = createRequire(path.join(__dirname, '../src/lib', name + '.ts'));
  new Function('exports', 'require', code)(exports, (id) => overrides[id] ?? sourceRequire(id));
  return exports;
}
const format = loadSource('backup-format');
const projectId = 'demo-rotc-backup';
const uid = 'operator';
const profile = (id, role = 'student') => ({ uid: id, email: `${id}@example.org`, role, year: 1, fullName: id, isTester: true, isTrafficRepair: true });
function fixture() {
  const data = Object.fromEntries(format.COLLECTION_NAMES.map((name) => [name, [{ id: 'old', data: { nested: [null, false, { items: ['a', 'b'] }] } }]]));
  data.users = [{ id: uid, data: profile(uid, 'top_admin') }, { id: 'student', data: profile('student') }];
  data.config = [{ id: 'global', data: { timeSlots: [], locations: [], allowedRadiusMeters: 30 } }];
  data.groups = [{ id: 'group', data: { members: [{ uid: 'student', fullName: 'student' }], memberUids: ['student'], year: 1, checkStatus: 'pass', checkedBy: uid, checkedAt: 123, checkedByName: 'admin' } }];
  data.dailyCheckins = [{ id: 'student/2026-10-01', data: { count: 2 } }, { id: 'deleted-user/2026-10-01', data: { count: 1 } }];
  return data;
}
const create = (data = fixture()) => format.createBackup(projectId, data);
const quiet = () => {};

test('complete format round trips uid, nested arrays, maps, booleans and null', async () => {
  const backup = await create();
  assert.deepEqual(await format.validateBackup(JSON.parse(JSON.stringify(backup)), projectId), backup);
  assert.equal(backup.collections.users[0].id, backup.collections.users[0].data.uid);
});

test('rejects incomplete, foreign, changed, duplicate and invalid-path files', async () => {
  const valid = await create();
  await assert.rejects(format.validateBackup(valid, 'other-project'), /ระบบอื่น/);
  const changed = structuredClone(valid);
  changed.collections.users[1].data.fullName = 'changed';
  await assert.rejects(format.validateBackup(changed, projectId), /เสียหาย/);
  for (const mutate of [
    (d) => delete d.tasks,
    (d) => d.users.push(d.users[0]),
    (d) => d.users[0].data.uid = 'wrong',
    (d) => d.tasks[0].id = 'a/b',
    (d) => d.dailyCheckins[0].id = '../2026-10-01',
    (d) => d.config.push({ id: 'maintenance', data: {} }),
  ]) {
    const data = fixture(); mutate(data);
    await assert.rejects(format.validateBackup(await create(data), projectId));
  }
});

test('restore preserves operator identity and every current top admin', async () => {
  const backup = await create();
  const current = backup.collections.users;
  format.validateRestoreAccounts(backup, current, uid);
  const noCaller = await create(); noCaller.collections.users.shift();
  assert.throws(() => format.validateRestoreAccounts(noCaller, current, uid));
  assert.throws(() => format.validateRestoreAccounts(backup, [...current, { id: 'another', data: profile('another', 'top_admin') }], uid));
  const differentEmail = structuredClone(backup); differentEmail.collections.users[1].data.email = 'other@example.org';
  assert.throws(() => format.validateRestoreAccounts(differentEmail, current, uid));
});

function memoryService() {
  let store = new Map();
  let writes = 0;
  let failAt = Infinity;
  const snapshot = (ref) => ({ id: ref.path.split('/').at(-1), ref, data: () => store.get(ref.path) });
  const api = {
    Timestamp: firestore.Timestamp,
    doc: (_db, ...parts) => ({ path: parts.join('/') }),
    collection: (_db, name) => ({ name }),
    collectionGroup: (_db, name) => ({ group: name }),
    getDocFromServer: async (ref) => snapshot(ref),
    getDocsFromServer: async (ref) => ({ docs: [...store.keys()].filter((p) => ref.group ? p.split('/').at(-2) === ref.group : p.split('/').length === 2 && p.startsWith(ref.name + '/')).reverse().map((p) => snapshot({ path: p })) }),
    runTransaction: async (_db, callback) => {
      const changes = [];
      const result = await callback({ get: async (ref) => snapshot(ref), set: (ref, data) => changes.push([ref.path, data]), delete: (ref) => changes.push([ref.path, undefined]) });
      if (changes.some(([p]) => p !== 'config/maintenance')) {
        if (++writes === failAt) throw new Error('injected network failure');
      }
      for (const [p, data] of changes) data === undefined ? store.delete(p) : store.set(p, data);
      return result;
    },
  };
  const service = loadSource('backup', { 'firebase/firestore': api, './backup-format': format, './firebase': { auth: () => ({ currentUser: { uid } }), db: () => ({}), firebaseApp: () => ({ options: { projectId } }) } });
  return {
    service,
    seed(data = fixture()) { store = new Map(); for (const [name, records] of Object.entries(data)) for (const record of records) store.set(name === 'dailyCheckins' ? `users/${record.id.split('/')[0]}/dailyCheckins/${record.id.split('/')[1]}` : `${name}/${record.id}`, record.data); },
    get: (p) => store.get(p),
    set: (p, data) => store.set(p, data),
    failAfter: (n) => { failAt = writes + n; },
    writeCount: () => writes,
  };
}

test('timestamp round trip and malformed file preflight', async () => {
  const { service, seed, writeCount } = memoryService(); seed();
  const value = { nested: [{ at: new firestore.Timestamp(12345, 123), nil: null }] };
  const data = fixture(); data.tasks[0].data = service.encodeBackupValue(value);
  const backup = await create(data);
  await service.readBackupFile(JSON.stringify(backup));
  data.tasks[0].data = { at: { $timestamp: [0, 1e9] } };
  await assert.rejects(service.readBackupFile(JSON.stringify(await create(data))));
  await assert.rejects(service.readBackupFile('{broken'));
  assert.equal(writeCount(), 0);
  assert.throws(() => service.encodeBackupValue(new Date()));
});

test('semester reset preserves rosters/settings/flags and restores exact data with orphan removal', async () => {
  const m = memoryService(); m.seed();
  const original = await create();
  const prepared = await m.service.prepareBackup(uid, 'reset', quiet);
  // Firestore can reorder map keys without changing the data.
  m.set('config/global', { allowedRadiusMeters: 30, locations: [], timeSlots: [] });
  await m.service.resetSemester(uid, prepared, quiet);
  assert.equal(m.get('config/maintenance').active, false);
  for (const name of format.KEPT_COLLECTIONS.filter((n) => n !== 'groups')) {
    for (const record of original.collections[name]) assert.deepEqual(m.get(`${name}/${record.id}`), record.data);
  }
  assert.deepEqual(m.get('groups/group'), format.resetGroupData(original.collections.groups[0].data));
  assert.equal(m.get('users/student/dailyCheckins/2026-10-01'), undefined);
  assert.equal(m.get('users/deleted-user/dailyCheckins/2026-10-01'), undefined);
  for (const name of format.TERM_COLLECTIONS.filter((n) => n !== 'dailyCheckins')) assert.equal(m.get(`${name}/old`), undefined);
  m.set('users/extra', profile('extra'));
  m.set('users/extra/dailyCheckins/2026-10-02', { count: 2 });
  const restore = await m.service.prepareBackup(uid, 'restore', quiet);
  await m.service.restoreBackup(uid, original, restore, quiet);
  assert.equal(m.get('users/extra'), undefined);
  assert.equal(m.get('users/extra/dailyCheckins/2026-10-02'), undefined);
  assert.equal(m.get('config/maintenance').active, false);
  assert.deepEqual(m.get('users/student'), profile('student'));
});

test('partial failure stays paused; recovery takes ownership without opening writes', async () => {
  const m = memoryService(); m.seed();
  const initial = await m.service.prepareBackup(uid, 'reset', quiet);
  await assert.rejects(m.service.prepareBackup(uid, 'reset', quiet), /ค้าง/);
  m.failAfter(2);
  await assert.rejects(m.service.resetSemester(uid, initial, quiet), /injected/);
  assert.equal(m.get('config/maintenance').active, true);
  const recovery = await m.service.prepareBackup(uid, 'restore', quiet, initial.operationId);
  assert.equal(m.get('config/maintenance').active, true);
  await assert.rejects(m.service.releaseMaintenance(uid, initial.operationId), /งานใหม่/);
  await assert.rejects(m.service.resetSemester(uid, initial, quiet), /เปลี่ยน/);
  await m.service.restoreBackup(uid, initial.safety, recovery, quiet);
  assert.equal(m.get('config/maintenance').active, false);
  assert.deepEqual(m.get('checkins/old'), initial.safety.collections.checkins[0].data);
});

test('changed preflight snapshot prevents reset before first data write', async () => {
  const m = memoryService(); m.seed();
  const prepared = await m.service.prepareBackup(uid, 'reset', quiet);
  m.set('tasks/new', { name: 'unexpected' });
  await assert.rejects(m.service.resetSemester(uid, prepared, quiet), /เปลี่ยน/);
  assert.equal(m.writeCount(), 0);
  assert.equal(m.get('config/maintenance').active, true);
});

test('Firestore emulator: rules, historical restore and reset', { skip: !process.env.ROTC_FIRESTORE_TEST_HOST }, async () => {
  const { initializeApp, deleteApp } = require('firebase/app');
  const apps = [];
  function client(id, token) {
    const app = initializeApp({ projectId, apiKey: 'demo' }, id); apps.push(app);
    const db = firestore.getFirestore(app);
    const [host, port] = process.env.ROTC_FIRESTORE_TEST_HOST.split(':');
    firestore.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: token });
    return db;
  }
  const owner = client('seed', 'owner');
  const operator = client('operator', { sub: uid, email: `${uid}@example.org` });
  const student = client('student', { sub: 'student', email: 'student@example.org' });
  const other = client('other', { sub: 'other', email: 'other@example.org' });
  let adminDb;
  try {
    const [host, port] = process.env.ROTC_FIRESTORE_TEST_HOST.split(':');
    await fetch(`http://${host}:${port}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    const data = fixture();
    for (let i = 0; i < 205; i++) data.users.push({ id: `student${i}`, data: profile(`student${i}`) });
    data.users.push({ id: 'other', data: profile('other', 'top_admin') });
    data.tasks[0].data.at = new firestore.Timestamp(12345, 123000);
    for (const [name, records] of Object.entries(data)) for (const r of records) {
      const refPath = name === 'dailyCheckins' ? `users/${r.id.split('/')[0]}/dailyCheckins/${r.id.split('/')[1]}` : `${name}/${r.id}`;
      await firestore.setDoc(firestore.doc(owner, refPath), r.data);
    }
    const makeService = (db, id) => loadSource('backup', { './backup-format': format, './firebase': { auth: () => ({ currentUser: { uid: id } }), db: () => db, firebaseApp: () => ({ options: { projectId } }) } });
    const s = makeService(operator, uid);
    const prepared = await s.prepareBackup(uid, 'reset', quiet);
    process.env.FIRESTORE_EMULATOR_HOST = process.env.ROTC_FIRESTORE_TEST_HOST;
    process.env.GCLOUD_PROJECT = projectId;
    const legacy = loadSource('../../functions/src/shared');
    adminDb = legacy.db;
    await assert.rejects(adminDb.runTransaction(async (tx) => {
      await legacy.assertNotInMaintenance(tx);
      tx.set(adminDb.doc('tasks/legacy'), { name: 'blocked' });
    }), /ผู้ดูแลกำลังจัดการข้อมูล/);
    await assert.rejects(firestore.setDoc(firestore.doc(student, 'users/student'), { ...profile('student'), fullName: 'changed' }), /permission/i);
    await assert.rejects(firestore.setDoc(firestore.doc(student, 'config/maintenance'), { active: false }), /permission/i);
    await assert.rejects(firestore.deleteDoc(firestore.doc(other, 'tasks/old')), /permission/i);
    await assert.rejects(firestore.deleteDoc(firestore.doc(operator, 'tasks/old')), /permission/i);
    await assert.rejects(s.prepareBackup(uid, 'reset', quiet));
    await s.resetSemester(uid, prepared, quiet);
    await adminDb.runTransaction(async (tx) => {
      await legacy.assertNotInMaintenance(tx);
      tx.set(adminDb.doc('tasks/legacy'), { name: 'allowed' });
    });
    assert.equal((await firestore.getDocFromServer(firestore.doc(operator, 'checkins/old'))).exists(), false);
    assert.deepEqual((await firestore.getDocFromServer(firestore.doc(operator, 'users/student'))).data(), profile('student'));
    await firestore.setDoc(firestore.doc(student, 'users/student'), { ...profile('student'), fullName: 'allowed after reset' });
    const restore = await s.prepareBackup(uid, 'restore', quiet);
    await s.restoreBackup(uid, prepared.safety, restore, quiet);
    assert.deepEqual((await firestore.getDocFromServer(firestore.doc(operator, 'tasks/old'))).data().at, new firestore.Timestamp(12345, 123000));
    assert.deepEqual((await firestore.getDocFromServer(firestore.doc(operator, 'checkins/old'))).data(), prepared.safety.collections.checkins[0].data);
    const paused = await s.prepareBackup(uid, 'reset', quiet);
    const otherService = makeService(other, 'other');
    const recovery = await otherService.prepareBackup('other', 'restore', quiet, paused.operationId);
    await assert.rejects(s.resetSemester(uid, paused, quiet));
    await assert.rejects(firestore.deleteDoc(firestore.doc(other, 'users/operator')), /permission/i);
    await otherService.restoreBackup('other', paused.safety, recovery, quiet);
  } finally {
    if (adminDb) await adminDb.terminate();
    await Promise.all(apps.map(deleteApp));
  }
});
