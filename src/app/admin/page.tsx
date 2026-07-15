"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection, onSnapshot, orderBy, query, where, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CheckinDoc } from "@/lib/types";
import { ExternalLink, KeyRound, LogOut, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { deleteUserAndCheckins, requestEmergencyCode } from "@/lib/actions";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { AdminGroupsTab } from "@/components/AdminGroupsTab";
import { AdminTasksTab } from "@/components/AdminTasksTab";
import { UserEvaluationTab } from "@/components/UserEvaluationTab";
import { AttendanceStats } from "@/components/AttendanceStats";

type Range = "today" | "week" | "month";
type Tab = "checkins" | "users" | "groups" | "tasks";
type UsersSubTab = "manage" | "evaluation";

function rangeStart(r: Range): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const today = fmt.format(new Date());
  const todayMs = new Date(today + "T00:00:00+07:00").getTime();
  if (r === "today") return todayMs;
  if (r === "week") return todayMs - 6 * 86400_000;
  return todayMs - 29 * 86400_000;
}

function AdminInner() {
  const { userDoc, signOut } = useAuth();
  const [range, setRange] = useState<Range>("today");
  const [items, setItems] = useState<CheckinDoc[]>([]);
  const [code, setCode] = useState<{ value: string; expiresAt: number } | null>(null);
  const [busyCode, setBusyCode] = useState(false);
  const [tab, setTab] = useState<Tab>("checkins");
  const [usersSubTab, setUsersSubTab] = useState<UsersSubTab>("manage");

  const isTeacher = userDoc?.role === "admin_teacher" || userDoc?.role === "admin";

  useEffect(() => {
    if (!userDoc) return;
    const since = rangeStart(range);
    const q = query(
      collection(db(), "checkins"),
      where("year", "==", userDoc.year),
      where("timestamp", ">=", since),
      orderBy("timestamp", "desc"),
      limit(500),
    );
    const unsub = onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => d.data() as CheckinDoc)),
    );
    return () => unsub();
  }, [userDoc, range]);

  const grouped = useMemo(() => {
    const m = new Map<string, CheckinDoc[]>();
    for (const c of items) {
      const day = new Date(c.timestamp).toLocaleDateString("th-TH", {
        timeZone: "Asia/Bangkok",
      });
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(c);
    }
    return Array.from(m.entries());
  }, [items]);

  const requestCode = async () => {
    if (!userDoc) return;
    setBusyCode(true);
    try {
      const r = await requestEmergencyCode({ callerUid: userDoc.uid });
      setCode({ value: r.code, expiresAt: r.expiresAt });
      toast.success("สร้างรหัสฉุกเฉินแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างรหัสไม่สำเร็จ");
    } finally {
      setBusyCode(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Admin · ปี {userDoc?.year}</div>
          <div className="font-semibold">{userDoc?.fullName}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <div className="mb-4 grid grid-cols-4 gap-2">
        <Button
          variant={tab === "checkins" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("checkins")}
        >
          เช็คอิน
        </Button>
        <Button
          variant={tab === "users" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("users")}
        >
          นักเรียน
        </Button>
        <Button
          variant={tab === "groups" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("groups")}
        >
          กลุ่ม
        </Button>
        <Button
          variant={tab === "tasks" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("tasks")}
        >
          งาน
        </Button>
      </div>

      {tab === "checkins" && (
        <>
          <Card className="mb-3">
            <CardHeader>
              <CardTitle className="text-base">รหัสฉุกเฉิน</CardTitle>
            </CardHeader>
            <CardContent>
              {code ? (
                <div className="space-y-1">
                  <div className="text-3xl font-bold tracking-widest">{code.value}</div>
                  <p className="text-xs text-muted-foreground">
                    หมดอายุเวลา{" "}
                    {new Date(code.expiresAt).toLocaleTimeString("th-TH", {
                      timeZone: "Asia/Bangkok",
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </p>
                  <Button variant="outline" size="sm" onClick={requestCode} disabled={busyCode}>
                    สร้างรหัสใหม่
                  </Button>
                </div>
              ) : (
                <Button onClick={requestCode} disabled={busyCode}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  สร้างรหัส 6 หลัก (ใช้ได้ 5 นาที)
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="mb-3 flex gap-2">
            {(["today", "week", "month"] as const).map((r) => (
              <Button
                key={r}
                variant={range === r ? "default" : "outline"}
                size="sm"
                onClick={() => setRange(r)}
              >
                {r === "today" ? "วันนี้" : r === "week" ? "7 วัน" : "30 วัน"}
              </Button>
            ))}
          </div>

          <div className="space-y-3">
            {grouped.length === 0 && (
              <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
                ไม่มีการเช็คอินในช่วงนี้
              </CardContent></Card>
            )}
            {grouped.map(([day, list]) => (
              <Card key={day}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{day} · {list.length} คน</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-3 py-2">เวลา</th>
                        <th className="px-3 py-2">ชื่อ</th>
                        <th className="px-3 py-2">ห้อง</th>
                        <th className="px-3 py-2">ระยะ</th>
                        <th className="px-3 py-2">แผนที่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            {new Date(c.timestamp).toLocaleTimeString("th-TH", {
                              timeZone: "Asia/Bangkok",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </td>
                          <td className="px-3 py-2">
                            {c.fullName}
                            {c.method === "emergency_code" && (
                              <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">
                                รหัส
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">{c.classroom}</td>
                          <td className="px-3 py-2">
                            {c.distanceMeters >= 0 ? `${c.distanceMeters} ม.` : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {c.mapLink ? (
                              <Link
                                href={c.mapLink}
                                target="_blank"
                                className="inline-flex items-center gap-1 text-primary"
                              >
                                ดู <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-4">
            <AttendanceStats year={userDoc!.year} callerUid={userDoc!.uid} />
          </div>
        </>
      )}

      {tab === "users" && userDoc && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={usersSubTab === "manage" ? "default" : "outline"}
              onClick={() => setUsersSubTab("manage")}
            >
              จัดการข้อมูล
            </Button>
            <Button
              size="sm"
              variant={usersSubTab === "evaluation" ? "default" : "outline"}
              onClick={() => setUsersSubTab("evaluation")}
            >
              ผลประเมิน
            </Button>
          </div>
          {usersSubTab === "manage" ? (
            <UsersInYear year={userDoc.year} callerUid={userDoc.uid} />
          ) : (
            <UserEvaluationTab callerUid={userDoc.uid} yearScope={userDoc.year} />
          )}
        </>
      )}
      {tab === "groups" && <AdminGroupsTab userDoc={userDoc!} isTeacher={isTeacher} />}
      {tab === "tasks" && <AdminTasksTab userDoc={userDoc!} />}
    </main>
  );
}

function UsersInYear({ year, callerUid }: { year: number; callerUid: string }) {
  const confirm = useConfirm();
  const [users, setUsers] = useState<Array<{
    uid: string; fullName: string; nickname: string; classroom: string; studentId: string; role: string;
  }>>([]);
  const [sortMode, setSortMode] = useState<"name" | "classroom">("name");

  useEffect(() => {
    const q = query(
      collection(db(), "users"),
      where("year", "==", year),
      orderBy("fullName"),
    );
    const unsub = onSnapshot(q, (snap) =>
      setUsers(snap.docs.map((d) => d.data() as any)),
    );
    return () => unsub();
  }, [year]);

  const onDelete = async (uid: string, name: string) => {
    const ok = await confirm({
      title: `ลบ ${name}?`,
      description: "ประวัติเช็คอินทั้งหมดจะถูกลบด้วย\nหมายเหตุ: ลบ Auth account ต้องเข้า Firebase Console เอง",
      destructive: true,
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    try {
      await deleteUserAndCheckins(callerUid, uid);
      toast.success("ลบนักเรียนแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  const sortedUsers = useMemo(() => [...users].sort((a, b) => {
    if (sortMode === "classroom") {
      return (a.classroom || "").localeCompare(b.classroom || "", "th", { numeric: true })
        || (a.fullName || "").localeCompare(b.fullName || "", "th", { numeric: true });
    }
    return (a.fullName || "").localeCompare(b.fullName || "", "th", { numeric: true });
  }), [users, sortMode]);

  return (
    <>
      <div className="mb-3">
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as "name" | "classroom")}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          aria-label="เรียงผู้ใช้"
        >
          <option value="name">เรียงตามลำดับตัวอักษร</option>
          <option value="classroom">เรียงตามห้อง</option>
        </select>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">ห้อง</th>
              <th className="px-3 py-2">รหัส นร.</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((u) => (
              <tr key={u.uid} className="border-b last:border-0">
                <td className="px-3 py-2">
                  {u.fullName} <span className="text-muted-foreground">({u.nickname})</span>
                </td>
                <td className="px-3 py-2">{u.classroom}</td>
                <td className="px-3 py-2">{u.studentId}</td>
                <td className="px-3 py-2 text-right">
                  {u.role === "student" && (
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => onDelete(u.uid, u.fullName)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
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

export default function Page() {
  return (
    <RequireRole allow={["admin"]}>
      <AdminInner />
    </RequireRole>
  );
}
