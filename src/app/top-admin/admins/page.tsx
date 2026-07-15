"use client";

import { useEffect, useState } from "react";
import {
  collection, onSnapshot, query, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RequireRole } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setUserRole } from "@/lib/actions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import Link from "next/link";
import type { Role, UserDoc } from "@/lib/types";

function AdminsInner() {
  const { userDoc: me } = useAuth();
  const [admins, setAdmins] = useState<UserDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db(), "users"),
      where("role", "in", ["admin_student", "admin_teacher", "admin", "top_admin"]),
    );
    const unsub = onSnapshot(q, (snap) =>
      setAdmins(
        snap.docs
          .map((d) => d.data() as UserDoc)
          .sort((a, b) =>
            (a.fullName || a.email || a.uid).localeCompare(b.fullName || b.email || b.uid, "th"),
          ),
      ),
    );
    return () => unsub();
  }, []);

  const change = async (uid: string, role: Role) => {
    if (!me) return;
    setBusy(uid);
    try {
      await setUserRole(me.uid, uid, role);
      toast.success("เปลี่ยนสิทธิ์แล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เปลี่ยนสิทธิ์ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Nav />
      <h1 className="mb-3 text-xl font-bold">จัดการแอดมิน</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        ไปที่หน้า "ผู้ใช้ทั้งหมด" เพื่อเลื่อนนักเรียนเป็นแอดมิน
      </p>

      <Card>
        <CardHeader><CardTitle className="text-base">แอดมินปัจจุบัน</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2">ชื่อ</th>
                <th className="px-3 py-2">อีเมล</th>
                <th className="px-3 py-2">ปี</th>
                <th className="px-3 py-2">สิทธิ์</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((u) => (
                <tr key={u.uid} className="border-b last:border-0">
                  <td className="px-3 py-2">{u.fullName || "—"}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.year || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      u.role === "top_admin" ? "bg-purple-100 text-purple-800"
                        : u.role === "admin_teacher" || u.role === "admin" ? "bg-blue-100 text-blue-800"
                        : "bg-green-100 text-green-800"
                    }`}>
                      {u.role === "top_admin" ? "Top Admin"
                        : u.role === "admin_teacher" || u.role === "admin" ? "Admin Teacher"
                        : "Admin Student"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {u.role !== "top_admin" && (
                      <Button
                        size="sm" variant="outline"
                        disabled={busy === u.uid}
                        onClick={() => change(u.uid, "student")}
                      >
                        ลดเป็นนักเรียน
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}

function Nav() {
  return (
    <nav className="mb-4 flex flex-wrap gap-2 text-sm">
      <Link href="/top-admin" className="rounded border px-3 py-1">ตั้งค่า</Link>
      <Link href="/top-admin/admins" className="rounded bg-primary px-3 py-1 text-primary-foreground">จัดการแอดมิน</Link>
      <Link href="/top-admin/users" className="rounded border px-3 py-1">ผู้ใช้ทั้งหมด</Link>
      <Link href="/top-admin/checkins" className="rounded border px-3 py-1">การเช็คอิน</Link>
      <Link href="/top-admin/groups" className="rounded border px-3 py-1">กลุ่มจราจร</Link>
      <Link href="/top-admin/activities" className="rounded border px-3 py-1">กิจกรรม</Link>
      <Link href="/top-admin/tasks" className="rounded border px-3 py-1">งานทุกชั้นปี</Link>
      <Link href="/top-admin/history" className="rounded border px-3 py-1">ประวัติทั้งหมด</Link>
      <Link href="/top-admin/quick-checkin" className="rounded border px-3 py-1">เช็คอินด่วน</Link>
    </nav>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["top_admin"]}>
      <AdminsInner />
    </RequireRole>
  );
}
