"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { BackupRestore } from "@/components/BackupRestore";
import { useAuth } from "@/lib/auth-context";

export default function Page() {
  const { userDoc } = useAuth();
  return (
    <RequireRole allow={["top_admin"]}>
      <main className="mx-auto max-w-2xl space-y-5 p-4 pb-12">
        <Link href="/top-admin" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />กลับหน้าตั้งค่า</Link>
        <h1 className="text-xl font-semibold">สำรองข้อมูลและเปลี่ยนเทอม</h1>
        {userDoc && <BackupRestore userDoc={userDoc} />}
      </main>
    </RequireRole>
  );
}
