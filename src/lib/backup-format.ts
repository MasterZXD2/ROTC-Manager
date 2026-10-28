import { z } from "zod";

export const BACKUP_COLLECTIONS = {
  users: "บัญชีและรายชื่อนักเรียน",
  pendingStudents: "รายชื่อนักเรียนรอลงทะเบียน",
  groups: "กลุ่มและสมาชิกเวร",
  config: "การตั้งค่าระบบ",
  yearConfigs: "เกณฑ์ผ่านแต่ละชั้นปี",
  blockedUsers: "บัญชีที่ถูกระงับ",
  checkins: "ประวัติเช็คชื่อจราจร",
  dailyCheckins: "ตัวนับเช็คชื่อรายวัน",
  activities: "กิจกรรม",
  activityCheckins: "ประวัติเช็คชื่อกิจกรรม",
  tasks: "งานประจำเทอม",
  taskCompletions: "ผลการทำงาน",
  dutyLogs: "ประวัติเวร",
  attendanceExemptions: "ข้อยกเว้นการเข้าเวร",
  activityExemptions: "ข้อยกเว้นกิจกรรม",
  characterEvaluations: "ผลประเมินคุณลักษณะ",
  swapRequests: "คำขอสลับเวร",
  sessions: "ตารางเวรเดิม",
  emergencyCodes: "รหัสเช็คชื่อฉุกเฉิน",
  activityEmergencyCodes: "รหัสกิจกรรมฉุกเฉิน",
  inviteCodes: "รหัสเชิญลงทะเบียน",
  activityLogs: "ประวัติการใช้งาน",
} as const;

export type BackupCollection = keyof typeof BACKUP_COLLECTIONS;
export const COLLECTION_NAMES = Object.keys(BACKUP_COLLECTIONS) as BackupCollection[];
export const KEPT_COLLECTIONS: BackupCollection[] = [
  "users", "pendingStudents", "groups", "config", "yearConfigs", "blockedUsers",
];
export const TERM_COLLECTIONS = COLLECTION_NAMES.filter((name) => !KEPT_COLLECTIONS.includes(name));
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface BackupRecord { id: string; data: Record<string, JsonValue> }

const jsonValue: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValue), z.record(jsonValue),
]));
const recordSchema = z.object({ id: z.string().min(1), data: z.record(jsonValue) }).strict();
const backupSchema = z.object({
  format: z.literal("rotc-manager"),
  version: z.literal(1),
  projectId: z.string().min(1),
  createdAt: z.string().datetime(),
  collections: z.record(z.array(recordSchema)),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export interface BackupFile {
  format: "rotc-manager";
  version: 1;
  projectId: string;
  createdAt: string;
  collections: Record<BackupCollection, BackupRecord[]>;
  checksum: string;
}

export async function backupChecksum(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createBackup(projectId: string, collections: BackupFile["collections"]): Promise<BackupFile> {
  const payload = { format: "rotc-manager" as const, version: 1 as const, projectId, createdAt: new Date().toISOString(), collections };
  return { ...payload, checksum: await backupChecksum(payload) };
}

export async function validateBackup(value: unknown, projectId: string): Promise<BackupFile> {
  const result = backupSchema.safeParse(value);
  if (!result.success) throw new Error("ไฟล์ไม่ใช่ backup JSON รุ่นที่รองรับ หรือข้อมูลไม่สมบูรณ์");
  const backup = result.data;
  if (backup.projectId !== projectId) throw new Error("ไฟล์นี้เป็นของระบบอื่น ไม่สามารถกู้คืนได้");
  const names = Object.keys(backup.collections);
  if (names.length !== COLLECTION_NAMES.length || COLLECTION_NAMES.some((name) => !names.includes(name))) {
    throw new Error("ไฟล์สำรองมีชุดข้อมูลไม่ครบ ห้ามใช้กู้คืนหรือล้างข้อมูล");
  }
  const { checksum, ...payload } = backup;
  if (await backupChecksum(payload) !== checksum) throw new Error("ไฟล์สำรองถูกแก้ไขหรือเสียหาย กรุณาใช้ไฟล์ต้นฉบับ");
  for (const name of COLLECTION_NAMES) {
    const seen = new Set<string>();
    for (const record of backup.collections[name]) {
      const parts = record.id.split("/");
      const validSegment = (part: string) => part.length > 0 && part !== "." && part !== ".." && !/^__.*__$/.test(part) && new TextEncoder().encode(part).length <= 1500;
      const validId = parts.every(validSegment) && (name === "dailyCheckins" ? parts.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) : parts.length === 1);
      if (!validId || record.id === "." || record.id === ".." || seen.has(record.id) || (name === "config" && record.id === "maintenance")) {
        throw new Error(`รหัสข้อมูลใน ${BACKUP_COLLECTIONS[name]} ไม่ถูกต้องหรือซ้ำกัน`);
      }
      seen.add(record.id);
      if ("$timestamp" in record.data) throw new Error("รูปแบบเอกสารในไฟล์ไม่ถูกต้อง");
      if (name === "users") {
        const user = z.object({ uid: z.literal(record.id), email: z.string().email(), role: z.enum(["student", "admin_student", "admin_teacher", "admin", "top_admin"]), year: z.number().int().min(0).max(5) }).safeParse(record.data);
        if (!user.success) throw new Error("ข้อมูลบัญชีผู้ใช้ในไฟล์ไม่ถูกต้อง");
      }
    }
  }
  if (!backup.collections.users.length || !backup.collections.config.some((r) => r.id === "global")) {
    throw new Error("ไฟล์สำรองต้องมีบัญชีผู้ใช้และการตั้งค่าระบบ");
  }
  return backup as BackupFile;
}

export function validateRestoreAccounts(backup: BackupFile, currentUsers: BackupRecord[], callerUid: string): void {
  const caller = backup.collections.users.find((r) => r.id === callerUid);
  const current = currentUsers.find((r) => r.id === callerUid);
  if (!caller || caller.data.role !== "top_admin" || caller.data.email !== current?.data.email) {
    throw new Error("ไฟล์ต้องมีบัญชีผู้ดูแลที่กำลังใช้งาน และคงสิทธิ์ผู้ดูแลสูงสุดไว้");
  }
  for (const user of currentUsers) {
    const restored = backup.collections.users.find((r) => r.id === user.id);
    if (restored && restored.data.email !== user.data.email) throw new Error("ไม่สามารถเปลี่ยนอีเมลของบัญชีเดิมผ่านการกู้คืน");
    if (user.data.role === "top_admin" && (!restored || restored.data.role !== "top_admin")) {
      throw new Error("ไฟล์ต้องเก็บบัญชีผู้ดูแลสูงสุดปัจจุบันไว้ครบ เพื่อป้องกันการเข้าใช้งานไม่ได้");
    }
  }
}

export function resetGroupData(data: BackupRecord["data"]): BackupRecord["data"] {
  const { checkStatus, checkedBy, checkedByName, checkedAt, ...kept } = data;
  return kept;
}
