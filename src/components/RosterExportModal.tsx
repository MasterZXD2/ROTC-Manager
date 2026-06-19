"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, Download, FileSpreadsheet } from "lucide-react";
import { downloadXlsx, todayStamp, buildSignInTemplateSheet, type Cell } from "@/lib/exports";
import { toast } from "sonner";
import type { UserDoc } from "@/lib/types";

interface ColumnDef {
  key: string;
  label: string;
  get: (u: UserDoc) => Cell;
  defaultOn: boolean;
  width?: number;
}

const COLUMNS: ColumnDef[] = [
  { key: "no",        label: "ลำดับ",        get: () => "",            defaultOn: true,  width: 6 },
  { key: "studentId", label: "เลข นร.",       get: (u) => u.studentId,  defaultOn: true,  width: 12 },
  { key: "fullName",  label: "ชื่อ (นศท.)",   get: (u) => u.fullName,   defaultOn: true,  width: 28 },
  { key: "nickname",  label: "ชื่อเล่น",       get: (u) => u.nickname,   defaultOn: false, width: 12 },
  { key: "classroom", label: "ห้อง/ชั้น",      get: (u) => u.classroom,  defaultOn: true,  width: 10 },
  { key: "year",      label: "ชั้นปี นศท.",    get: (u) => u.year,       defaultOn: false, width: 8 },
  { key: "email",     label: "อีเมล",          get: (u) => u.email,      defaultOn: false, width: 28 },
];

interface Props {
  year: number;
  open: boolean;
  onClose: () => void;
}

export function RosterExportModal({ year, open, onClose }: Props) {
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [picked, setPicked] = useState<Set<string>>(
    new Set(COLUMNS.filter((c) => c.defaultOn).map((c) => c.key)),
  );
  const [extraBlanks, setExtraBlanks] = useState<string>("");
  const [includeSignIn, setIncludeSignIn] = useState(true);

  useEffect(() => {
    if (!open) return;
    const q = query(
      collection(db(), "users"),
      where("year", "==", year),
      where("role", "==", "student"),
      orderBy("fullName"),
    );
    return onSnapshot(q, (s) => setStudents(s.docs.map((d) => d.data() as UserDoc)));
  }, [year, open]);

  const toggle = (key: string) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };

  const cols = useMemo(() => COLUMNS.filter((c) => picked.has(c.key)), [picked]);
  const blankCols = useMemo(
    () => extraBlanks.split(",").map((s) => s.trim()).filter(Boolean),
    [extraBlanks],
  );

  const exportNow = () => {
    if (cols.length === 0 && blankCols.length === 0) {
      toast.warning("เลือกอย่างน้อย 1 คอลัมน์");
      return;
    }
    if (students.length === 0) {
      toast.warning("ยังไม่มีนักเรียนในชั้นปีนี้");
      return;
    }
    const headers = [...cols.map((c) => c.label), ...blankCols];
    const rows = students.map((u, i) => [
      ...cols.map((c) => (c.key === "no" ? i + 1 : c.get(u))),
      ...blankCols.map(() => ""),
    ]);
    const colWidths = [
      ...cols.map((c) => c.width ?? 14),
      ...blankCols.map(() => 14),
    ];

    const sheets = [
      { name: `รายชื่อปี${year}`, headers, rows, colWidths },
      ...(includeSignIn
        ? [buildSignInTemplateSheet({ year, students })]
        : []),
    ];
    downloadXlsx(`รายชื่อ-ปี${year}-${todayStamp()}`, sheets);
    toast.success("ดาวน์โหลด Excel แล้ว");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">ส่งออกรายชื่อ ปี {year}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <p className="mb-2 text-sm text-muted-foreground">
          เลือกคอลัมน์ที่ต้องการ ({students.length} คน)
        </p>
        <Card className="mb-3">
          <CardContent className="p-3">
            <ul className="space-y-1">
              {COLUMNS.map((c) => (
                <li key={c.key}>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={picked.has(c.key)}
                      onChange={() => toggle(c.key)}
                      className="h-4 w-4"
                    />
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="mb-3">
          <label className="mb-1 block text-sm">คอลัมน์ว่างเพิ่มเติม (คั่นด้วย ,)</label>
          <input
            value={extraBlanks}
            onChange={(e) => setExtraBlanks(e.target.value)}
            placeholder="เช่น คะแนน,หมายเหตุ"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>

        <label className="mb-4 flex items-start gap-2 cursor-pointer rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            checked={includeSignIn}
            onChange={(e) => setIncludeSignIn(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1 font-medium">
              <FileSpreadsheet className="h-4 w-4" />
              เพิ่ม sheet ใบเซ็นชื่อ (16 วัน)
            </div>
            <div className="text-xs text-muted-foreground">
              ใส่อีก 1 sheet เผื่อพิมพ์ออกมาให้นักเรียนเซ็นมือ
            </div>
          </div>
        </label>

        <Button className="w-full" onClick={exportNow}>
          <Download className="mr-2 h-4 w-4" />ดาวน์โหลด Excel (.xlsx)
        </Button>
      </div>
    </div>
  );
}
