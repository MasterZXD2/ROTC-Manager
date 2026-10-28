const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker() {
  const listeners = {};
  const stores = new Map();
  let networkCalls = 0;
  let claimed = false;
  let offline = false;
  let response = new Response('fresh page');
  const key = request => typeof request === 'string' ? new URL(request, 'https://rotc.test').href : request.url;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        put: async (request, value) => store.set(key(request), value.clone()),
        match: async request => store.get(key(request))?.clone(),
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    URL, Response, caches,
    self: { location: new URL('https://rotc.test'), addEventListener: (name, listener) => listeners[name] = listener, skipWaiting() {}, clients: { claim: async () => claimed = true } },
    fetch: async (_request, options) => {
      networkCalls++;
      if (offline) throw new Error('offline');
      if (_request.mode === 'navigate') assert.equal(options.cache, 'no-cache');
      return response.clone();
    },
  });
  return {
    caches, stores,
    networkCalls: () => networkCalls,
    claimed: () => claimed,
    offline: () => offline = true,
    response: value => response = value,
    async activate() {
      let pending;
      listeners.activate({ waitUntil: value => pending = value });
      await pending;
    },
    async fetch(url, mode = 'cors') {
      const pending = [];
      let result;
      listeners.fetch({
        request: { url: new URL(url, 'https://rotc.test').href, method: 'GET', mode, headers: new Headers() },
        respondWith: value => result = value,
        waitUntil: value => pending.push(value),
      });
      const value = await result;
      await Promise.all(pending);
      return value;
    },
  };
}

test('worker upgrade clears old app cache before claiming tabs and preserves unrelated caches', async () => {
  const w = worker();
  await w.caches.open('rotc-static-v3');
  await w.caches.open('unrelated-cache');
  await w.activate();
  assert.equal(w.stores.has('rotc-static-v3'), false);
  assert.equal(w.stores.has('unrelated-cache'), true);
  assert.equal(w.claimed(), true);
});

test('navigation reads fresh HTML and offline fallback uses only the requested route', async () => {
  const w = worker();
  const cache = await w.caches.open('rotc-static-v4');
  await cache.put('/top-admin/data/', new Response('old page'));
  await cache.put('/', new Response('different page'));
  assert.equal(await (await w.fetch('/top-admin/data/', 'navigate')).text(), 'fresh page');
  assert.equal(w.networkCalls(), 1);
  w.offline();
  assert.equal(await (await w.fetch('/top-admin/data/', 'navigate')).text(), 'fresh page');
  const missing = await w.fetch('/top-admin/checkins/', 'navigate');
  assert.equal(missing.status, 503);
  assert.doesNotMatch(await missing.text(), /different page/);
});

test('Next.js navigation payloads, worker scripts and external requests bypass worker cache', async () => {
  const w = worker();
  for (const route of ['/top-admin/data/index.txt?_rsc=1', '/top-admin/data?_rsc=2', '/sw.js?v=4', 'https://firestore.googleapis.com/example']) {
    assert.equal(await w.fetch(route), undefined);
  }
  assert.equal(w.networkCalls(), 0);
  assert.equal(w.stores.size, 0);
});

test('only successful static assets are cached; HTML fallback and errors are not cached', async () => {
  const w = worker();
  w.response(new Response('script', { headers: { 'Content-Type': 'text/javascript' } }));
  assert.equal(await (await w.fetch('/_next/static/chunks/abc.js')).text(), 'script');
  await w.fetch('/_next/static/chunks/abc.js');
  assert.equal(w.networkCalls(), 1);
  for (const [status, contentType] of [[404, 'text/plain'], [200, 'text/html']]) {
    w.response(new Response('missing', { status, headers: { 'Content-Type': contentType } }));
    const before = w.networkCalls();
    await w.fetch('/_next/static/chunks/missing.js');
    await w.fetch('/_next/static/chunks/missing.js');
    assert.equal(w.networkCalls() - before, 2);
  }
});
