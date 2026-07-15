"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, X, Check, ChevronLeft, Download, Users, ListChecks } from "lucide-react";
import { createTask, deleteTask, toggleTaskCompletion } from "@/lib/actions";
import { downloadXlsx, todayStamp } from "@/lib/exports";
import { useReviewFlow } from "@/components/ReviewBeforePrompt";
import type { EditorPayload } from "@/lib/editor-bus";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { TaskDoc, TaskCompletionDoc, UserDoc } from "@/lib/types";

interface Props {
  callerUid: string;
  year: number;
}

export function TasksPanel({ callerUid, year }: Props) {
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [completions, setCompletions] = useState<TaskCompletionDoc[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const q = query(collection(db(), "tasks"), where("year", "==", year), orderBy("order"));
    return onSnapshot(q, (s) => setTasks(s.docs.map((d) => d.data() as TaskDoc)));
  }, [year]);

  useEffect(() => {
    // รวม admin_student เป็นนักเรียนด้วย — filter role ฝั่ง client เลี่ยงปัญหา composite index
    const q = query(
      collection(db(), "users"),
      where("year", "==", year),
      orderBy("fullName"),
    );
    return onSnapshot(q, (s) =>
      setStudents(
        s.docs
          .map((d) => d.data() as UserDoc)
          .filter((u) => u.role === "student" || u.role === "admin_student"),
      ),
    );
  }, [year]);

  useEffect(() => {
    const q = query(collection(db(), "taskCompletions"), where("year", "==", year));
    return onSnapshot(q, (s) =>
      setCompletions(s.docs.map((d) => d.data() as TaskCompletionDoc)),
    );
  }, [year]);

  const completionMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of completions) m.set(`${c.taskId}_${c.studentUid}`, c.done);
    return m;
  }, [completions]);

  const isDone = (taskId: string, studentUid: string) =>
    completionMap.get(`${taskId}_${studentUid}`) === true;

  const filteredStudents = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return students;
    return students.filter((u) =>
      [u.fullName, u.nickname, u.classroom, u.studentId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [students, search]);

  const toggle = async (task: TaskDoc, student: UserDoc) => {
    const current = isDone(task.id, student.uid);
    try {
      await toggleTaskCompletion(callerUid, {
        taskId: task.id,
        taskName: task.name,
        studentUid: student.uid,
        year,
        done: !current,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    }
  };

  return (
    <div className="space-y-3">
      <TaskHeader
        callerUid={callerUid}
        year={year}
        tasks={tasks}
        students={students}
        completionMap={completionMap}
      />
      {students.length === 0 ? (
        <EmptyState
          icon="users"
          title="ยังไม่มีนักเรียนในชั้นปีนี้"
          hint="ให้ครูสร้างรหัสเชิญและให้นักเรียนสมัครก่อน"
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon="tasks"
          title="ยังไม่มีงาน"
          hint='กดปุ่ม "เพิ่มงาน" ด้านบนเพื่อเริ่มต้น'
        />
      ) : (
        <>
          <Input
            placeholder="ค้นหานักเรียน (ชื่อ / ชื่อเล่น / ห้อง / รหัส นร.)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {filteredStudents.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                ไม่พบนักเรียนที่ค้นหา
              </CardContent>
            </Card>
          ) : isMobile ? (
            <MobileView
              students={filteredStudents}
              tasks={tasks}
              isDone={isDone}
              onToggle={toggle}
            />
          ) : (
            <DesktopTable
              callerUid={callerUid}
              students={filteredStudents}
              tasks={tasks}
              isDone={isDone}
              onToggle={toggle}
            />
          )}
        </>
      )}
    </div>
  );
}

function TaskHeader({
  callerUid, year, tasks, students, completionMap,
}: {
  callerUid: string;
  year: number;
  tasks: TaskDoc[];
  students: UserDoc[];
  completionMap: Map<string, boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const review = useReviewFlow();

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createTask(callerUid, { name: name.trim(), year });
      toast.success(`เพิ่มงาน "${name.trim()}" แล้ว`);
      setName("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (tasks.length === 0 || students.length === 0) {
      toast.warning("ยังไม่มีข้อมูลให้ export");
      return;
    }
    const headers = ["ลำดับ", "เลข นร.", "ชื่อ (นศท.)", ...tasks.map((t) => t.name)];
    const rows = students.map((s, i) => [
      i + 1,
      s.studentId,
      s.fullName,
      ...tasks.map((t) => (completionMap.get(`${t.id}_${s.uid}`) ? "✓" : "")),
    ]);
    const colWidths = [6, 12, 28, ...tasks.map(() => 14)];
    const filename = `งาน-ปี${year}-${todayStamp()}`;
    const sheetName = `งานปี${year}`;

    const doDownload = () => {
      downloadXlsx(filename, [{ name: sheetName, headers, rows, colWidths }]);
      toast.success("ดาวน์โหลด Excel แล้ว");
    };

    const editorPayload: Omit<EditorPayload, "createdAt"> = {
      mode: "export",
      title: `ส่งออกงาน ปี ${year}`,
      context: { kind: "export", filename, sheetName },
      columns: [
        { key: "_no", label: "ลำดับ", width: 60, type: "number", readOnly: true },
        { key: "studentId", label: "เลข นร.", width: 100 },
        { key: "fullName", label: "ชื่อ (นศท.)", width: 220 },
        ...tasks.map((t) => ({ key: t.id, label: t.name, width: 110 })),
      ],
      rows: students.map((s, i) => {
        const row: Record<string, string | number> = {
          _no: i + 1,
          studentId: s.studentId,
          fullName: s.fullName,
        };
        for (const t of tasks) row[t.id] = completionMap.get(`${t.id}_${s.uid}`) ? "✓" : "";
        return row;
      }),
      returnTo: typeof window !== "undefined" ? window.location.pathname : "/",
    };

    review.trigger(editorPayload, doDownload);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm text-muted-foreground">
        งานทั้งหมด {tasks.length} งาน · ปี {year}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={exportCsv} title="ส่งออก Excel/CSV">
          <Download className="h-4 w-4" />
        </Button>
        {!open ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />เพิ่มงาน
          </Button>
        ) : (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่องาน"
              className="h-9 w-48"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button size="sm" onClick={submit} disabled={busy}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setName(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {review.Element}
    </div>
  );
}

function DesktopTable({
  callerUid, students, tasks, isDone, onToggle,
}: {
  callerUid: string;
  students: UserDoc[];
  tasks: TaskDoc[];
  isDone: (t: string, s: string) => boolean;
  onToggle: (t: TaskDoc, s: UserDoc) => void;
}) {
  const confirm = useConfirm();
  const onDelTask = async (t: TaskDoc) => {
    const ok = await confirm({
      title: `ลบงาน "${t.name}"?`,
      description: "ประวัติการติ๊กของงานนี้จะถูกลบทั้งหมด",
      destructive: true,
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    try {
      await deleteTask(callerUid, t.id);
      toast.success("ลบงานแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="text-sm">
          <thead>
            <tr className="border-b text-left text-xs">
              <th className="sticky left-0 z-10 bg-background px-3 py-2 min-w-[180px]">ชื่อนักเรียน</th>
              {tasks.map((t) => (
                <th key={t.id} className="px-2 py-2 min-w-[110px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{t.name}</span>
                    <button
                      onClick={() => onDelTask(t)}
                      className="text-muted-foreground hover:text-destructive"
                      title="ลบงาน"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              return (
                <tr key={s.uid} className="border-b last:border-0">
                  <td className="sticky left-0 bg-background px-3 py-2">
                    {s.fullName} <span className="text-xs text-muted-foreground">({s.nickname})</span>
                  </td>
                  {tasks.map((t) => {
                    const done = isDone(t.id, s.uid);
                    return (
                      <td key={t.id} className="px-2 py-2 text-center">
                        <button
                          onClick={() => onToggle(t, s)}
                          className={`flex h-7 w-7 items-center justify-center rounded border transition ${
                            done
                              ? "bg-green-600 border-green-600 text-white"
                              : "bg-background hover:bg-muted"
                          }`}
                        >
                          {done && <Check className="h-4 w-4" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MobileView({
  students, tasks, isDone, onToggle,
}: {
  students: UserDoc[];
  tasks: TaskDoc[];
  isDone: (t: string, s: string) => boolean;
  onToggle: (t: TaskDoc, s: UserDoc) => void;
}) {
  const [picked, setPicked] = useState<UserDoc | null>(null);

  if (picked) {
    const doneCount = tasks.filter((t) => isDone(t.id, picked.uid)).length;
    return (
      <Card>
        <CardContent className="p-3">
          <div className="mb-3 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setPicked(null)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <div className="font-semibold">{picked.fullName}</div>
              <div className="text-xs text-muted-foreground">
                {picked.classroom} · {doneCount}/{tasks.length} งาน
              </div>
            </div>
          </div>
          <ul className="space-y-2">
            {tasks.map((t) => {
              const done = isDone(t.id, picked.uid);
              return (
                <li key={t.id}>
                  <button
                    onClick={() => onToggle(t, picked)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                      done ? "border-green-600 bg-green-50" : "bg-background"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${
                        done ? "border-green-600 bg-green-600 text-white" : ""
                      }`}
                    >
                      {done && <Check className="h-4 w-4" />}
                    </span>
                    <span className="flex-1">{t.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-2">
        <ul className="divide-y">
          {students.map((s) => {
            const doneCount = tasks.filter((t) => isDone(t.id, s.uid)).length;
            return (
              <li key={s.uid}>
                <button
                  onClick={() => setPicked(s)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.fullName}</div>
                    <div className="text-xs text-muted-foreground">{s.classroom}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {doneCount}/{tasks.length} งาน
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon, title, hint,
}: { icon: "users" | "tasks"; title: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {icon === "users" ? <Users className="h-6 w-6 text-muted-foreground" /> : <ListChecks className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
