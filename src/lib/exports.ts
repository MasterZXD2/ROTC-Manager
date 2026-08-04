/* CSV + Excel export utilities — uses exceljs (replaces xlsx 0.18.5) */

import ExcelJS from "exceljs";

export type Cell = string | number | null | undefined;

function escape(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) lines.push(r.map(escape).join(","));
  return "﻿" + lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function todayStamp(): string {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d);
}

export function thaiDateTime(ts: number): string {
  return new Date(ts).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

/* ---------- Excel (.xlsx) helpers ---------- */

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: Cell[][];
  /** ความกว้างคอลัมน์ (อักษร) — ถ้าไม่ส่งจะ auto-size */
  colWidths?: number[];
}

/** Helper: อ่าน ExcelJS Worksheet เป็น array ของ JSON objects (เทียบเท่า XLSX.utils.sheet_to_json) */
export function wsToJson(ws: ExcelJS.Worksheet, defval: unknown = ""): Record<string, unknown>[] {
  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];
  let firstRow = true;
  ws.eachRow((row) => {
    if (firstRow) {
      firstRow = false;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value ?? "");
      });
      return;
    }
    const obj: Record<string, unknown> = {};
    headers.forEach((h, colNum) => {
      if (!h) return;
      obj[h] = row.getCell(colNum).value ?? defval;
    });
    rows.push(obj);
  });
  return rows;
}

/** Helper: เขียน array ของ JSON objects ลง worksheet (เทียบเท่า XLSX.utils.json_to_sheet) */
export function addJsonSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  records: Record<string, unknown>[],
): void {
  const ws = wb.addWorksheet(sheetName);
  if (records.length === 0) return;
  const keys = Array.from(new Set(records.flatMap(Object.keys)));
  const headerRow = ws.addRow(keys);
  headerRow.font = { bold: true };
  records.forEach((r) => ws.addRow(keys.map((k) => r[k] ?? "")));
}

export async function downloadXlsx(filename: string, sheets: XlsxSheet[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const safeName = s.name.slice(0, 31).replace(/[\\/?*[\]]/g, "_");
    const ws = wb.addWorksheet(safeName);

    const widths = s.colWidths ?? s.headers.map((h, i) => {
      const max = Math.max(
        String(h).length,
        ...s.rows.map((r) => String(r[i] ?? "").length),
      );
      return Math.min(Math.max(max + 2, 8), 60);
    });

    ws.columns = widths.map((w) => ({ width: w }));

    const headerRow = ws.addRow(s.headers);
    headerRow.font = { bold: true };

    for (const row of s.rows) {
      ws.addRow(row.map((c) => c ?? ""));
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** สร้างเทมเพลตใบเซ็นชื่อ (16 วัน 1 หน้า) */
export function buildSignInTemplateSheet(args: {
  year: number;
  classroom?: string;
  students: Array<{ studentId: string; fullName: string; nickname?: string }>;
}): XlsxSheet {
  const dateCols = Array.from({ length: 16 }, (_, i) => `วันที่ ${i + 1}`);
  const headers = ["ลำดับ", "เลข นร.", "ชื่อ-นามสกุล", "ชื่อเล่น", ...dateCols];
  const rows = args.students.map((s, i) => [
    i + 1,
    s.studentId,
    s.fullName,
    s.nickname ?? "",
    ...Array(16).fill(""),
  ]);
  const colWidths = [6, 12, 28, 12, ...Array(16).fill(8)];
  return {
    name: `ใบเซ็นปี${args.year}${args.classroom ? `-${args.classroom}` : ""}`,
    headers,
    rows,
    colWidths,
  };
}
