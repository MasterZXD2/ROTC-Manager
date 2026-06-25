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
import { TasksPanel } from "@/components/TasksPanel";
import { AttendanceStats } from "@/components/AttendanceStats";
import { AdminGroupsTab } from "@/components/AdminGroupsTab";
import { MyDutyView } from "@/components/MyDutyView";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { CheckinDoc } from "@/lib/types";
import { ExternalLink, ListChecks, LogOut, ClipboardList, Users, ClipboardCheck } from "lucide-react";
import Link from "next/link";

type Range = "today" | "week" | "month";
type Tab = "checkins" | "groups" | "tasks" | "myduty";

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

function AdminStudentInner() {
  const { userDoc, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("checkins");
  const [range, setRange] = useState<Range>("today");
  const [items, setItems] = useState<CheckinDoc[]>([]);

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
      const day = new Date(c.timestamp).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(c);
    }
    return Array.from(m.entries());
  }, [items]);

  return (
    <main className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">นักเรียนผู้ช่วย (Admin Student) · ปี {userDoc?.year}</div>
          <div className="font-semibold">{userDoc?.fullName}</div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          variant={tab === "checkins" ? "default" : "outline"}
          onClick={() => setTab("checkins")}
        >
          <ClipboardList className="mr-2 h-4 w-4" />การเช็คอิน
        </Button>
        <Button
          variant={tab === "groups" ? "default" : "outline"}
          onClick={() => setTab("groups")}
        >
          <Users className="mr-2 h-4 w-4" />กลุ่มจราจร
        </Button>
        <Button
          variant={tab === "tasks" ? "default" : "outline"}
          onClick={() => setTab("tasks")}
        >
          <ListChecks className="mr-2 h-4 w-4" />งาน
        </Button>
        <Button
          variant={tab === "myduty" ? "default" : "outline"}
          onClick={() => setTab("myduty")}
        >
          <ClipboardCheck className="mr-2 h-4 w-4" />งานของฉัน
        </Button>
      </div>

      {tab === "checkins" && (
        <>
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

          {grouped.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
              ไม่มีการเช็คอินในช่วงนี้
            </CardContent></Card>
          )}

          <div className="space-y-3">
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
                              timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit",
                            })}
                          </td>
                          <td className="px-3 py-2">
                            {c.fullName}
                            {c.method === "emergency_code" && (
                              <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">รหัส</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{c.classroom}</td>
                          <td className="px-3 py-2">{c.distanceMeters >= 0 ? `${c.distanceMeters} ม.` : "—"}</td>
                          <td className="px-3 py-2">
                            {c.mapLink ? (
                              <Link href={c.mapLink} target="_blank" className="inline-flex items-center gap-1 text-primary">
                                ดู <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
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
            {userDoc && <AttendanceStats year={userDoc.year} callerUid={userDoc.uid} />}
          </div>
        </>
      )}

      {tab === "groups" && userDoc && (
        <AdminGroupsTab userDoc={userDoc} isTeacher={false} />
      )}

      {tab === "tasks" && userDoc && (
        <TasksPanel callerUid={userDoc.uid} year={userDoc.year} />
      )}

      {tab === "myduty" && userDoc && (
        <MyDutyView uid={userDoc.uid} year={userDoc.year} />
      )}
    </main>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["admin_student"]}>
      <AdminStudentInner />
    </RequireRole>
  );
}
