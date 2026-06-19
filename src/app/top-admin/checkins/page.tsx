"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AttendanceStats } from "@/components/AttendanceStats";
import type { CheckinDoc } from "@/lib/types";
import { ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";

type Range = "today" | "week" | "month";

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

function CheckinsInner() {
  const { userDoc, signOut } = useAuth();
  const [range, setRange] = useState<Range>("today");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [items, setItems] = useState<CheckinDoc[]>([]);

  useEffect(() => {
    const since = rangeStart(range);
    const q = query(
      collection(db(), "checkins"),
      where("timestamp", ">=", since),
      orderBy("timestamp", "desc"),
      limit(1000),
    );
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => d.data() as CheckinDoc)));
  }, [range]);

  const filtered = useMemo(
    () => (yearFilter ? items.filter((c) => String(c.year) === yearFilter) : items),
    [items, yearFilter],
  );

  const grouped = useMemo(() => {
    const m = new Map<string, CheckinDoc[]>();
    for (const c of filtered) {
      const day = new Date(c.timestamp).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(c);
    }
    return Array.from(m.entries());
  }, [filtered]);

  // PLACEHOLDER_RENDER
  return (
    <main className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Top Admin</div>
          <div className="font-semibold">การเช็คอิน · ทุกชั้นปี</div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <Nav />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["today", "week", "month"] as const).map((r) => (
          <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>
            {r === "today" ? "วันนี้" : r === "week" ? "7 วัน" : "30 วัน"}
          </Button>
        ))}
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="">ทุกชั้นปี</option>
          {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>ปี {y}</option>)}
        </select>
      </div>

      {grouped.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
          ไม่มีการเช็คอินในช่วงนี้
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([day, list]) => (
            <Card key={day}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{day} · {list.length} รายการ</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2">เวลา</th>
                      <th className="px-3 py-2">ชื่อ</th>
                      <th className="px-3 py-2">ปี</th>
                      <th className="px-3 py-2">ห้อง</th>
                      <th className="px-3 py-2">รอบ</th>
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
                        <td className="px-3 py-2">{c.year}</td>
                        <td className="px-3 py-2">{c.classroom}</td>
                        <td className="px-3 py-2">
                          {c.phase === "in" ? "เช็คอิน" : c.phase === "out" ? "เช็คเอาท์" : "—"}
                        </td>
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
      )}

      <div className="mt-4">
        {userDoc && (
          <AttendanceStats
            year={yearFilter ? Number(yearFilter) : null}
            callerUid={userDoc.uid}
          />
        )}
      </div>
    </main>
  );
}

function Nav() {
  return (
    <nav className="mb-4 flex flex-wrap gap-2 text-sm">
      <Link href="/top-admin" className="rounded border px-3 py-1">ตั้งค่า</Link>
      <Link href="/top-admin/admins" className="rounded border px-3 py-1">จัดการแอดมิน</Link>
      <Link href="/top-admin/users" className="rounded border px-3 py-1">ผู้ใช้ทั้งหมด</Link>
      <Link href="/top-admin/checkins" className="rounded bg-primary px-3 py-1 text-primary-foreground">การเช็คอิน</Link>
      <Link href="/top-admin/groups" className="rounded border px-3 py-1">กลุ่มจราจร</Link>
      <Link href="/top-admin/tasks" className="rounded border px-3 py-1">งานทุกชั้นปี</Link>
      <Link href="/top-admin/history" className="rounded border px-3 py-1">ประวัติทั้งหมด</Link>
    </nav>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["top_admin"]}>
      <CheckinsInner />
    </RequireRole>
  );
}
