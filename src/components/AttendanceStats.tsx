"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CheckinDoc, DutyLogDoc, GroupDoc, AttendanceExemptionDoc } from "@/lib/types";
import { CheckCircle2, XCircle, UserCheck, Clock } from "lucide-react";
import { exemptAttendance, unexemptAttendance } from "@/lib/actions";
import { toast } from "sonner";

interface Props {
  /** ชั้นปี — null = ทุกชั้นปี (top admin) */
  year: number | null;
  callerUid: string;
}

const REQUIRED_ROUNDS = 2; // เช็คอิน + เช็คเอาท์
const MAX_HISTORY = 6; // จำนวนกล่องประวัติย้อนหลัง

function dayKeyOf(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ts));
}

function startOfDayBangkok(dayKey: string): number {
  return new Date(dayKey + "T00:00:00+07:00").getTime();
}

function thaiDate(dayKey: string): string {
  const [y, m, d] = dayKey.split("-");
  const beYear = (parseInt(y, 10) + 543) % 100;
  return `${parseInt(d, 10)}/${parseInt(m, 10)}/${beYear}`;
}

type MemberRow = {
  uid: string;
  fullName: string;
  nickname: string;
  classroom: string;
  rounds: number;
  exempted: boolean;
  present: boolean;
};

// PLACEHOLDER_BODY

/** จราจรปัจจุบัน = กลุ่มแรกที่ยังไม่ติ๊ก (ต้องเช็คอินวันนี้)
 *  จราจรต่อไป = กลุ่มที่ 2 ที่ยังไม่ติ๊ก (แสดงแค่รายชื่อ)
 *  ประวัติ = กลุ่มที่ติ๊กแล้ว (dutyLogs) เรียงวันล่าสุด */
export function AttendanceStats({ year, callerUid }: Props) {
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [dutyLogs, setDutyLogs] = useState<DutyLogDoc[]>([]);
  const [checkins, setCheckins] = useState<CheckinDoc[]>([]);
  const [exemptions, setExemptions] = useState<AttendanceExemptionDoc[]>([]);

  const todayKey = dayKeyOf(Date.now());

  useEffect(() => {
    const base = collection(db(), "groups");
    const q = year === null ? query(base) : query(base, where("year", "==", year));
    return onSnapshot(q, (s) => setGroups(s.docs.map((d) => d.data() as GroupDoc)));
  }, [year]);

  useEffect(() => {
    const base = collection(db(), "dutyLogs");
    const q = year === null
      ? query(base, orderBy("checkedAt", "desc"), limit(MAX_HISTORY))
      : query(base, where("year", "==", year), orderBy("checkedAt", "desc"), limit(MAX_HISTORY));
    return onSnapshot(q, (s) => setDutyLogs(s.docs.map((d) => d.data() as DutyLogDoc)));
  }, [year]);

  const earliestStart = useMemo(() => {
    const keys = [todayKey, ...dutyLogs.map((l) => l.dayKey)].sort();
    return startOfDayBangkok(keys[0]);
  }, [dutyLogs, todayKey]);

  useEffect(() => {
    const base = collection(db(), "checkins");
    const q = year === null
      ? query(base, where("timestamp", ">=", earliestStart))
      : query(base, where("year", "==", year), where("timestamp", ">=", earliestStart));
    return onSnapshot(q, (s) => setCheckins(s.docs.map((d) => d.data() as CheckinDoc)));
  }, [year, earliestStart]);

  const dayKeys = useMemo(
    () => Array.from(new Set([todayKey, ...dutyLogs.map((l) => l.dayKey)])),
    [dutyLogs, todayKey],
  );

  useEffect(() => {
    if (dayKeys.length === 0) { setExemptions([]); return; }
    const base = collection(db(), "attendanceExemptions");
    const q = year === null
      ? query(base, where("dayKey", "in", dayKeys))
      : query(base, where("dayKey", "in", dayKeys), where("year", "==", year));
    return onSnapshot(q, (s) =>
      setExemptions(s.docs.map((d) => d.data() as AttendanceExemptionDoc)),
    );
  }, [year, dayKeys.join(",")]);

  const roundsByDayUid = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const c of checkins) {
      const dk = dayKeyOf(c.timestamp);
      if (!m.has(dk)) m.set(dk, new Map());
      m.get(dk)!.set(c.userId, (m.get(dk)!.get(c.userId) ?? 0) + 1);
    }
    return m;
  }, [checkins]);

  const exemptedByDay = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of exemptions) {
      if (!m.has(e.dayKey)) m.set(e.dayKey, new Set());
      m.get(e.dayKey)!.add(e.studentUid);
    }
    return m;
  }, [exemptions]);

  const computeMembers = (
    members: { uid: string; fullName: string; nickname: string; classroom: string }[],
    dayKey: string,
  ): MemberRow[] => {
    const rounds = roundsByDayUid.get(dayKey) ?? new Map<string, number>();
    const exempted = exemptedByDay.get(dayKey) ?? new Set<string>();
    return members.map((m) => {
      const r = rounds.get(m.uid) ?? 0;
      const ex = exempted.has(m.uid);
      return {
        uid: m.uid, fullName: m.fullName, nickname: m.nickname, classroom: m.classroom,
        rounds: r, exempted: ex, present: ex || r >= REQUIRED_ROUNDS,
      };
    });
  };

  // จราจรปัจจุบัน + ต่อไป ต่อชั้นปี (กลุ่มที่ยังไม่ติ๊ก เรียงตาม order??number)
  const dutyByYear = useMemo(() => {
    const byYear = new Map<number, GroupDoc[]>();
    for (const g of groups) {
      if (!byYear.has(g.year)) byYear.set(g.year, []);
      byYear.get(g.year)!.push(g);
    }
    const rows: { current: GroupDoc | null; next: GroupDoc | null; year: number }[] = [];
    for (const [yr, list] of byYear.entries()) {
      const pending = [...list]
        .filter((g) => !g.checkStatus)
        .sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number));
      rows.push({ year: yr, current: pending[0] ?? null, next: pending[1] ?? null });
    }
    return rows.sort((a, b) => a.year - b.year);
  }, [groups]);

  const onExempt = async (m: MemberRow, ctx: { year: number; dayKey: string }) => {
    try {
      await exemptAttendance(callerUid, {
        studentUid: m.uid, year: ctx.year, dayKey: ctx.dayKey, reason: "ยกเว้นโดยแอดมิน",
      });
      toast.success(`ยกเว้นการขาดให้ ${m.nickname || m.fullName} แล้ว`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    }
  };

  const onUnexempt = async (m: MemberRow, dayKey: string) => {
    try {
      await unexemptAttendance(callerUid, { studentUid: m.uid, dayKey });
      toast.success(`ยกเลิกการยกเว้นของ ${m.nickname || m.fullName} แล้ว`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    }
  };

  if (groups.length === 0 && dutyLogs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          ยังไม่มีกลุ่มจราจร — สร้างกลุ่มในแถบ &quot;กลุ่มจราจร&quot; ก่อน
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {dutyByYear.map(({ current, next, year: yr }) => (
        <div key={`duty-${yr}`} className="space-y-3">
          {current && (
            <CurrentDutyCard
              group={current}
              members={computeMembers(current.members, todayKey)}
              showYear={year === null}
              onExempt={(m) => onExempt(m, { year: current.year, dayKey: todayKey })}
              onUnexempt={(m) => onUnexempt(m, todayKey)}
            />
          )}
          {next && <NextDutyCard group={next} showYear={year === null} />}
        </div>
      ))}

      {dutyLogs.length > 0 && (
        <div className="pt-1">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">ประวัติเวร</h3>
          <div className="space-y-3">
            {dutyLogs.map((log) => {
              const members = computeMembers(log.members, log.dayKey);
              const presentCount = members.filter((m) => m.present).length;
              return (
                <HistoryCard
                  key={log.id}
                  log={log}
                  members={members}
                  presentCount={presentCount}
                  showYear={year === null}
                  isToday={log.dayKey === todayKey}
                  onExempt={(m) => onExempt(m, { year: log.year, dayKey: log.dayKey })}
                  onUnexempt={(m) => onUnexempt(m, log.dayKey)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- การ์ดจราจรปัจจุบัน (ต้องเช็คอินวันนี้) ---------- */
function CurrentDutyCard({
  group, members, showYear, onExempt, onUnexempt,
}: {
  group: GroupDoc;
  members: MemberRow[];
  showYear: boolean;
  onExempt: (m: MemberRow) => void;
  onUnexempt: (m: MemberRow) => void;
}) {
  const presentCount = members.filter((m) => m.present).length;
  return (
    <Card className="border-primary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            กลุ่ม {group.number}
            {showYear && <span className="text-xs font-normal text-muted-foreground">· ปี {group.year}</span>}
            <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              จราจรวันนี้
            </span>
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${
              members.length > 0 && presentCount === members.length
                ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            มา {presentCount}/{members.length}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">กลุ่มที่ต้องทำเวรวันนี้ — ติ๊กในแถบ &quot;กลุ่มจราจร&quot; เมื่อยืนยัน</p>
      </CardHeader>
      <CardContent>
        <MemberList members={members} onExempt={onExempt} onUnexempt={onUnexempt} />
      </CardContent>
    </Card>
  );
}

/* ---------- การ์ดจราจรต่อไป (แค่รายชื่อ) ---------- */
function NextDutyCard({ group, showYear }: { group: GroupDoc; showYear: boolean }) {
  return (
    <Card className="border-dashed border-muted-foreground/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            กลุ่ม {group.number}
            {showYear && <span className="text-xs font-normal text-muted-foreground">· ปี {group.year}</span>}
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">จราจรต่อไป</span>
          </span>
          <span className="text-xs text-muted-foreground">{group.members.length} คน</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">เข้าเวรหลังกลุ่มปัจจุบันทำเสร็จ</p>
      </CardHeader>
      <CardContent>
        {group.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีสมาชิกในกลุ่ม</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {group.members.map((m) => (
              <span key={m.uid} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {m.nickname || m.fullName}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- การ์ดประวัติเวร ---------- */
function HistoryCard({
  log, members, presentCount, showYear, isToday, onExempt, onUnexempt,
}: {
  log: DutyLogDoc;
  members: MemberRow[];
  presentCount: number;
  showYear: boolean;
  isToday: boolean;
  onExempt: (m: MemberRow) => void;
  onUnexempt: (m: MemberRow) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>
            กลุ่ม {log.groupNumber}
            {showYear && <span className="ml-1 text-xs font-normal text-muted-foreground">· ปี {log.year}</span>}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${
              members.length - presentCount === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            มา {presentCount}/{members.length}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {isToday ? "วันนี้" : thaiDate(log.dayKey)} · เข้าเวรโดย {log.checkedByName}
        </p>
      </CardHeader>
      <CardContent>
        <MemberList members={members} onExempt={onExempt} onUnexempt={onUnexempt} />
      </CardContent>
    </Card>
  );
}

/* ---------- รายชื่อสมาชิก + ปุ่มยกเว้น ---------- */
function MemberList({
  members, onExempt, onUnexempt,
}: {
  members: MemberRow[];
  onExempt: (m: MemberRow) => void;
  onUnexempt: (m: MemberRow) => void;
}) {
  if (members.length === 0)
    return <p className="text-sm text-muted-foreground">ไม่มีสมาชิกในกลุ่ม</p>;
  return (
    <ul className="space-y-1">
      {members.map((m) => (
        <li
          key={m.uid}
          className={`flex items-center justify-between gap-2 rounded border p-2 text-sm ${
            m.present
              ? m.exempted ? "border-green-200 bg-green-50" : "border-transparent"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {m.present ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-red-500" />
            )}
            <div className="min-w-0">
              <div className="truncate">{m.fullName}</div>
              <div className="text-xs text-muted-foreground">
                {m.classroom}
                {m.exempted ? " · ยกเว้น (นับเป็นมา)" : ` · เช็คอิน ${m.rounds}/${REQUIRED_ROUNDS}`}
              </div>
            </div>
          </div>
          {!m.present ? (
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => onExempt(m)}>
              <UserCheck className="mr-1 h-3 w-3" />
              ยกเว้น
            </Button>
          ) : m.exempted ? (
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onUnexempt(m)}>
              ยกเลิก
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
