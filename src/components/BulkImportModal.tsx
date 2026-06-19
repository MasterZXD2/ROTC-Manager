"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  X, Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2, Trash2, Plus, Wand2,
} from "lucide-react";
import { bulkUpsertPendingStudents, type PendingStudentInput } from "@/lib/actions";
import { downloadXlsx } from "@/lib/exports";
import { useReviewFlow } from "@/components/ReviewBeforePrompt";
import type { EditorPayload } from "@/lib/editor-bus";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  callerUid: string;
  defaultYear: number;
  /** ถ้าเป็น top_admin ปล่อย null เพื่อรองรับทุกปี ถ้า admin_teacher ผูกปีเดียว */
  lockYear: boolean;
  open: boolean;
  onClose: () => void;
}

interface Row extends PendingStudentInput {
  /** internal key — ไม่ส่งไป Firestore */
  rid: string;
  /** เลือกเพื่อ import / bulk edit */
  selected: boolean;
  ok: boolean;
  error?: string;
}

let RID = 0;
const newRid = () => `r${++RID}`;

function validate(r: Omit<Row, "rid" | "selected" | "ok" | "error">, lockYear: boolean, defaultYear: number): { ok: boolean; error?: string } {
  if (!/^\d{4,12}$/.test(r.studentId)) return { ok: false, error: "รหัสนักเรียนผิด" };
  if (!r.fullName.trim()) return { ok: false, error: "ขาดชื่อ" };
  if (![1, 2, 3, 4, 5].includes(r.year)) return { ok: false, error: "ชั้นปีผิด" };
  if (lockYear && r.year !== defaultYear) return { ok: false, error: `จำกัดปี ${defaultYear}` };
  return { ok: true };
}

export function BulkImportModal({
  callerUid, defaultYear, lockYear, open, onClose,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [bulkYear, setBulkYear] = useState<string>("");
  const [bulkClassroom, setBulkClassroom] = useState<string>("");
  const review = useReviewFlow();

  const downloadTemplate = () => {
    downloadXlsx("template-นักเรียน", [{
      name: "template",
      headers: ["studentId", "fullName", "nickname", "classroom", "year"],
      rows: [
        ["12345", "สมชาย ใจดี", "ชาย", "4/2", defaultYear],
        ["12346", "สมหญิง ใจงาม", "หญิง", "4/2", defaultYear],
      ],
      colWidths: [12, 28, 12, 10, 6],
    }]);
  };

  const setRow = (rid: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => {
      if (r.rid !== rid) return r;
      const merged = { ...r, ...patch };
      const v = validate(merged, lockYear, defaultYear);
      return { ...merged, ok: v.ok, error: v.error };
    }));
  };

  const removeRow = (rid: string) =>
    setRows((prev) => prev.filter((r) => r.rid !== rid));

  const addBlankRow = () => {
    const r: Row = {
      rid: newRid(),
      studentId: "",
      fullName: "",
      nickname: "",
      classroom: "",
      year: defaultYear,
      selected: true,
      ok: false,
      error: "รหัสนักเรียนผิด",
    };
    setRows((prev) => [...prev, r]);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDone(null);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const parsed: Row[] = data.map((r) => {
        const studentId = String(r.studentId ?? r["เลข นร."] ?? r["รหัสนักเรียน"] ?? "").trim();
        const fullName = String(r.fullName ?? r["ชื่อ"] ?? r["ชื่อ-นามสกุล"] ?? "").trim();
        const nickname = String(r.nickname ?? r["ชื่อเล่น"] ?? "").trim();
        const classroom = String(r.classroom ?? r["ห้อง"] ?? r["ห้อง/ชั้น"] ?? "").trim();
        const yearRaw = r.year ?? r["ชั้นปี"] ?? r["ปี"] ?? defaultYear;
        const year = Number(yearRaw) || 0;

        const v = validate({ studentId, fullName, nickname, classroom, year }, lockYear, defaultYear);
        return { rid: newRid(), studentId, fullName, nickname, classroom, year, selected: v.ok, ...v };
      });

      const okCount = parsed.filter((r) => r.ok).length;

      // ถาม review บน desktop เท่านั้น
      const editorPayload: Omit<EditorPayload, "createdAt"> = {
        mode: "import",
        title: `นำเข้านักเรียน (${parsed.length} แถว)`,
        context: { kind: "import", target: "students", callerUid, defaultYear, lockYear },
        columns: [
          { key: "studentId", label: "เลข นร.", width: 120 },
          { key: "fullName", label: "ชื่อ-นามสกุล", width: 220 },
          { key: "nickname", label: "ชื่อเล่น", width: 100 },
          { key: "classroom", label: "ห้อง", width: 100 },
          {
            key: "year",
            label: "ปี",
            width: 80,
            type: lockYear ? "text" : "select",
            options: [1, 2, 3, 4, 5].map((y) => ({ value: y, label: `ปี ${y}` })),
            readOnly: lockYear,
          },
        ],
        rows: parsed.map((r) => ({
          studentId: r.studentId,
          fullName: r.fullName,
          nickname: r.nickname ?? "",
          classroom: r.classroom ?? "",
          year: r.year,
        })),
        returnTo: typeof window !== "undefined" ? window.location.pathname : "/",
      };

      review.trigger(editorPayload, () => {
        setRows(parsed);
        toast.success(`อ่านได้ ${parsed.length} แถว — พร้อม ${okCount} (กดเซลล์เพื่อแก้)`);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "อ่านไฟล์ไม่ได้");
    } finally {
      e.target.value = "";
    }
  };

  const selectedRows = useMemo(() => rows.filter((r) => r.selected), [rows]);

  if (!open) return null;
  const selectedOkCount = selectedRows.filter((r) => r.ok).length;
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const someSelected = rows.some((r) => r.selected);

  const toggleAll = () => {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, selected: next })));
  };

  const applyBulk = () => {
    if (!bulkYear && !bulkClassroom) {
      toast.warning("ใส่ปีหรือห้องที่ต้องการ apply ก่อน");
      return;
    }
    if (selectedRows.length === 0) {
      toast.warning("เลือกแถวก่อน");
      return;
    }
    const yearNum = bulkYear ? Number(bulkYear) : undefined;
    setRows((prev) => prev.map((r) => {
      if (!r.selected) return r;
      const merged = {
        ...r,
        ...(yearNum !== undefined ? { year: yearNum } : {}),
        ...(bulkClassroom ? { classroom: bulkClassroom } : {}),
      };
      const v = validate(merged, lockYear, defaultYear);
      return { ...merged, ok: v.ok, error: v.error };
    }));
    toast.success(`แก้ไข ${selectedRows.length} แถว`);
    setBulkYear("");
    setBulkClassroom("");
  };

  const removeSelected = () => {
    if (selectedRows.length === 0) return;
    setRows((prev) => prev.filter((r) => !r.selected));
    toast.success(`ลบ ${selectedRows.length} แถว`);
  };

  const submit = async () => {
    const valid = selectedRows.filter((r) => r.ok);
    if (valid.length === 0) {
      toast.warning("ไม่มีแถวที่เลือก + ใช้ได้");
      return;
    }
    setBusy(true);
    try {
      const r = await bulkUpsertPendingStudents(callerUid, valid);
      setDone(r);
      if (r.inserted > 0) toast.success(`เพิ่ม/อัปเดต ${r.inserted} คน`);
      if (r.skipped > 0) toast.warning(`ข้าม ${r.skipped} แถว`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const okCount = rows.filter((r) => r.ok).length;
  const errCount = rows.length - okCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl bg-background p-5 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">นำเข้านักเรียน (Excel/CSV)</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Card className="mb-3">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm">
              <FileSpreadsheet className="inline h-4 w-4 mr-1 text-blue-700" />
              คอลัมน์: <code className="text-xs">studentId, fullName, nickname, classroom, year</code>
            </p>
            <p className="text-xs text-muted-foreground">
              นักเรียนที่ pre-create เมื่อมา register ระบบจะ auto-fill ฟอร์มจากรหัส นร.
              {lockYear && ` · จำกัดปี ${defaultYear}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-1 h-4 w-4" />ดาวน์โหลดเทมเพลต
              </Button>
              <label className="cursor-pointer">
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
                <span className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-accent">
                  <Upload className="h-4 w-4" />เลือกไฟล์
                </span>
              </label>
              <Button variant="outline" size="sm" onClick={addBlankRow}>
                <Plus className="mr-1 h-4 w-4" />เพิ่มแถวเปล่า
              </Button>
            </div>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <>
            {/* bulk actions bar */}
            <Card className="mb-2 border-blue-300">
              <CardContent className="flex flex-wrap items-center gap-2 p-2 text-sm">
                <Wand2 className="h-4 w-4 text-blue-700" />
                <span className="text-xs text-muted-foreground">แก้รวมแถวที่เลือก ({selectedRows.length}):</span>
                {!lockYear && (
                  <select
                    value={bulkYear}
                    onChange={(e) => setBulkYear(e.target.value)}
                    className="h-8 rounded border bg-background px-2 text-xs"
                  >
                    <option value="">ปี...</option>
                    {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>ปี {y}</option>)}
                  </select>
                )}
                <Input
                  value={bulkClassroom}
                  onChange={(e) => setBulkClassroom(e.target.value)}
                  placeholder="ห้อง เช่น 4/2"
                  className="h-8 w-28 text-xs"
                />
                <Button size="sm" variant="outline" onClick={applyBulk} disabled={selectedRows.length === 0}>
                  Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={removeSelected} disabled={selectedRows.length === 0}>
                  <Trash2 className="mr-1 h-3 w-3" />ลบที่เลือก
                </Button>
              </CardContent>
            </Card>

            <div className="mb-2 flex items-center justify-between text-sm">
              <span>
                <CheckCircle2 className="inline h-4 w-4 text-green-600 mr-1" />
                ใช้ได้ {okCount}
                {errCount > 0 && (
                  <span className="ml-3">
                    <AlertCircle className="inline h-4 w-4 text-red-600 mr-1" />
                    ผิด {errCount}
                  </span>
                )}
                <span className="ml-3 text-muted-foreground">
                  เลือก {selectedRows.length} (พร้อม {selectedOkCount})
                </span>
              </span>
              <Button size="sm" onClick={submit} disabled={busy || selectedOkCount === 0}>
                {busy ? "กำลังเพิ่ม..." : `เพิ่ม ${selectedOkCount} คน`}
              </Button>
            </div>

            <Card>
              <CardContent className="p-0 max-h-[55dvh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background text-left text-muted-foreground border-b">
                    <tr>
                      <th className="px-2 py-1.5 w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                          onChange={toggleAll}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </th>
                      <th className="px-1 py-1.5">เลข นร.</th>
                      <th className="px-1 py-1.5">ชื่อ</th>
                      <th className="px-1 py-1.5">ชื่อเล่น</th>
                      <th className="px-1 py-1.5">ห้อง</th>
                      <th className="px-1 py-1.5">ปี</th>
                      <th className="px-2 py-1.5">สถานะ</th>
                      <th className="px-1 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rid} className={`border-b last:border-0 ${r.ok ? "" : "bg-red-50 dark:bg-red-950/30"}`}>
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={(e) => setRow(r.rid, { selected: e.target.checked })}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={r.studentId}
                            onChange={(e) => setRow(r.rid, { studentId: e.target.value.replace(/\D/g, "").slice(0, 12) })}
                            inputMode="numeric"
                            className="h-8 w-24 rounded border bg-background px-2"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={r.fullName}
                            onChange={(e) => setRow(r.rid, { fullName: e.target.value })}
                            className="h-8 w-44 rounded border bg-background px-2"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={r.nickname ?? ""}
                            onChange={(e) => setRow(r.rid, { nickname: e.target.value })}
                            className="h-8 w-20 rounded border bg-background px-2"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={r.classroom ?? ""}
                            onChange={(e) => setRow(r.rid, { classroom: e.target.value })}
                            className="h-8 w-20 rounded border bg-background px-2"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={r.year}
                            disabled={lockYear}
                            onChange={(e) => setRow(r.rid, { year: Number(e.target.value) })}
                            className="h-8 w-16 rounded border bg-background px-1 disabled:opacity-60"
                          >
                            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          {r.ok
                            ? <span className="text-green-700">ok</span>
                            : <span className="text-red-700">{r.error}</span>}
                        </td>
                        <td className="px-1 py-1">
                          <button
                            onClick={() => removeRow(r.rid)}
                            className="text-muted-foreground hover:text-destructive"
                            title="ลบแถว"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}

        {done && (
          <Card className="mt-3 border-green-300 bg-green-50 dark:bg-green-950/30">
            <CardContent className="p-3 text-sm">
              <div>เพิ่ม/อัปเดต: <b>{done.inserted}</b> คน</div>
              <div>ข้าม: <b>{done.skipped}</b> แถว</div>
              {done.errors.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted-foreground">รายละเอียด</summary>
                  <ul className="mt-1 max-h-32 overflow-y-auto text-xs">
                    {done.errors.map((e, i) => <li key={i}>· {e}</li>)}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {review.Element}
    </div>
  );
}
