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
import { Input } from "@/components/ui/input";
import type { CheckinDoc } from "@/lib/types";
import { ExternalLink, KeyRound, LogOut, Trash2, Users, UserPlus, ListChecks, Pencil, Download, Calendar, Wrench } from "lucide-react";
import Link from "next/link";
import {
  deleteUserAndCheckins, requestEmergencyCode, createInviteCode, setUserTrafficRepair,
} from "@/lib/actions";
import { EditUserModal } from "@/components/EditUserModal";
import { TasksPanel } from "@/components/TasksPanel";
import { PassingPercentCard } from "@/components/PassingPercentCard";
import { AttendanceStats } from "@/components/AttendanceStats";
import { RosterExportModal } from "@/components/RosterExportModal";
import { BulkImportModal } from "@/components/BulkImportModal";
import { AdminGroupsTab } from "@/components/AdminGroupsTab";
import { AdminActivitiesTab } from "@/components/AdminActivitiesTab";
import { StudentCheckinView } from "@/components/StudentCheckinView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserEvaluationTab } from "@/components/UserEvaluationTab";
import { downloadXlsx, todayStamp, thaiDateTime } from "@/lib/exports";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { UserDoc } from "@/lib/types";

type Range = "today" | "week" | "month";
type Tab = "checkins" | "users" | "groups" | "tasks" | "activities" | "quick-checkin";
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

function AdminTeacherInner() {
  const { userDoc, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("checkins");
  const [range, setRange] = useState<Range>("today");
  const [items, setItems] = useState<CheckinDoc[]>([]);
  const [emCode, setEmCode] = useState<{ value: string; expiresAt: number } | null>(null);
  const [invCode, setInvCode] = useState<{ value: string; expiresAt: number } | null>(null);
  const [busyEm, setBusyEm] = useState(false);
  const [busyInv, setBusyInv] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [usersSubTab, setUsersSubTab] = useState<UsersSubTab>("manage");

  const exportCheckins = () => {
    if (items.length === 0) {
      toast.warning("ไม่มีข้อมูลให้ส่งออก");
      return;
    }
    const headers = ["เวลา", "เลข นร.", "ชื่อ (นศท.)", "ห้อง", "แผนที่", "หมายเหตุ"];
    const rows = items.map((c) => [
      thaiDateTime(c.timestamp),
      c.studentId,
      c.fullName,
      c.classroom,
      c.mapLink ? `https://rotc-manager.web.app${c.mapLink}` : "",
      c.method === "emergency_code" ? "ใช้รหัสฉุกเฉิน"
        : c.method === "tester" ? "Tester"
        : "",
    ]);
    downloadXlsx(`checkin-ปี${userDoc?.year}-${range}-${todayStamp()}`, [
      {
        name: `เช็คอินปี${userDoc?.year}`,
        headers,
        rows,
        colWidths: [20, 12, 28, 10, 50, 18],
      },
    ]);
    toast.success("ดาวน์โหลด Excel แล้ว");
  };

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

  const newEmCode = async () => {
    if (!userDoc) return;
    setBusyEm(true);
    try {
      const r = await requestEmergencyCode({ callerUid: userDoc.uid });
      setEmCode({ value: r.code, expiresAt: r.expiresAt });
      toast.success("สร้างรหัสฉุกเฉินแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    finally { setBusyEm(false); }
  };

  const newInvCode = async () => {
    if (!userDoc) return;
    setBusyInv(true);
    try {
      const r = await createInviteCode({ callerUid: userDoc.uid });
      setInvCode({ value: r.code, expiresAt: r.expiresAt });
      toast.success("สร้างรหัสเชิญแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    finally { setBusyInv(false); }
  };

  return (
    <main className="mx-auto max-w-3xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">ครู (Admin Teacher) · ปี {userDoc?.year}</div>
          <div className="font-semibold">{userDoc?.fullName}</div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Button variant={tab === "quick-checkin" ? "default" : "outline"} onClick={() => setTab("quick-checkin")}>
          เช็คอินด่วน
        </Button>
        <Button variant={tab === "checkins" ? "default" : "outline"} onClick={() => setTab("checkins")}>
          การเช็คอิน
        </Button>
        <Button variant={tab === "users" ? "default" : "outline"} onClick={() => setTab("users")}>
          <Users className="mr-1 h-4 w-4" />นักเรียน
        </Button>
        <Button variant={tab === "groups" ? "default" : "outline"} onClick={() => setTab("groups")}>
          <Users className="mr-1 h-4 w-4" />กลุ่มจราจร
        </Button>
        <Button variant={tab === "activities" ? "default" : "outline"} onClick={() => setTab("activities")}>
          <Calendar className="mr-1 h-4 w-4" />กิจกรรม
        </Button>
        <Button variant={tab === "tasks" ? "default" : "outline"} onClick={() => setTab("tasks")}>
          <ListChecks className="mr-1 h-4 w-4" />งาน
        </Button>
      </div>

      {tab === "quick-checkin" && userDoc && <StudentCheckinView userDoc={userDoc} />}

      {tab === "checkins" && (
        <>
          <Card className="mb-3 border-amber-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-amber-700">รหัสฉุกเฉินสำหรับเช็คอิน</CardTitle>
              <p className="text-xs text-muted-foreground">
                ใช้เมื่อนักเรียน GPS ใช้ไม่ได้ — กรอกในหน้าเช็คอิน
              </p>
            </CardHeader>
            <CardContent>
              {emCode ? (
                <div className="space-y-1">
                  <div className="text-3xl font-bold tracking-widest text-amber-700">{emCode.value}</div>
                  <p className="text-xs text-muted-foreground">
                    หมดอายุเวลา{" "}
                    {new Date(emCode.expiresAt).toLocaleTimeString("th-TH", {
                      timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </p>
                  <Button variant="outline" size="sm" onClick={newEmCode} disabled={busyEm}>
                    สร้างใหม่
                  </Button>
                </div>
              ) : (
                <Button onClick={newEmCode} disabled={busyEm} variant="outline">
                  <KeyRound className="mr-2 h-4 w-4" />
                  สร้างรหัสฉุกเฉิน (5 นาที)
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["today", "week", "month"] as const).map((r) => (
              <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>
                {r === "today" ? "วันนี้" : r === "week" ? "7 วัน" : "30 วัน"}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={exportCheckins} className="ml-auto">
              <Download className="mr-1 h-4 w-4" />ส่งออก Excel
            </Button>
          </div>

          <CheckinList grouped={grouped} />

          <div className="mt-4">
            <AttendanceStats year={userDoc!.year} callerUid={userDoc!.uid} />
          </div>
        </>
      )}

      {tab === "users" && userDoc && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
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

            {usersSubTab === "manage" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                  <UserPlus className="mr-1 h-4 w-4" />นำเข้านักเรียน
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRosterOpen(true)}>
                  <Download className="mr-1 h-4 w-4" />ส่งออกรายชื่อ
                </Button>
              </div>
            )}
          </div>

          {usersSubTab === "manage" ? (
            <>
              <Card className="mb-3 border-blue-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-blue-700">รหัสเชิญสำหรับ Login</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    ให้นักเรียนใหม่กรอกตอนสมัคร — ระบบจะตั้งเป็นปี {userDoc.year} อัตโนมัติ
                  </p>
                </CardHeader>
                <CardContent>
                  {invCode ? (
                    <div className="space-y-1">
                      <div className="text-3xl font-bold tracking-widest text-blue-700">{invCode.value}</div>
                      <p className="text-xs text-muted-foreground">
                        หมดอายุ {new Date(invCode.expiresAt).toLocaleTimeString("th-TH", {
                          timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </p>
                      <Button variant="outline" size="sm" onClick={newInvCode} disabled={busyInv}>สร้างใหม่</Button>
                    </div>
                  ) : (
                    <Button onClick={newInvCode} disabled={busyInv}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      สร้างรหัสเชิญ (5 นาที)
                    </Button>
                  )}
                </CardContent>
              </Card>

              <UsersInYear
                year={userDoc.year}
                callerUid={userDoc.uid}
                callerRole={(userDoc.role === "top_admin" ? "top_admin" : "admin_teacher")}
              />
            </>
          ) : (
            <UserEvaluationTab callerUid={userDoc.uid} yearScope={userDoc.year} />
          )}
        </>
      )}

      {tab === "groups" && userDoc && (
        <AdminGroupsTab userDoc={userDoc} isTeacher={true} />
      )}

      {tab === "tasks" && userDoc && (
        <>
          <PassingPercentCard callerUid={userDoc.uid} year={userDoc.year} />
          <TasksPanel callerUid={userDoc.uid} year={userDoc.year} />
        </>
      )}

      {tab === "activities" && userDoc && (
        <AdminActivitiesTab userDoc={userDoc} />
      )}

      {userDoc && (
        <>
          <RosterExportModal
            year={userDoc.year}
            open={rosterOpen}
            onClose={() => setRosterOpen(false)}
          />
          <BulkImportModal
            callerUid={userDoc.uid}
            defaultYear={userDoc.year}
            lockYear={userDoc.role !== "top_admin"}
            open={bulkOpen}
            onClose={() => setBulkOpen(false)}
          />
        </>
      )}
    </main>
  );
}

function CheckinList({ grouped }: { grouped: [string, CheckinDoc[]][] }) {
  if (grouped.length === 0) {
    return (
      <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
        ไม่มีการเช็คอินในช่วงนี้
      </CardContent></Card>
    );
  }
  return (
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
  );
}

function UsersInYear({
  year, callerUid, callerRole,
}: {
  year: number;
  callerUid: string;
  callerRole: "admin_teacher" | "top_admin";
}) {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [editing, setEditing] = useState<UserDoc | null>(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [sortMode, setSortMode] = useState<"name" | "classroom">("name");
  const confirm = useConfirm();
  const isTopAdmin = callerRole === "top_admin";

  useEffect(() => {
    const q = isTopAdmin
      ? query(collection(db(), "users"))
      : query(collection(db(), "users"), where("year", "==", year));
    const unsub = onSnapshot(q, (snap) =>
      setUsers(
        snap.docs
          .map((d) => d.data() as UserDoc)
          .sort((a, b) =>
            (a.fullName || a.email || a.uid).localeCompare(b.fullName || b.email || b.uid, "th"),
          ),
      ),
    );
    return () => unsub();
  }, [isTopAdmin, year]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter((u) => {
      if (u.role !== "student") return false;
      if (yearFilter && String(u.year) !== yearFilter) return false;
      if (!s) return true;
      return [u.fullName, u.nickname, u.studentId, u.classroom]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    }).sort((a, b) => {
      const nameA = a.fullName || a.email || a.uid;
      const nameB = b.fullName || b.email || b.uid;
      if (sortMode === "classroom") {
        return (a.classroom || "").localeCompare(b.classroom || "", "th", { numeric: true })
          || nameA.localeCompare(nameB, "th", { numeric: true });
      }
      return nameA.localeCompare(nameB, "th", { numeric: true });
    });
  }, [users, search, yearFilter, sortMode]);

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

  const toggleTrafficRepair = async (uid: string, current: boolean) => {
    try {
      await setUserTrafficRepair(callerUid, uid, !current);
      toast.success(current ? "ปิดสถานะกำลังซ่อมแล้ว" : "เปิดสถานะกำลังซ่อมแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส นร."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as "name" | "classroom")}
          className="h-11 rounded-lg border bg-background px-3"
          aria-label="เรียงผู้ใช้"
        >
          <option value="name">เรียงตามลำดับตัวอักษร</option>
          <option value="classroom">เรียงตามห้อง</option>
        </select>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          disabled={!isTopAdmin}
          className="h-11 rounded-lg border px-3"
        >
          <option value="">{isTopAdmin ? "ทุกชั้นปี" : `ปี ${year}`}</option>
          {[1, 2, 3, 4, 5].map((y) => (
            <option key={y} value={y}>ปี {y}</option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2">ชื่อ</th>
                <th className="px-3 py-2">ห้อง</th>
                <th className="px-3 py-2">ปี</th>
                <th className="px-3 py-2">รหัส นร.</th>
                <th className="px-3 py-2">ซ่อม</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const canManage = isTopAdmin || u.year === year;
                return (
                  <tr key={u.uid} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {u.fullName} <span className="text-muted-foreground">({u.nickname})</span>
                    </td>
                    <td className="px-3 py-2">{u.classroom}</td>
                    <td className="px-3 py-2">{u.year}</td>
                    <td className="px-3 py-2">{u.studentId}</td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <Button
                          variant={u.isTrafficRepair ? "default" : "outline"}
                          size="sm"
                          className="h-8"
                          onClick={() => toggleTrafficRepair(u.uid, !!u.isTrafficRepair)}
                          title="กำลังซ่อม: เช็คอินจราจรได้โดยไม่ต้องเป็นกลุ่มเวรวันนี้ แต่ยังต้องอยู่ในเวลา/ระยะ/GPS"
                        >
                          <Wrench className="mr-1 h-3 w-3" />
                          {u.isTrafficRepair ? "เปิด" : "ปิด"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setEditing(u)} title="แก้ไข">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => onDelete(u.uid, u.fullName)} title="ลบ">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">ดูอย่างเดียว</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editing && (
        <EditUserModal
          callerUid={callerUid}
          callerRole={callerRole}
          user={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["admin_teacher", "admin", "top_admin"]}>
      <AdminTeacherInner />
    </RequireRole>
  );
}
