"use client";

import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronLeft } from "lucide-react";
import { StudentCheckinView } from "@/components/StudentCheckinView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRouter } from "next/navigation";
import Link from "next/link";

function QuickCheckinPage() {
  const { userDoc, signOut } = useAuth();
  const router = useRouter();

  if (!userDoc) return null;

  return (
    <main className="mx-auto max-w-4xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Top Admin</div>
            <h1 className="text-xl font-bold">เช็คอินด่วน</h1>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/top-admin" className="rounded border px-3 py-1">
          ตั้งค่า
        </Link>
        <Link href="/top-admin/admins" className="rounded border px-3 py-1">
          จัดการแอดมิน
        </Link>
        <Link href="/top-admin/users" className="rounded border px-3 py-1">
          ผู้ใช้ทั้งหมด
        </Link>
        <Link href="/top-admin/checkins" className="rounded border px-3 py-1">
          การเช็คอิน
        </Link>
        <Link href="/top-admin/groups" className="rounded border px-3 py-1">
          กลุ่มจราจร
        </Link>
        <Link href="/top-admin/activities" className="rounded border px-3 py-1">
          กิจกรรม
        </Link>
        <Link href="/top-admin/tasks" className="rounded border px-3 py-1">
          งานทุกชั้นปี
        </Link>
        <Link href="/top-admin/history" className="rounded border px-3 py-1">
          ประวัติทั้งหมด
        </Link>
        <Link href="/top-admin/quick-checkin" className="rounded bg-primary px-3 py-1 text-primary-foreground">
          เช็คอินด่วน
        </Link>
      </nav>

      <StudentCheckinView userDoc={userDoc} />
    </main>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["top_admin"]}>
      <QuickCheckinPage />
    </RequireRole>
  );
}
