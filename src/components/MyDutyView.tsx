"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";
import { DEFAULT_PASSING_PERCENT } from "@/lib/types";
import type { TaskDoc, TaskCompletionDoc } from "@/lib/types";

/** มุมมอง "งานของฉัน" — แสดง % ปฏิบัติหน้าที่ + รายการของ uid นี้
 *  ใช้ร่วมกันได้ทั้งหน้า student และ admin_student */
export function MyDutyView({ uid, year }: { uid: string; year: number }) {
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [completions, setCompletions] = useState<TaskCompletionDoc[]>([]);
  const [passingPct, setPassingPct] = useState<number>(DEFAULT_PASSING_PERCENT);

  useEffect(() => {
    const q = query(collection(db(), "tasks"), where("year", "==", year), orderBy("order"));
    return onSnapshot(q, (s) => setTasks(s.docs.map((d) => d.data() as TaskDoc)));
  }, [year]);

  useEffect(() => {
    const q = query(collection(db(), "taskCompletions"), where("studentUid", "==", uid));
    return onSnapshot(q, (s) =>
      setCompletions(s.docs.map((d) => d.data() as TaskCompletionDoc)),
    );
  }, [uid]);

  useEffect(() => {
    return onSnapshot(doc(db(), "yearConfigs", `year${year}`), (s) => {
      const d = s.data();
      if (d && typeof d.passingPercent === "number") setPassingPct(d.passingPercent);
    });
  }, [year]);

  const doneIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of completions) if (c.done) set.add(c.taskId);
    return set;
  }, [completions]);

  const total = tasks.length;
  const done = tasks.filter((t) => doneIds.has(t.id)).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const passed = total > 0 && pct >= passingPct;

  const taskWithStatus = useMemo(() => {
    const completionMap = new Map<string, TaskCompletionDoc>();
    for (const c of completions) completionMap.set(c.taskId, c);
    return tasks
      .map((t) => ({
        task: t,
        completion: completionMap.get(t.id) ?? null,
        sortKey: completionMap.get(t.id)?.checkedAt ?? t.createdAt,
      }))
      .sort((a, b) => b.sortKey - a.sortKey);
  }, [tasks, completions]);

  return (
    <div className="mx-auto max-w-md">
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            เปอร์เซ็นต์การปฏิบัติหน้าที่
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-4xl font-bold ${passed ? "text-green-700" : "text-amber-700"}`}>
            {pct}%
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${passed ? "bg-green-600" : "bg-amber-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-muted/50 p-2">
              <div className="text-xs text-muted-foreground">ปฏิบัติ</div>
              <div className="text-lg font-semibold">{done} ครั้ง</div>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <div className="text-xs text-muted-foreground">ทั้งหมด</div>
              <div className="text-lg font-semibold">{total} ครั้ง</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">ผลการประเมิน</CardTitle>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีงานในชั้นปี</p>
          ) : passed ? (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-6 w-6" />
              <span className="text-xl font-bold">ผ่าน</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="h-6 w-6" />
              <span className="text-xl font-bold">ไม่ผ่าน</span>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            * เกณฑ์ผ่านการประเมินคือ {passingPct}% ขึ้นไป
          </p>
        </CardContent>
      </Card>

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        รายการ (เรียงจากล่าสุด)
      </h2>
      <div className="space-y-2">
        {taskWithStatus.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              ยังไม่มีงาน
            </CardContent>
          </Card>
        )}
        {taskWithStatus.map(({ task, completion }) => {
          const isDone = completion?.done === true;
          return (
            <div
              key={task.id}
              className={`flex items-center justify-between rounded-lg border p-3 ${
                isDone ? "border-green-300 bg-green-50" : "bg-background"
              }`}
            >
              <span className="text-sm">{task.name}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  isDone ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? "ปฏิบัติหน้าที่" : "ไม่ปฏิบัติหน้าที่"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
