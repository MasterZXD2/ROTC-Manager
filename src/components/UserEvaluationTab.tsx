"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Check, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { setCharacterEvaluation } from "@/lib/actions";
import type {
  ActivityCheckinDoc,
  ActivityDoc,
  ActivityExemptionDoc,
  CharacterEvaluationDoc,
  TaskCompletionDoc,
  TaskDoc,
  UserDoc,
  YearConfigDoc,
} from "@/lib/types";
import { DEFAULT_PASSING_PERCENT } from "@/lib/types";
import type { EditorColumn } from "@/lib/editor-bus";
import { useReviewFlow } from "@/components/ReviewBeforePrompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  callerUid: string;
  users?: UserDoc[];
  yearScope?: number | null;
}

type SortMode = "name" | "classroom" | "result";

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "th", { numeric: true, sensitivity: "base" });
}

export function UserEvaluationTab({ callerUid, users, yearScope = null }: Props) {
  const [loadedUsers, setLoadedUsers] = useState<UserDoc[]>([]);
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [completions, setCompletions] = useState<TaskCompletionDoc[]>([]);
  const [activities, setActivities] = useState<ActivityDoc[]>([]);
  const [activityCheckins, setActivityCheckins] = useState<ActivityCheckinDoc[]>([]);
  const [activityExemptions, setActivityExemptions] = useState<ActivityExemptionDoc[]>([]);
  const [evaluations, setEvaluations] = useState<CharacterEvaluationDoc[]>([]);
  const [yearConfigs, setYearConfigs] = useState<YearConfigDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const review = useReviewFlow();
  const loadKey = useMemo(() => ({ users, yearScope }), [users, yearScope]);
  const [loadState, setLoadState] = useState<{
    key: typeof loadKey;
    ready: boolean;
    error: boolean;
  } | null>(null);
  const loadError = loadState?.key === loadKey && loadState.error;
  const dataReady = loadState?.key === loadKey && loadState.ready && !loadError;

  useEffect(() => {
    const pending = new Set([
      "tasks", "taskCompletions", "activities", "activityCheckins",
      "activityExemptions", "characterEvaluations", "yearConfigs",
      ...(loadKey.users ? [] : ["users"]),
    ]);
    const unsubscribers: Array<() => void> = [];
    let active = true;
    let failed = false;
    setLoadState({ key: loadKey, ready: false, error: false });

    const subscribe = <Doc,>(name: string, setDocs: (docs: Doc[]) => void) => {
      const source = loadKey.yearScope && name !== "yearConfigs"
        ? query(collection(db(), name), where("year", "==", loadKey.yearScope))
        : query(collection(db(), name));
      unsubscribers.push(onSnapshot(source, { includeMetadataChanges: true }, (snapshot) => {
        if (!active) return;
        setDocs(snapshot.docs.map((doc) => doc.data() as Doc));
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          pending.add(name);
        } else {
          pending.delete(name);
        }
        setLoadState({ key: loadKey, ready: pending.size === 0, error: failed });
      }, () => {
        if (!active) return;
        failed = true;
        setLoadState({ key: loadKey, ready: false, error: true });
      }));
    };

    if (!loadKey.users) subscribe<UserDoc>("users", setLoadedUsers);
    subscribe<TaskDoc>("tasks", setTasks);
    subscribe<TaskCompletionDoc>("taskCompletions", setCompletions);
    subscribe<ActivityDoc>("activities", setActivities);
    subscribe<ActivityCheckinDoc>("activityCheckins", setActivityCheckins);
    subscribe<ActivityExemptionDoc>("activityExemptions", setActivityExemptions);
    subscribe<CharacterEvaluationDoc>("characterEvaluations", setEvaluations);
    subscribe<YearConfigDoc>("yearConfigs", setYearConfigs);

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadKey]);

  const rows = useMemo(() => {
    const sourceUsers = (users ?? loadedUsers)
      .filter((u) => u.role === "student" || u.role === "admin_student")
      .filter((u) => (yearScope ? u.year === yearScope : true));

    const tasksByYear = new Map<number, TaskDoc[]>();
    for (const task of tasks) {
      if (!tasksByYear.has(task.year)) tasksByYear.set(task.year, []);
      tasksByYear.get(task.year)!.push(task);
    }

    const doneByStudent = new Map<string, Set<string>>();
    for (const item of completions) {
      if (!item.done) continue;
      if (!doneByStudent.has(item.studentUid)) doneByStudent.set(item.studentUid, new Set());
      doneByStudent.get(item.studentUid)!.add(item.taskId);
    }

    const activitiesByYear = new Map<number, ActivityDoc[]>();
    const normalActivityIds = new Set<string>();
    for (const activity of activities) {
      if (activity.type === "external") continue;
      normalActivityIds.add(activity.id);
      if (!activitiesByYear.has(activity.year)) activitiesByYear.set(activity.year, []);
      activitiesByYear.get(activity.year)!.push(activity);
    }

    const attendedActivitiesByStudent = new Map<string, Set<string>>();
    for (const checkin of activityCheckins) {
      // นับเฉพาะ check-in ของกิจกรรมประเภท normal เท่านั้น
      if (!normalActivityIds.has(checkin.activityId)) continue;
      if (!attendedActivitiesByStudent.has(checkin.userId)) {
        attendedActivitiesByStudent.set(checkin.userId, new Set());
      }
      attendedActivitiesByStudent.get(checkin.userId)!.add(checkin.activityId);
    }
    for (const exemption of activityExemptions) {
      // ยกเว้นเฉพาะกิจกรรม normal เท่านั้น
      if (!normalActivityIds.has(exemption.activityId)) continue;
      if (!attendedActivitiesByStudent.has(exemption.studentUid)) {
        attendedActivitiesByStudent.set(exemption.studentUid, new Set());
      }
      attendedActivitiesByStudent.get(exemption.studentUid)!.add(exemption.activityId);
    }

    const evaluatedByStudent = new Map<string, boolean>();
    for (const evaluation of evaluations) {
      evaluatedByStudent.set(`${evaluation.year}_${evaluation.studentUid}`, evaluation.evaluated);
    }

    const passingPercentByYear = new Map(
      yearConfigs.map((config) => [config.year, config.passingPercent]),
    );

    return sourceUsers.map((user) => {
      const yearTasks = tasksByYear.get(user.year) ?? [];
      const doneCount = yearTasks.filter((task) => doneByStudent.get(user.uid)?.has(task.id)).length;
      const taskPercent = yearTasks.length > 0 ? Math.round((doneCount / yearTasks.length) * 100) : 0;
      const passingPercent = passingPercentByYear.get(user.year) ?? DEFAULT_PASSING_PERCENT;
      const taskPassed = taskPercent >= passingPercent;

      const yearActivities = activitiesByYear.get(user.year) ?? [];
      const activityCount = yearActivities.filter((activity) =>
        attendedActivitiesByStudent.get(user.uid)?.has(activity.id),
      ).length;
      const missedActivityCount = Math.max(0, yearActivities.length - activityCount);
      const activityPassed = missedActivityCount <= 4;
      const evaluated = evaluatedByStudent.get(`${user.year}_${user.uid}`) === true;

      return {
        user,
        taskPercent,
        passingPercent,
        taskPassed,
        doneCount,
        taskTotal: yearTasks.length,
        activityCount,
        activityTotal: yearActivities.length,
        missedActivityCount,
        activityPassed,
        evaluated,
        passed: taskPassed && activityPassed && evaluated,
      };
    }).sort((a, b) => {
      const nameA = a.user.fullName || a.user.email || a.user.uid;
      const nameB = b.user.fullName || b.user.email || b.user.uid;
      if (sortMode === "classroom") {
        return compareText(a.user.classroom || "", b.user.classroom || "") || compareText(nameA, nameB);
      }
      if (sortMode === "result" && a.passed !== b.passed) return a.passed ? -1 : 1;
      return compareText(nameA, nameB);
    });
  }, [
    users, loadedUsers, tasks, completions, activities, activityCheckins,
    activityExemptions, evaluations, yearConfigs, yearScope, sortMode,
  ]);

  const toggleEvaluation = async (studentUid: string, year: number, evaluated: boolean) => {
    setBusy(studentUid);
    try {
      await setCharacterEvaluation(callerUid, { studentUid, year, evaluated: !evaluated });
      toast.success(evaluated ? "ยกเลิกวัดผลคุณลักษณะแล้ว" : "วัดผลคุณลักษณะแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const exportEvaluation = async () => {
    if (!dataReady || busy !== null || exportLock.current || review.Element) return;
    if (rows.length === 0) {
      toast.warning("ยังไม่มีข้อมูลผลประเมินให้ส่งออก");
      return;
    }

    exportLock.current = true;
    setExporting(true);
    try {
      const { downloadXlsx, todayStamp } = await import("@/lib/exports");
      const scopeLabel = yearScope ? `ปี${yearScope}` : "ทุกชั้นปี";
      const filename = `ผลประเมินผู้ใช้-${scopeLabel}-${todayStamp()}`;
      const sheetName = `ผลประเมิน-${scopeLabel}`;
      const columns: EditorColumn[] = [
        { key: "number", label: "ลำดับ", width: 60, type: "number", readOnly: true },
        { key: "studentId", label: "เลข นร.", width: 110 },
        { key: "fullName", label: "ชื่อ-นามสกุล", width: 220 },
        { key: "classroom", label: "ห้อง", width: 90 },
        { key: "year", label: "ชั้นปี", width: 80, type: "number" },
        { key: "doneCount", label: "งานที่ทำ", width: 100, type: "number" },
        { key: "taskTotal", label: "งานทั้งหมด", width: 110, type: "number" },
        { key: "taskPercent", label: "เปอร์เซ็นต์งาน (%)", width: 150, type: "number" },
        { key: "passingPercent", label: "เกณฑ์ผ่านงาน (%)", width: 150, type: "number" },
        { key: "activityCount", label: "กิจกรรมที่เข้าร่วม/ได้รับยกเว้น", width: 240, type: "number" },
        { key: "activityTotal", label: "กิจกรรมทั้งหมด", width: 150, type: "number" },
        { key: "missedActivityCount", label: "ขาดกิจกรรม (ครั้ง)", width: 160, type: "number" },
        { key: "evaluated", label: "วัดผลคุณลักษณะ", width: 170 },
        { key: "result", label: "ผลประเมิน", width: 110 },
      ];
      const exportRows: Record<string, string | number>[] = rows.map((row, index) => ({
        number: index + 1,
        studentId: row.user.studentId || "",
        fullName: row.user.fullName || row.user.email || row.user.uid,
        classroom: row.user.classroom || "-",
        year: row.user.year,
        doneCount: row.doneCount,
        taskTotal: row.taskTotal,
        taskPercent: row.taskPercent,
        passingPercent: row.passingPercent,
        activityCount: row.activityCount,
        activityTotal: row.activityTotal,
        missedActivityCount: row.missedActivityCount,
        evaluated: row.evaluated ? "วัดผลแล้ว" : "ยังไม่ได้วัดผล",
        result: row.passed ? "ผ่าน" : "ไม่ผ่าน",
      }));
      const doDownload = async () => {
        if (exportLock.current) return;
        exportLock.current = true;
        setExporting(true);
        try {
          await downloadXlsx(filename, [{
            name: sheetName,
            headers: columns.map((column) => column.label),
            rows: exportRows.map((row) => columns.map((column) => row[column.key])),
          }]);
          toast.success("ดาวน์โหลดผลประเมิน Excel แล้ว");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "ส่งออกผลประเมินไม่สำเร็จ");
        } finally {
          exportLock.current = false;
          setExporting(false);
        }
      };

      exportLock.current = false;
      setExporting(false);
      review.trigger({
        mode: "export",
        title: `ส่งออกผลประเมินผู้ใช้ ${scopeLabel}`,
        context: { kind: "export", filename, sheetName },
        columns,
        rows: exportRows,
        returnTo: window.location.pathname,
      }, doDownload);
    } catch (error) {
      exportLock.current = false;
      setExporting(false);
      toast.error(error instanceof Error ? error.message : "เตรียมข้อมูลส่งออกไม่สำเร็จ");
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          aria-label="เรียงผลประเมิน"
        >
          <option value="name">เรียงตามลำดับตัวอักษร</option>
          <option value="classroom">เรียงตามห้อง</option>
          <option value="result">เรียงตามผ่าน/ไม่ผ่าน</option>
        </select>
        <Button
          variant="outline"
          onClick={exportEvaluation}
          disabled={!dataReady || rows.length === 0 || busy !== null || exporting || !!review.Element}
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {exporting ? "กำลังส่งออก..." : "ส่งออกผลประเมินผู้ใช้"}
        </Button>
      </div>
      {loadError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive" role="alert">
            โหลดข้อมูลผลประเมินไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง
          </CardContent>
        </Card>
      ) : !dataReady ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            กำลังโหลดข้อมูลผลประเมิน...
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีนักเรียนสำหรับแสดงผลประเมิน
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2">ชื่อ</th>
                  <th className="px-3 py-2">ห้อง</th>
                  <th className="px-3 py-2">ชั้นปี</th>
                  <th className="px-3 py-2">เปอร์เซ็นต์งาน</th>
                  <th className="px-3 py-2">เช็คอินกิจกรรมจากทั้งหมด</th>
                  <th className="px-3 py-2">ผล</th>
                  <th className="px-3 py-2">วัดผลคุณลักษณะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user.uid} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.user.fullName || row.user.email}</div>
                      {row.user.nickname && (
                        <div className="text-xs text-muted-foreground">{row.user.nickname}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.user.classroom || "-"}</td>
                    <td className="px-3 py-2">{row.user.year || "-"}</td>
                    <td className="px-3 py-2">
                      <div className={`font-semibold tabular-nums ${
                        row.taskPassed
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      }`}>
                        {row.taskPercent}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.doneCount}/{row.taskTotal} งาน · เกณฑ์ {row.passingPercent}%
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`tabular-nums ${
                        row.activityPassed
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      }`}>
                        {row.activityCount}/{row.activityTotal}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        ขาด {row.missedActivityCount} ครั้ง
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${
                        row.passed
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      }`}>
                        {row.passed ? "ผ่าน" : "ไม่ผ่าน"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant={row.evaluated ? "default" : "outline"}
                        disabled={busy === row.user.uid}
                        onClick={() => toggleEvaluation(row.user.uid, row.user.year, row.evaluated)}
                      >
                        {busy === row.user.uid ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : row.evaluated ? (
                          <Check className="mr-1 h-3 w-3" />
                        ) : null}
                        วัดผลคุณลักษณะ
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {review.Element}
    </>
  );
}
