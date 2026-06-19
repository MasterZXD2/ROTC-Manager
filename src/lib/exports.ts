/* CSV + Excel export utilities */

import * as XLSX from "xlsx";

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

/* ---------- Excel (.xlsx) export ---------- */

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: Cell[][];
  /** ความกว้างคอลัมน์ (อักษร) — ถ้าไม่ส่งจะ auto-size */
  colWidths?: number[];
}

export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa: Cell[][] = [s.headers, ...s.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // auto width = max length of column content (cap 60)
    const widths = s.colWidths ?? s.headers.map((h, i) => {
      const max = Math.max(
        String(h).length,
        ...s.rows.map((r) => String(r[i] ?? "").length),
      );
      return Math.min(Math.max(max + 2, 8), 60);
    });
    ws["!cols"] = widths.map((w) => ({ wch: w }));

    // ตัด sheet name ให้ <= 31 ตัว (ลิมิตของ Excel)
    const safeName = s.name.slice(0, 31).replace(/[\\/?*[\]]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
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

