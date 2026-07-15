"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Check, Loader2 } from "lucide-react";
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

  useEffect(() => {
    if (users) return;
    const q = yearScope
      ? query(collection(db(), "users"), where("year", "==", yearScope))
      : query(collection(db(), "users"));
    return onSnapshot(q, (snap) =>
      setLoadedUsers(
        snap.docs
          .map((d) => d.data() as UserDoc)
          .sort((a, b) =>
            (a.fullName || a.email || a.uid).localeCompare(b.fullName || b.email || b.uid, "th"),
          ),
      ),
    );
  }, [users, yearScope]);

  useEffect(() => {
    const q = yearScope
      ? query(collection(db(), "tasks"), where("year", "==", yearScope))
      : query(collection(db(), "tasks"));
    return onSnapshot(q, (snap) => setTasks(snap.docs.map((d) => d.data() as TaskDoc)));
  }, [yearScope]);

  useEffect(() => {
    const q = yearScope
      ? query(collection(db(), "taskCompletions"), where("year", "==", yearScope))
      : query(collection(db(), "taskCompletions"));
    return onSnapshot(q, (snap) =>
      setCompletions(snap.docs.map((d) => d.data() as TaskCompletionDoc)),
    );
  }, [yearScope]);

  useEffect(() => {
    const q = yearScope
      ? query(collection(db(), "activities"), where("year", "==", yearScope))
      : query(collection(db(), "activities"));
    return onSnapshot(q, (snap) => setActivities(snap.docs.map((d) => d.data() as ActivityDoc)));
  }, [yearScope]);

  useEffect(() => {
    const q = yearScope
      ? query(collection(db(), "activityCheckins"), where("year", "==", yearScope))
      : query(collection(db(), "activityCheckins"));
    return onSnapshot(q, (snap) =>
      setActivityCheckins(snap.docs.map((d) => d.data() as ActivityCheckinDoc)),
    );
  }, [yearScope]);

  useEffect(() => {
    const q = yearScope
      ? query(collection(db(), "activityExemptions"), where("year", "==", yearScope))
      : query(collection(db(), "activityExemptions"));
    return onSnapshot(q, (snap) =>
      setActivityExemptions(snap.docs.map((d) => d.data() as ActivityExemptionDoc)),
    );
  }, [yearScope]);

  useEffect(() => {
    const q = yearScope
      ? query(collection(db(), "characterEvaluations"), where("year", "==", yearScope))
      : query(collection(db(), "characterEvaluations"));
    return onSnapshot(q, (snap) =>
      setEvaluations(snap.docs.map((d) => d.data() as CharacterEvaluationDoc)),
    );
  }, [yearScope]);

  useEffect(() => {
    return onSnapshot(collection(db(), "yearConfigs"), (snap) =>
      setYearConfigs(snap.docs.map((d) => d.data() as YearConfigDoc)),
    );
  }, []);

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
    for (const activity of activities) {
      if (!activitiesByYear.has(activity.year)) activitiesByYear.set(activity.year, []);
      activitiesByYear.get(activity.year)!.push(activity);
    }

    const attendedActivitiesByStudent = new Map<string, Set<string>>();
    for (const checkin of activityCheckins) {
      if (!attendedActivitiesByStudent.has(checkin.userId)) {
        attendedActivitiesByStudent.set(checkin.userId, new Set());
      }
      attendedActivitiesByStudent.get(checkin.userId)!.add(checkin.activityId);
    }
    for (const exemption of activityExemptions) {
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

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          ยังไม่มีนักเรียนสำหรับแสดงผลประเมิน
        </CardContent>
      </Card>
    );
  }

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
      </div>
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
    </>
  );
}
