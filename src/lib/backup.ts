"use client";

import {
  collection, collectionGroup, doc, getDocFromServer, getDocsFromServer, runTransaction,
  Timestamp, type DocumentReference, type DocumentData,
} from "firebase/firestore";
import { auth, db, firebaseApp } from "./firebase";
import {
  COLLECTION_NAMES, TERM_COLLECTIONS, BACKUP_COLLECTIONS, createBackup, validateBackup,
  validateRestoreAccounts, resetGroupData,
  type BackupCollection, type BackupFile, type BackupRecord, type JsonValue,
} from "./backup-format";

export interface MaintenanceState { active: boolean; ownerUid: string; operation: string; operationId: string; writeSequence: number }
export interface PreparedBackup { safety: BackupFile; operationId: string }
export type BackupProgress = (message: string) => void;

export function encodeBackupValue(value: unknown): JsonValue {
  if (value instanceof Timestamp) return { $timestamp: [value.seconds, value.nanoseconds] };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(encodeBackupValue);
  if (typeof value === "object" && value && Object.getPrototypeOf(value) === Object.prototype && !("$timestamp" in value)) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, encodeBackupValue(v)]));
  }
  throw new Error("พบชนิดข้อมูลที่ยังสำรองไม่ได้ ระบบจะไม่ล้างข้อมูล กรุณาติดต่อผู้ดูแล");
}

function decodeBackupValue(value: JsonValue): unknown {
  if (Array.isArray(value)) return value.map(decodeBackupValue);
  if (value && typeof value === "object") {
    if ("$timestamp" in value) {
      const parts = value.$timestamp;
      if (Object.keys(value).length !== 1 || !Array.isArray(parts) || parts.length !== 2 || !parts.every((p) => typeof p === "number" && Number.isInteger(p))) {
        throw new Error("ค่าเวลาในไฟล์สำรองไม่ถูกต้อง");
      }
      return new Timestamp(parts[0] as number, parts[1] as number);
    }
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, decodeBackupValue(v)]));
  }
  return value;
}

async function requireTopAdmin(uid: string): Promise<void> {
  if (auth().currentUser?.uid !== uid) throw new Error("กรุณาเข้าสู่ระบบใหม่");
  const user = await getDocFromServer(doc(db(), "users", uid));
  if (user.data()?.role !== "top_admin") throw new Error("เฉพาะผู้ดูแลสูงสุดเท่านั้น");
}

export async function releaseMaintenance(uid: string, operationId: string): Promise<void> {
  await requireTopAdmin(uid);
  await runTransaction(db(), async (tx) => {
    const ref = doc(db(), "config", "maintenance");
    const state = (await tx.get(ref)).data();
    if (state?.operationId !== operationId) throw new Error("มีงานใหม่เริ่มขึ้นแล้ว กรุณารีเฟรชสถานะ");
    tx.set(ref, { active: false, ownerUid: uid, operation: "", operationId, writeSequence: 0, updatedAt: Date.now() });
  });
}

async function acquireMaintenance(uid: string, operation: string, previousOperationId?: string): Promise<string> {
  await requireTopAdmin(uid);
  const operationId = crypto.randomUUID();
  await runTransaction(db(), async (tx) => {
    const ref = doc(db(), "config", "maintenance");
    const state = await tx.get(ref);
    if (previousOperationId) {
      if (!state.data()?.active || state.data()?.operationId !== previousOperationId || operation !== "restore") {
        throw new Error("สถานะงานเปลี่ยนไป กรุณารีเฟรชและตรวจสอบอีกครั้ง");
      }
    } else if (state.data()?.active) throw new Error("มีงานจัดการข้อมูลค้างอยู่ กรุณาตรวจสถานะก่อนเริ่มงานใหม่");
    tx.set(ref, { active: true, ownerUid: uid, operation, operationId, writeSequence: 0, updatedAt: Date.now() });
  });
  return operationId;
}

function recordRef(name: BackupCollection, id: string): DocumentReference {
  if (name === "dailyCheckins") {
    const [uid, day] = id.split("/");
    return doc(db(), "users", uid, "dailyCheckins", day);
  }
  return doc(db(), name, id);
}

async function readAll(progress: BackupProgress): Promise<BackupFile> {
  const collections = {} as BackupFile["collections"];
  for (const name of COLLECTION_NAMES.filter((n) => n !== "dailyCheckins")) {
    progress(`กำลังอ่าน: ${BACKUP_COLLECTIONS[name]}`);
    const snap = await getDocsFromServer(collection(db(), name));
    collections[name] = snap.docs.filter((d) => name !== "config" || d.id !== "maintenance")
      .map((d) => ({ id: d.id, data: encodeBackupValue(d.data()) as BackupRecord["data"] }));
  }
  progress("กำลังอ่านตัวนับเช็คชื่อรายวัน");
  const counters = await getDocsFromServer(collectionGroup(db(), "dailyCheckins"));
  collections.dailyCheckins = counters.docs.map((d) => {
    const path = d.ref.path.split("/");
    if (path.length !== 4 || path[0] !== "users") throw new Error("พบตัวนับเช็คชื่อในตำแหน่งที่ไม่รองรับ");
    return { id: `${path[1]}/${d.id}`, data: encodeBackupValue(d.data()) as BackupRecord["data"] };
  });
  const backup = await createBackup(firebaseApp().options.projectId!, collections);
  return validateBackup(backup, backup.projectId);
}

export async function prepareBackup(uid: string, operation: "backup" | "reset" | "restore", progress: BackupProgress, previousOperationId?: string): Promise<PreparedBackup> {
  const operationId = await acquireMaintenance(uid, operation, previousOperationId);
  try {
    const backup = await readAll(progress);
    await requireMaintenance(uid, operation, operationId);
    if (operation === "backup") await releaseMaintenance(uid, operationId);
    return { safety: backup, operationId };
  } catch (error) {
    if (!previousOperationId) await releaseMaintenance(uid, operationId).catch(() => { /* Keep paused if ownership or connection changed. */ });
    throw error;
  }
}

export async function readBackupFile(text: string): Promise<BackupFile> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("อ่านไฟล์ไม่ได้ กรุณาเลือกไฟล์สำรอง .json ที่ดาวน์โหลดจากระบบนี้"); }
  const backup = await validateBackup(value, firebaseApp().options.projectId!);
  for (const name of COLLECTION_NAMES) for (const record of backup.collections[name]) decodeBackupValue(record.data);
  return backup;
}

async function requireMaintenance(uid: string, operation: string, operationId: string): Promise<void> {
  await requireTopAdmin(uid);
  const state = (await getDocFromServer(doc(db(), "config", "maintenance"))).data();
  if (!state?.active || state.ownerUid !== uid || state.operation !== operation || state.operationId !== operationId) throw new Error("สถานะพักรับข้อมูลเปลี่ยนไป กรุณาเริ่มขั้นตอนใหม่");
}

async function commitRecords(uid: string, operationId: string, name: BackupCollection, records: BackupRecord[], remove: boolean): Promise<void> {
  // Leave room for rule lookups and keep each retry small.
  for (let i = 0; i < records.length; i += 200) {
    await runTransaction(db(), async (tx) => {
      const state = (await tx.get(doc(db(), "config", "maintenance"))).data();
      if (!state?.active || state.ownerUid !== uid || state.operationId !== operationId) throw new Error("งานนี้ถูกหยุดหรือมีผู้ดูแลรับช่วงแล้ว");
      // Rules require this marker in the same transaction, blocking ordinary actions in other operator tabs.
      tx.set(doc(db(), "config", "maintenance"), { ...state, writeSequence: state.writeSequence + 1, updatedAt: Date.now() });
      for (const record of records.slice(i, i + 200)) {
        const ref = recordRef(name, record.id);
        if (remove) tx.delete(ref);
        else tx.set(ref, decodeBackupValue(record.data) as DocumentData);
      }
    });
  }
}

function sameCollections(a: BackupFile, b: BackupFile): boolean {
  const sortKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(sortKeys)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, sortKeys(v)])) : value;
  const canonical = (file: BackupFile) => JSON.stringify(sortKeys(COLLECTION_NAMES.map((name) => [name,
    [...file.collections[name]].sort((x, y) => x.id.localeCompare(y.id)),
  ])));
  return canonical(a) === canonical(b);
}

export async function resetSemester(uid: string, prepared: PreparedBackup, progress: BackupProgress): Promise<void> {
  const { safety: safetyBackup, operationId } = prepared;
  await validateBackup(safetyBackup, firebaseApp().options.projectId!);
  await requireMaintenance(uid, "reset", operationId);
  const current = await readAll(progress);
  if (!sameCollections(current, safetyBackup)) throw new Error("ข้อมูลเปลี่ยนหลังสำรอง กรุณายกเลิกแล้วเตรียมไฟล์สำรองใหม่");
  for (const name of TERM_COLLECTIONS) {
    progress(`กำลังล้าง: ${BACKUP_COLLECTIONS[name]}`);
    await commitRecords(uid, operationId, name, safetyBackup.collections[name], true);
  }
  progress("กำลังคืนสถานะกลุ่มเวรเป็นยังไม่ตรวจ");
  await commitRecords(uid, operationId, "groups", safetyBackup.collections.groups.map((r) => ({ ...r, data: resetGroupData(r.data) })), false);
  const after = await readAll(progress);
  const expected = { ...safetyBackup, collections: { ...safetyBackup.collections } };
  for (const name of TERM_COLLECTIONS) expected.collections[name] = [];
  expected.collections.groups = expected.collections.groups.map((r) => ({ ...r, data: resetGroupData(r.data) }));
  if (!sameCollections(after, expected)) throw new Error("ตรวจพบข้อมูลคงเหลือ ระบบยังพักรับข้อมูล กรุณากู้คืนจากไฟล์ก่อนเริ่มใหม่");
  await releaseMaintenance(uid, operationId);
}

export async function restoreBackup(uid: string, backup: BackupFile, prepared: PreparedBackup, progress: BackupProgress): Promise<void> {
  const { safety: safetyBackup, operationId } = prepared;
  await validateBackup(backup, firebaseApp().options.projectId!);
  await requireMaintenance(uid, "restore", operationId);
  validateRestoreAccounts(backup, safetyBackup.collections.users, uid);
  const current = await readAll(progress);
  if (!sameCollections(current, safetyBackup)) throw new Error("ข้อมูลเปลี่ยนหลังสำรอง กรุณายกเลิกแล้วเตรียมไฟล์ใหม่");
  // Decode every record before the first write, so malformed values cannot cause a partial restore.
  for (const name of COLLECTION_NAMES) for (const record of backup.collections[name]) decodeBackupValue(record.data);
  for (const name of COLLECTION_NAMES) {
    progress(`กำลังกู้คืน: ${BACKUP_COLLECTIONS[name]}`);
    await commitRecords(uid, operationId, name, backup.collections[name], false);
  }
  // Delete counters before user profiles, since Firestore does not cascade subcollections.
  for (const name of [...COLLECTION_NAMES].sort((a, b) => Number(a === "users") - Number(b === "users"))) {
    const ids = new Set(backup.collections[name].map((r) => r.id));
    progress(`กำลังตรวจข้อมูลส่วนเกิน: ${BACKUP_COLLECTIONS[name]}`);
    await commitRecords(uid, operationId, name, safetyBackup.collections[name].filter((r) => !ids.has(r.id)), true);
  }
  if (!sameCollections(await readAll(progress), backup)) throw new Error("ผลกู้คืนยังไม่ตรงกับไฟล์ ระบบยังพักรับข้อมูล กรุณาลองกู้คืนอีกครั้ง");
  await releaseMaintenance(uid, operationId);
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ROTC-Backup-${backup.createdAt.replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
