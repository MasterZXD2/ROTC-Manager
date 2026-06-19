"use client";

import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { StudentBottomNav } from "@/components/StudentBottomNav";
import { MyDutyView } from "@/components/MyDutyView";

function DutyInner() {
  const { userDoc } = useAuth();

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-3 text-xl font-bold">รายการปฏิบัติหน้าที่</h1>
      {userDoc && <MyDutyView uid={userDoc.uid} year={userDoc.year} />}
      <StudentBottomNav />
    </main>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["student"]}>
      <DutyInner />
    </RequireRole>
  );
}
