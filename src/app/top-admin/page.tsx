"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Plus, Trash2, Eraser } from "lucide-react";
import type { GlobalConfig, TimeSlot, CheckinLocation } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";
import Link from "next/link";
import { cleanupOldCheckins } from "@/lib/actions";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

function ConfigInner() {
  const { userDoc, signOut } = useAuth();
  const confirm = useConfirm();
  const [cfg, setCfg] = useState<GlobalConfig | null>(null);
  const [draft, setDraft] = useState<GlobalConfig>(DEFAULT_CONFIG);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db(), "config/global"), (s) => {
      const data = (s.data() as GlobalConfig | undefined) ?? DEFAULT_CONFIG;
      setCfg(data);
      setDraft(data);
    });
    return () => unsub();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db(), "config/global"), draft, { merge: true });
      setSavedAt(Date.now());
      toast.success("บันทึกการตั้งค่าแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const [cleaning, setCleaning] = useState(false);
  const [togglingInvite, setTogglingInvite] = useState(false);

  const toggleInvite = async () => {
    const next = !(draft.requireInviteCode !== false); // ค่าใหม่: ถ้าเดิมเปิด → ปิด
    setDraft((d) => ({ ...d, requireInviteCode: next }));
    setTogglingInvite(true);
    try {
      await setDoc(doc(db(), "config/global"), { requireInviteCode: next }, { merge: true });
      toast.success(next ? "เปิดระบบรหัสเชิญแล้ว" : "ปิดระบบรหัสเชิญแล้ว");
    } catch (e) {
      // ย้อนค่ากลับถ้าบันทึกไม่สำเร็จ
      setDraft((d) => ({ ...d, requireInviteCode: !next }));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setTogglingInvite(false);
    }
  };

  const runCleanup = async () => {
    const ok = await confirm({
      title: `ล้างประวัติเก่ากว่า ${draft.historyRetentionDays} วัน?`,
      description: "ระบบจะลบ check-in ที่เก่ากว่ากำหนดออกถาวร",
      destructive: true,
      confirmLabel: "ล้าง",
    });
    if (!ok) return;
    setCleaning(true);
    try {
      const n = await cleanupOldCheckins(draft.historyRetentionDays);
      toast.success(`ลบไป ${n} รายการ`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setCleaning(false);
    }
  };

  const addSlot = () =>
    setDraft({
      ...draft,
      timeSlots: [
        ...draft.timeSlots,
        { id: crypto.randomUUID(), start: "08:00", end: "08:30", label: "" },
      ],
    });
  const updateSlot = (id: string, p: Partial<TimeSlot>) =>
    setDraft({
      ...draft,
      timeSlots: draft.timeSlots.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });
  const removeSlot = (id: string) =>
    setDraft({ ...draft, timeSlots: draft.timeSlots.filter((s) => s.id !== id) });

  const addLocation = () =>
    setDraft({
      ...draft,
      locations: [
        ...draft.locations,
        { id: crypto.randomUUID(), name: "", lat: 0, lng: 0 },
      ],
    });
  const updateLoc = (id: string, p: Partial<CheckinLocation>) =>
    setDraft({
      ...draft,
      locations: draft.locations.map((l) => (l.id === id ? { ...l, ...p } : l)),
    });
  const removeLoc = (id: string) =>
    setDraft({ ...draft, locations: draft.locations.filter((l) => l.id !== id) });

  const useMyLocation = (id: string) => {
    if (!navigator.geolocation) return toast.error("อุปกรณ์ไม่รองรับ");
    navigator.geolocation.getCurrentPosition(
      (p) => updateLoc(id, { lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("หาตำแหน่งไม่ได้"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  if (!cfg) return <div className="p-6">กำลังโหลด...</div>;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Top Admin</div>
          <div className="font-semibold">{userDoc?.fullName || userDoc?.email}</div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/top-admin" className="rounded bg-primary px-3 py-1 text-primary-foreground">
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
        <Link href="/top-admin/quick-checkin" className="rounded border px-3 py-1">
          เช็คอินด่วน
        </Link>
      </nav>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">ค่าทั่วไป</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">ระบบรหัสเชิญ</div>
                <div className="text-xs text-muted-foreground">
                  เปิด: นักเรียนต้องขอรหัส 6 หลักจากครูก่อนสมัคร · ปิด: สมัครได้เลย
                </div>
              </div>
              <Button
                variant={draft.requireInviteCode !== false ? "default" : "outline"}
                size="sm"
                disabled={togglingInvite}
                onClick={toggleInvite}
              >
                {draft.requireInviteCode !== false ? "เปิด" : "ปิด"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="รัศมี (เมตร)">
                <Input
                  type="number" min={1}
                  value={draft.allowedRadiusMeters}
                  onChange={(e) => setDraft({ ...draft, allowedRadiusMeters: +e.target.value })}
                />
              </Field>
              <Field label="ความแม่นยำสูงสุดที่ยอมรับ (±เมตร)">
                <Input
                  type="number" min={1}
                  value={draft.maxAccuracyMeters}
                  onChange={(e) => setDraft({ ...draft, maxAccuracyMeters: +e.target.value })}
                />
              </Field>
              <Field label="เก็บประวัติ (วัน)">
                <Input
                  type="number" min={1}
                  value={draft.historyRetentionDays}
                  onChange={(e) => setDraft({ ...draft, historyRetentionDays: +e.target.value })}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              กดปุ่มข้างล่างเพื่อลบประวัติที่เก่ากว่า {draft.historyRetentionDays} วัน
              (แนะนำให้กดเดือนละครั้ง)
            </p>
            <Button variant="outline" size="sm" onClick={runCleanup} disabled={cleaning}>
              <Eraser className="mr-2 h-4 w-4" />
              {cleaning ? "กำลังลบ..." : `ล้างประวัติเก่ากว่า ${draft.historyRetentionDays} วัน`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">ช่วงเวลาเช็คอิน</CardTitle>
            <Button size="sm" variant="outline" onClick={addSlot}>
              <Plus className="mr-1 h-4 w-4" />เพิ่ม
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.timeSlots.length === 0 && (
              <p className="text-sm text-muted-foreground">ยังไม่มีช่วงเวลา</p>
            )}
            {draft.timeSlots.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
                <Input
                  className="w-28" type="time"
                  value={s.start}
                  onChange={(e) => updateSlot(s.id, { start: e.target.value })}
                />
                <span>-</span>
                <Input
                  className="w-28" type="time"
                  value={s.end}
                  onChange={(e) => updateSlot(s.id, { end: e.target.value })}
                />
                <Input
                  placeholder="ชื่อรอบ (ไม่บังคับ)"
                  value={s.label || ""}
                  onChange={(e) => updateSlot(s.id, { label: e.target.value })}
                />
                <Button variant="ghost" size="icon" onClick={() => removeSlot(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">จุดเช็คอิน</CardTitle>
            <Button size="sm" variant="outline" onClick={addLocation}>
              <Plus className="mr-1 h-4 w-4" />เพิ่ม
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {draft.locations.length === 0 && (
              <p className="text-sm text-muted-foreground">ยังไม่มีจุดเช็คอิน</p>
            )}
            {draft.locations.map((l) => (
              <div key={l.id} className="space-y-2 rounded-md border p-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="ชื่อจุด เช่น สนามฝึก"
                    value={l.name}
                    onChange={(e) => updateLoc(l.id, { name: e.target.value })}
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeLoc(l.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="ละติจูด" type="number" step="any"
                    value={l.lat}
                    onChange={(e) => updateLoc(l.id, { lat: +e.target.value })}
                  />
                  <Input
                    placeholder="ลองจิจูด" type="number" step="any"
                    value={l.lng}
                    onChange={(e) => updateLoc(l.id, { lng: +e.target.value })}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => useMyLocation(l.id)}>
                  ใช้ตำแหน่งฉันตอนนี้
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 border-t bg-background p-4">
          <Button size="lg" className="w-full" onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
          {savedAt && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              บันทึกล่าสุด {new Date(savedAt).toLocaleTimeString("th-TH")}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["top_admin"]}>
      <ConfigInner />
    </RequireRole>
  );
}
