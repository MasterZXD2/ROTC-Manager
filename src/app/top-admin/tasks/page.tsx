"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { TasksPanel } from "@/components/TasksPanel";
import { PassingPercentCard } from "@/components/PassingPercentCard";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

function TasksInner() {
  const { userDoc, signOut } = useAuth();
  const [year, setYear] = useState<number>(1);

  return (
    <main className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Top Admin</div>
          <div className="font-semibold">งานทุกชั้นปี</div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <Nav />

      <div className="mb-4">
        <div className="mb-2 text-sm font-medium">เลือกชั้นปี</div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((y) => (
            <Button
              key={y}
              variant={year === y ? "default" : "outline"}
              size="sm"
              onClick={() => setYear(y)}
            >
              ปี {y}
            </Button>
          ))}
        </div>
      </div>

      {userDoc && (
        <>
          <PassingPercentCard callerUid={userDoc.uid} year={year} />
          <TasksPanel callerUid={userDoc.uid} year={year} />
        </>
      )}
    </main>
  );
}

function Nav() {
  return (
    <nav className="mb-4 flex flex-wrap gap-2 text-sm">
      <Link href="/top-admin" className="rounded border px-3 py-1">ตั้งค่า</Link>
      <Link href="/top-admin/admins" className="rounded border px-3 py-1">จัดการแอดมิน</Link>
      <Link href="/top-admin/users" className="rounded border px-3 py-1">ผู้ใช้ทั้งหมด</Link>
      <Link href="/top-admin/checkins" className="rounded border px-3 py-1">การเช็คอิน</Link>
      <Link href="/top-admin/groups" className="rounded border px-3 py-1">กลุ่มจราจร</Link>
      <Link href="/top-admin/activities" className="rounded border px-3 py-1">กิจกรรม</Link>
      <Link href="/top-admin/tasks" className="rounded bg-primary px-3 py-1 text-primary-foreground">งานทุกชั้นปี</Link>
      <Link href="/top-admin/history" className="rounded border px-3 py-1">ประวัติทั้งหมด</Link>
    </nav>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["top_admin"]}>
      <TasksInner />
    </RequireRole>
  );
}
