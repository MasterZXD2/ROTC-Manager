"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RequireRole } from "@/components/RequireRole";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, FlaskConical, UserPlus, Pencil, Upload } from "lucide-react";
import { deleteUserAndCheckins, setUserRole, setUserYear, setUserTester, createInviteCode } from "@/lib/actions";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import type { UserDoc, Role } from "@/lib/types";
import { EditUserModal } from "@/components/EditUserModal";
import { BulkImportModal } from "@/components/BulkImportModal";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";

function UsersInner() {
  const { userDoc: me } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [invCode, setInvCode] = useState<{ value: string; expiresAt: number } | null>(null);
  const [busyInv, setBusyInv] = useState(false);
  const [editing, setEditing] = useState<UserDoc | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const newInvCode = async () => {
    if (!me) return;
    setBusyInv(true);
    try {
      const r = await createInviteCode({ callerUid: me.uid });
      setInvCode({ value: r.code, expiresAt: r.expiresAt });
      toast.success("สร้างรหัสเชิญแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally { setBusyInv(false); }
  };

  useEffect(() => {
    const q = query(collection(db(), "users"), orderBy("fullName"));
    const unsub = onSnapshot(q, (snap) =>
      setUsers(snap.docs.map((d) => d.data() as UserDoc)),
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter((u) => {
      if (yearFilter && String(u.year) !== yearFilter) return false;
      if (!s) return true;
      return [u.fullName, u.nickname, u.studentId, u.email, u.classroom]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    });
  }, [users, search, yearFilter]);

  const changeRole = async (uid: string, role: Role) => {
    if (!me) return;
    setBusy(uid);
    try {
      await setUserRole(me.uid, uid, role);
      toast.success("เปลี่ยนสิทธิ์แล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally { setBusy(null); }
  };

  const changeYear = async (uid: string, year: number) => {
    if (!me) return;
    setBusy(uid);
    try {
      await setUserYear(me.uid, uid, year);
      toast.success(`ย้ายไปปี ${year} แล้ว`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally { setBusy(null); }
  };

  const toggleTester = async (uid: string, current: boolean) => {
    if (!me) return;
    setBusy(uid);
    try {
      await setUserTester(me.uid, uid, !current);
      toast.success(current ? "ปิดโหมด Tester" : "เปิดโหมด Tester");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally { setBusy(null); }
  };

  const del = async (uid: string, name: string) => {
    if (!me) return;
    const ok = await confirm({
      title: `ลบ ${name}?`,
      description: "ประวัติเช็คอินทั้งหมดของผู้ใช้นี้จะถูกลบด้วย\nหมายเหตุ: ลบ Auth account ต้องเข้า Firebase Console เอง",
      destructive: true,
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    setBusy(uid);
    try {
      await deleteUserAndCheckins(me.uid, uid);
      toast.success("ลบผู้ใช้แล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally { setBusy(null); }
  };

  return (
    <main className="mx-auto max-w-4xl p-4">
      <Nav />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">ผู้ใช้ทั้งหมด ({filtered.length})</h1>
        <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
          <Upload className="mr-1 h-4 w-4" />นำเข้านักเรียน
        </Button>
      </div>

      <Card className="mb-4 border-blue-300">
        <CardContent className="pt-4">
          <div className="mb-1 text-sm font-semibold text-blue-700">รหัสเชิญสำหรับ Login (ทุกชั้นปี)</div>
          <p className="mb-3 text-xs text-muted-foreground">
            รหัสจาก Top Admin — นักเรียนใหม่กรอกตอนสมัคร เลือกชั้นปีเองได้
          </p>
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
              <UserPlus className="mr-2 h-4 w-4" />สร้างรหัสเชิญ (5 นาที · ใช้ได้ทุกชั้นปี)
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส นร."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="h-11 rounded-lg border px-3"
        >
          <option value="">ทุกชั้นปี</option>
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
                <th className="px-3 py-2">ชั้นปี</th>
                <th className="px-3 py-2">รหัส นร.</th>
                <th className="px-3 py-2">สิทธิ์</th>
                <th className="px-3 py-2">Tester</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.uid} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div>{u.fullName || u.email}</div>
                    {u.nickname && <div className="text-xs text-muted-foreground">{u.nickname}</div>}
                  </td>
                  <td className="px-3 py-2">{u.classroom || "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.year || ""}
                      disabled={busy === u.uid || u.uid === me?.uid}
                      onChange={(e) => changeYear(u.uid, Number(e.target.value))}
                      className="h-8 rounded border px-2 text-xs"
                    >
                      <option value="" disabled>—</option>
                      {[1, 2, 3, 4, 5].map((y) => (
                        <option key={y} value={y}>ปี {y}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{u.studentId || "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={busy === u.uid || u.uid === me?.uid}
                      onChange={(e) => changeRole(u.uid, e.target.value as Role)}
                      className="h-8 rounded border px-2 text-xs"
                    >
                      <option value="student">นักเรียน</option>
                      <option value="admin_student">Admin (นักเรียน)</option>
                      <option value="admin_teacher">Admin (ครู)</option>
                      <option value="top_admin">Top Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant={u.isTester ? "default" : "outline"}
                      size="sm"
                      disabled={busy === u.uid}
                      onClick={() => toggleTester(u.uid, !!u.isTester)}
                      className="h-8"
                      title={u.isTester ? "ปิดโหมด Tester" : "เปิดโหมด Tester (ข้าม GPS/เวลา/โควต้า)"}
                    >
                      <FlaskConical className="mr-1 h-3 w-3" />
                      {u.isTester ? "เปิด" : "ปิด"}
                    </Button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost" size="icon"
                      disabled={busy === u.uid}
                      onClick={() => setEditing(u)}
                      title="แก้ไข"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      disabled={busy === u.uid || u.uid === me?.uid}
                      onClick={() => del(u.uid, u.fullName || u.email)}
                      title="ลบ"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editing && me && (
        <EditUserModal
          callerUid={me.uid}
          callerRole="top_admin"
          user={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
        />
      )}

      {me && (
        <BulkImportModal
          callerUid={me.uid}
          defaultYear={1}
          lockYear={false}
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </main>
  );
}

function Nav() {
  return (
    <nav className="mb-4 flex flex-wrap gap-2 text-sm">
      <Link href="/top-admin" className="rounded border px-3 py-1">ตั้งค่า</Link>
      <Link href="/top-admin/admins" className="rounded border px-3 py-1">จัดการแอดมิน</Link>
      <Link href="/top-admin/users" className="rounded bg-primary px-3 py-1 text-primary-foreground">ผู้ใช้ทั้งหมด</Link>
      <Link href="/top-admin/checkins" className="rounded border px-3 py-1">การเช็คอิน</Link>
      <Link href="/top-admin/groups" className="rounded border px-3 py-1">กลุ่มจราจร</Link>
      <Link href="/top-admin/tasks" className="rounded border px-3 py-1">งานทุกชั้นปี</Link>
      <Link href="/top-admin/history" className="rounded border px-3 py-1">ประวัติทั้งหมด</Link>
    </nav>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["top_admin"]}>
      <UsersInner />
    </RequireRole>
  );
}
