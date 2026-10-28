import { BACKUP_COLLECTIONS, COLLECTION_NAMES, type BackupFile, type JsonValue } from "./backup-format";
import type { Cell, XlsxSheet } from "./exports";

const FIELD_LABELS: Record<string, string> = {
  fullName: "ชื่อ-นามสกุล", nickname: "ชื่อเล่น", studentId: "เลขนักเรียน",
  year: "ชั้นปี", classroom: "ห้องเรียน", email: "อีเมล", role: "สิทธิ์",
  uid: "UID", userId: "UID ผู้ใช้", studentUid: "UID นักเรียน",
  name: "ชื่อ", groupName: "กลุ่มเวร", taskName: "ชื่องาน", activityName: "กิจกรรม",
  timestamp: "วันเวลา", createdAt: "วันที่สร้าง", updatedAt: "วันที่แก้ไข",
  checkedAt: "วันที่ตรวจ", expiresAt: "วันหมดอายุ", usedAt: "วันที่ใช้",
  checkedByName: "ผู้ตรวจ", createdByName: "ผู้สร้าง", done: "ทำแล้ว",
  isTester: "ผู้ทดสอบ", isTrafficRepair: "จราจรซ่อม", count: "จำนวน",
};
const dateTime = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium",
});

function excelValue(value: JsonValue | undefined, field: string): Cell {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่ใช่";
  if (typeof value === "number") {
    if (field === "timestamp" || field.endsWith("At")) {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return dateTime.format(date);
    }
    return value;
  }
  if (typeof value === "object") {
    if (!Array.isArray(value) && Array.isArray(value.$timestamp)) {
      const [seconds, nanoseconds] = value.$timestamp;
      if (typeof seconds === "number" && typeof nanoseconds === "number") {
        const date = new Date(seconds * 1000 + nanoseconds / 1e6);
        if (Number.isFinite(date.getTime())) return dateTime.format(date);
      }
    }
    return JSON.stringify(value);
  }
  return value;
}

export function buildBackupExcelSheets(backup: BackupFile): XlsxSheet[] {
  const sheets: XlsxSheet[] = [{
    name: "สรุปการส่งออก",
    headers: ["รายการ", "รายละเอียด", "จำนวนรายการ"],
    rows: [
      ["ระบบ", backup.projectId, null],
      ["วันที่ส่งออก", dateTime.format(new Date(backup.createdAt)), null],
      ["การใช้งาน", "Excel สำหรับอ่านและทำรายงาน การกู้คืนระบบให้ใช้ไฟล์ JSON", null],
      ["รูปแบบข้อมูล", "วันเวลาเป็นเวลาไทย ข้อมูลซ้อนแสดงเป็น JSON; null คือค่าว่างที่บันทึกไว้", null],
      ...COLLECTION_NAMES.map((name) => [BACKUP_COLLECTIONS[name], name, backup.collections[name].length]),
    ],
    colWidths: [34, 80, 18],
  }];
  for (const name of COLLECTION_NAMES) {
    const records = backup.collections[name];
    const keys = new Set(records.flatMap((record) => Object.keys(record.data)));
    const fields = [...Object.keys(FIELD_LABELS).filter((key) => keys.has(key)),
      ...Array.from(keys).filter((key) => !Object.hasOwn(FIELD_LABELS, key)).sort()];
    if (records.length > 1048575 || fields.length > 16383) {
      throw new Error(`ข้อมูล ${BACKUP_COLLECTIONS[name]} เกินขนาดที่ Excel รองรับ กรุณาใช้ไฟล์ JSON`);
    }
    const rows = records.map((record) => [record.id, ...fields.map((field) => {
      const value = excelValue(record.data[field], field);
      if (typeof value === "string" && value.length > 32767) {
        throw new Error(`ข้อมูล ${BACKUP_COLLECTIONS[name]} (${field}) ยาวเกินขนาดเซลล์ Excel กรุณาใช้ไฟล์ JSON`);
      }
      return value;
    })]);
    sheets.push({
      name: BACKUP_COLLECTIONS[name],
      headers: ["รหัสเอกสาร", ...fields.map((field) => Object.hasOwn(FIELD_LABELS, field) ? FIELD_LABELS[field] : field)],
      rows,
      colWidths: [30, ...fields.map((field) => /At$/.test(field) || field === "timestamp" ? 28 : 24)],
    });
  }
  return sheets;
}

export async function downloadBackupExcel(backup: BackupFile): Promise<void> {
  const sheets = buildBackupExcelSheets(backup);
  const { downloadXlsx } = await import("./exports");
  await downloadXlsx(`ROTC-Export-${backup.createdAt.replace(/[:.]/g, "-")}.xlsx`, sheets);
}
