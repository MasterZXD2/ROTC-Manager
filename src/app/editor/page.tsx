"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Plus, Trash2, Wand2, Download, Upload, X, Check, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import {
  getEditorPayload, clearEditorPayload, type EditorPayload, type EditorColumn,
} from "@/lib/editor-bus";
import { downloadXlsx } from "@/lib/exports";
import { bulkUpsertPendingStudents, type PendingStudentInput } from "@/lib/actions";
import { toast } from "sonner";

type Row = Record<string, unknown> & { __rid: string; __selected: boolean };

let RID = 0;
const newRid = () => `r${++RID}`;

function EditorInner() {
  const router = useRouter();
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [bulkValues, setBulkValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const p = getEditorPayload();
    if (!p) return;
    setPayload(p);
    setRows(p.rows.map((r) => ({ ...r, __rid: newRid(), __selected: true })));
  }, []);

  const cols = payload?.columns ?? [];
  const selected = useMemo(() => rows.filter((r) => r.__selected), [rows]);
  const allSelected = rows.length > 0 && rows.every((r) => r.__selected);
  const someSelected = rows.some((r) => r.__selected);

  // สำหรับ import students: คำนวณจำนวนแถวที่ valid จริงๆ (เพื่อบอก count + กรองก่อนส่ง)
  const importStudentsValid = useMemo(() => {
    if (payload?.context.kind !== "import" || payload.context.target !== "students") {
      return null;
    }
    const ctx = payload.context;
    return selected.filter((r) => {
      const sid = String(r.studentId ?? "");
      if (!/^\d{4,12}$/.test(sid)) return false;
      if (!String(r.fullName ?? "").trim()) return false;
      const y = Number(r.year);
      if (![1, 2, 3, 4, 5].includes(y)) return false;
      if (ctx.lockYear && ctx.defaultYear && y !== ctx.defaultYear) return false;
      return true;
    });
  }, [payload, selected]);

  if (!payload) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">ไม่มีข้อมูลให้ตรวจสอบ</h1>
        <p className="text-sm text-muted-foreground">
          หน้านี้ใช้สำหรับ "ตรวจสอบก่อนนำเข้า/ส่งออก" — กลับไปหน้าหลักแล้วกด Import/Export อีกครั้ง
        </p>
        <Button onClick={() => router.replace("/")}>
          <ArrowLeft className="mr-1 h-4 w-4" />กลับหน้าหลัก
        </Button>
      </main>
    );
  }

  const setCell = (rid: string, key: string, val: string | number) => {
    setRows((prev) => prev.map((r) => (r.__rid === rid ? { ...r, [key]: val } : r)));
  };

  const toggle = (rid: string) =>
    setRows((prev) => prev.map((r) => (r.__rid === rid ? { ...r, __selected: !r.__selected } : r)));

  const toggleAll = () => {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, __selected: next })));
  };

  const addRow = () => {
    const blank: Row = { __rid: newRid(), __selected: true } as Row;
    for (const c of cols) blank[c.key] = c.type === "number" ? 0 : "";
    setRows((prev) => [...prev, blank]);
  };

  const delSelected = () => {
    if (selected.length === 0) return;
    setRows((prev) => prev.filter((r) => !r.__selected));
    toast.success(`ลบ ${selected.length} แถว`);
  };

  const applyBulk = () => {
    const keys = Object.keys(bulkValues).filter((k) => bulkValues[k] !== "");
    if (keys.length === 0) {
      toast.warning("ใส่ค่าที่ต้องการ apply ก่อน");
      return;
    }
    if (selected.length === 0) {
      toast.warning("เลือกแถวก่อน");
      return;
    }
    setRows((prev) => prev.map((r) => {
      if (!r.__selected) return r;
      const next = { ...r };
      for (const k of keys) {
        const col = cols.find((c) => c.key === k);
        const v = bulkValues[k];
        next[k] = col?.type === "number" ? Number(v) || 0 : v;
      }
      return next;
    }));
    toast.success(`แก้ ${selected.length} แถว`);
    setBulkValues({});
  };

  const exit = () => {
    clearEditorPayload();
    router.replace(payload.returnTo || "/");
  };

  const finish = async () => {
    setBusy(true);
    try {
      if (payload.context.kind === "import") {
        const ctx = payload.context;
        if (ctx.target === "students") {
          const valid = importStudentsValid ?? [];
          const inputs: PendingStudentInput[] = valid.map((r) => ({
            studentId: String(r.studentId),
            fullName: String(r.fullName || "").trim(),
            nickname: String(r.nickname || "").trim(),
            classroom: String(r.classroom || "").trim(),
            year: Number(r.year),
          }));
          if (inputs.length === 0) {
            toast.warning("ไม่มีแถวที่ใช้ได้");
            return;
          }
          const result = await bulkUpsertPendingStudents(ctx.callerUid, inputs);
          toast.success(`เพิ่ม/อัปเดต ${result.inserted} คน`);
          if (result.skipped > 0) toast.warning(`ข้าม ${result.skipped} แถว`);
          clearEditorPayload();
          router.replace(payload.returnTo || "/");
        }
      } else if (payload.context.kind === "export") {
        const ctx = payload.context;
        const headers = cols.map((c) => c.label);
        const data = selected.map((r) => cols.map((c) => {
          const v = r[c.key];
          if (typeof v === "string" || typeof v === "number") return v;
          return v == null ? "" : String(v);
        }));
        downloadXlsx(ctx.filename, [{
          name: ctx.sheetName || "ข้อมูล",
          headers,
          rows: data,
          colWidths: cols.map((c) => c.width ? Math.round(c.width / 8) : 15),
        }]);
        toast.success("ดาวน์โหลด Excel แล้ว");
        clearEditorPayload();
        router.replace(payload.returnTo || "/");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={exit}>
            <ArrowLeft className="mr-1 h-4 w-4" />กลับ
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">
              {payload.mode === "import" ? "ตรวจสอบก่อนนำเข้า" : "ตรวจสอบก่อนส่งออก"}
            </div>
            <div className="font-semibold">{payload.title}</div>
          </div>
        </div>
        <Button onClick={finish} disabled={busy || (payload.mode === "import"
          ? (importStudentsValid?.length ?? 0) === 0
          : selected.length === 0)}>
          {payload.mode === "import" ? (
            <>
              <Upload className="mr-1 h-4 w-4" />
              นำเข้า {importStudentsValid?.length ?? selected.length} แถว
              {importStudentsValid && importStudentsValid.length < selected.length && (
                <span className="ml-1 text-xs opacity-70">
                  ({selected.length - importStudentsValid.length} ผิด)
                </span>
              )}
            </>
          ) : (
            <><Download className="mr-1 h-4 w-4" />ดาวน์โหลด {selected.length} แถว</>
          )}
        </Button>
      </header>

      {/* bulk action bar */}
      <div className="border-b bg-muted/40 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Wand2 className="h-4 w-4 text-blue-700" />
          <span className="text-xs text-muted-foreground">
            แก้รวมแถวที่เลือก ({selected.length}/{rows.length}):
          </span>
          {cols.filter((c) => !c.readOnly).map((c) => (
            <BulkInput
              key={c.key}
              col={c}
              value={bulkValues[c.key] ?? ""}
              onChange={(v) => setBulkValues((b) => ({ ...b, [c.key]: v }))}
            />
          ))}
          <Button size="sm" variant="outline" onClick={applyBulk} disabled={selected.length === 0}>
            Apply
          </Button>
          <span className="mx-2 h-5 border-l" />
          <Button size="sm" variant="ghost" onClick={addRow}>
            <Plus className="mr-1 h-3 w-3" />เพิ่มแถว
          </Button>
          <Button size="sm" variant="ghost" onClick={delSelected} disabled={selected.length === 0}>
            <Trash2 className="mr-1 h-3 w-3" />ลบที่เลือก
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </th>
                  {cols.map((c) => (
                    <th key={c.key} className="px-2 py-2" style={{ minWidth: c.width ?? 120 }}>
                      {c.label}
                    </th>
                  ))}
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.__rid} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-1">
                      <input
                        type="checkbox"
                        checked={r.__selected}
                        onChange={() => toggle(r.__rid)}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    {cols.map((c) => {
                      const raw = r[c.key];
                      const safe: string | number =
                        typeof raw === "string" || typeof raw === "number"
                          ? raw
                          : raw == null ? "" : String(raw);
                      return (
                        <td key={c.key} className="px-1 py-1">
                          <CellInput
                            col={c}
                            value={safe}
                            onChange={(v) => setCell(r.__rid, c.key, v)}
                          />
                        </td>
                      );
                    })}
                    <td className="px-1 py-1">
                      <button
                        onClick={() => setRows((prev) => prev.filter((x) => x.__rid !== r.__rid))}
                        className="text-muted-foreground hover:text-destructive"
                        title="ลบแถว"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={cols.length + 2} className="py-12 text-center text-sm text-muted-foreground">
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function CellInput({
  col, value, onChange,
}: {
  col: EditorColumn;
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  if (col.readOnly) {
    return <span className="block px-2 py-1.5 text-muted-foreground">{String(value)}</span>;
  }
  if (col.type === "select" && col.options) {
    return (
      <select
        value={String(value)}
        onChange={(e) => {
          const opt = col.options!.find((o) => String(o.value) === e.target.value);
          onChange(opt ? opt.value : e.target.value);
        }}
        className="h-8 w-full rounded border bg-background px-1"
      >
        {col.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={col.type === "number" ? "number" : "text"}
      value={String(value)}
      onChange={(e) => onChange(col.type === "number" ? Number(e.target.value) || 0 : e.target.value)}
      className="h-8 w-full rounded border bg-background px-2"
    />
  );
}

function BulkInput({
  col, value, onChange,
}: {
  col: EditorColumn;
  value: string;
  onChange: (v: string) => void;
}) {
  if (col.type === "select" && col.options) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded border bg-background px-2 text-xs"
      >
        <option value="">{col.label}...</option>
        {col.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={col.label}
      className="h-8 w-28 text-xs"
    />
  );
}

export default function Page() {
  return (
    <RequireRole allow={["admin_teacher", "admin_student", "admin", "top_admin"]}>
      <EditorInner />
    </RequireRole>
  );
}
