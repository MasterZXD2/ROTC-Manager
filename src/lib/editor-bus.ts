"use client";

/**
 * Editor session bus — ใช้ sessionStorage ส่งข้อมูลระหว่างหน้า
 * ที่กด export/import กับหน้า /editor
 */

export type EditorMode = "import" | "export";

export interface EditorPayload {
  mode: EditorMode;
  /** ใช้แสดงในหัวข้อ (เช่น "นำเข้านักเรียน", "ส่งออกประวัติ check-in") */
  title: string;
  /** ใช้บอกว่าเสร็จแล้วต้องไปไหน + ทำอะไร */
  context: ImportContext | ExportContext;
  /** ลำดับคอลัมน์ */
  columns: EditorColumn[];
  /** ข้อมูลแถว — แต่ละแถวเป็น Record */
  rows: Record<string, string | number>[];
  /** หน้าเดิมที่จะกลับไปเมื่อยกเลิก */
  returnTo: string;
  createdAt: number;
}

export interface EditorColumn {
  key: string;
  label: string;
  /** ความกว้างคอลัมน์ (px) — optional */
  width?: number;
  /** ประเภทช่อง — สำหรับ render input */
  type?: "text" | "number" | "select";
  /** ตัวเลือกถ้า type=select */
  options?: Array<{ value: string | number; label: string }>;
  /** ห้ามแก้ไข */
  readOnly?: boolean;
}

export interface ImportContext {
  kind: "import";
  /** เช่น "students" — สำหรับ logic apply ที่หน้า editor */
  target: "students";
  /** uid ของคนที่จะ apply */
  callerUid: string;
  /** ข้อมูลเสริมเฉพาะแต่ละ target */
  defaultYear?: number;
  lockYear?: boolean;
}

export interface ExportContext {
  kind: "export";
  /** ชื่อไฟล์ที่จะ download */
  filename: string;
  /** ชื่อ sheet ใน xlsx */
  sheetName?: string;
}

const KEY = "rotc-editor-payload";

export function setEditorPayload(p: EditorPayload) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export function getEditorPayload(): EditorPayload | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EditorPayload;
  } catch {
    return null;
  }
}

export function clearEditorPayload() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** check ว่าอยู่บน desktop (≥ 768px) — ถ้า mobile ไม่ต้องแสดง popup ตรวจสอบ */
export function isDesktopViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 768px)").matches;
}
