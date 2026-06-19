"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { TaskDoc, TaskCompletionDoc, UserDoc } from "@/lib/types";
import { createTask, deleteTask, toggleTaskCompletion } from "@/lib/actions";

export function AdminTasksTab({ userDoc }: { userDoc: UserDoc }) {
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [completions, setCompletions] = useState<TaskCompletionDoc[]>([]);
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [createModal, setCreateModal] = useState(false);

  useEffect(() => {
    if (!userDoc.year) return;
    const q = query(
      collection(db(), "tasks"),
      where("year", "==", userDoc.year),
      orderBy("order", "desc"),
    );
    return onSnapshot(q, (s) => setTasks(s.docs.map((d) => d.data() as TaskDoc)));
  }, [userDoc.year]);

  useEffect(() => {
    if (!userDoc.year) return;
    const q = query(
      collection(db(), "taskCompletions"),
      where("year", "==", userDoc.year),
    );
    return onSnapshot(q, (s) => setCompletions(s.docs.map((d) => d.data() as TaskCompletionDoc)));
  }, [userDoc.year]);

  useEffect(() => {
    if (!userDoc.year) return;
    const q = query(
      collection(db(), "users"),
      where("year", "==", userDoc.year),
      where("role", "==", "student"),
      orderBy("fullName"),
    );
    return onSnapshot(q, (s) => setStudents(s.docs.map((d) => d.data() as UserDoc)));
  }, [userDoc.year]);

  const completionMap = useMemo(() => {
    const m = new Map<string, TaskCompletionDoc>();
    for (const c of completions) m.set(c.id, c);
    return m;
  }, [completions]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">งานนักศึกษาวิชาทหาร</h2>
        <Button size="sm" onClick={() => setCreateModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          เพิ่มงาน
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            ยังไม่มีงาน
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              students={students}
              completionMap={completionMap}
              callerUid={userDoc.uid}
              year={userDoc.year}
            />
          ))}
        </div>
      )}

      {createModal && (
        <CreateTaskModal
          callerUid={userDoc.uid}
          year={userDoc.year}
          onClose={() => setCreateModal(false)}
        />
      )}
    </div>
  );
}

function TaskCard({
  task, students, completionMap, callerUid, year,
}: {
  task: TaskDoc;
  students: UserDoc[];
  completionMap: Map<string, TaskCompletionDoc>;
  callerUid: string;
  year: number;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleDelete = async () => {
    const ok = await confirm({
      title: `ลบงาน "${task.name}"?`,
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteTask(callerUid, task.id);
      toast.success("ลบงานแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const toggleStudent = async (student: UserDoc) => {
    const completionId = `${task.id}_${student.uid}`;
    const current = completionMap.get(completionId);
    const newDone = !current?.done;
    setBusy(true);
    try {
      await toggleTaskCompletion(callerUid, {
        taskId: task.id,
        taskName: task.name,
        studentUid: student.uid,
        year,
        done: newDone,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const doneCount = students.filter((s) => {
    const c = completionMap.get(`${task.id}_${s.uid}`);
    return c?.done === true;
  }).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{task.name}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {doneCount}/{students.length}
            </span>
            <Button variant="ghost" size="icon" onClick={handleDelete} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-destructive" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "ซ่อน" : "แสดง"} นักเรียนทั้งหมด
        </Button>
        {expanded && (
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
            {students.map((s) => {
              const completionId = `${task.id}_${s.uid}`;
              const completion = completionMap.get(completionId);
              const isDone = completion?.done === true;
              return (
                <label
                  key={s.uid}
                  className={`flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted ${
                    isDone ? "bg-green-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggleStudent(s)}
                    className="h-4 w-4"
                  />
                  <span className="flex-1 text-sm">
                    {s.fullName} ({s.nickname}) · {s.classroom}
                  </span>
                  {isDone && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                </label>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateTaskModal({
  callerUid, year, onClose,
}: {
  callerUid: string;
  year: number;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.warning("กรุณาตั้งชื่องาน");
    setBusy(true);
    try {
      await createTask(callerUid, { name: name.trim(), year });
      toast.success("เพิ่มงานแล้ว");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่มงานใหม่</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>ชื่องาน</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ฝึกแถว"
            />
          </div>
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "เพิ่ม"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
