"use client";

import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AdminActivitiesTab } from "@/components/AdminActivitiesTab";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogOut, ArrowLeft } from "lucide-react";
import Link from "next/link";

function ActivitiesInner() {
  const { userDoc, signOut } = useAuth();

  if (!userDoc) return null;

  return (
    <main className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin-teacher">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="text-xs text-muted-foreground">
              ครูผู้ช่วย · ปี {userDoc.year}
            </div>
            <div className="font-semibold">กิจกรรม</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <AdminActivitiesTab userDoc={userDoc} />
    </main>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["admin_teacher", "admin"]}>
      <ActivitiesInner />
    </RequireRole>
  );
}
