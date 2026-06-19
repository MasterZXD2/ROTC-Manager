"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useGeolocation } from "@/lib/useGeolocation";
import { distanceMeters, hhmmToMinutes, nowMinutesBangkok, todayKeyBangkok } from "@/lib/utils";
import type { GlobalConfig, GroupDoc } from "@/lib/types";
import { GpsStatus } from "@/components/GpsStatus";
import { HelpModal } from "@/components/HelpModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, LogOut, KeyRound, CheckCircle2, Settings } from "lucide-react";
import { submitCheckin, submitCheckinWithCode } from "@/lib/actions";
import { RequireRole } from "@/components/RequireRole";
import { StudentBottomNav } from "@/components/StudentBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ActivityCheckin } from "@/components/ActivityCheckin";
import { toast } from "sonner";

const CheckinMap = dynamic(
  () => import("@/components/CheckinMap").then((m) => m.CheckinMap),
  { ssr: false, loading: () => <div className="h-60 animate-pulse rounded-xl bg-muted" /> },
);

function CheckinInner() {
  const { userDoc, signOut } = useAuth();
  const gps = useGeolocation(true);
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [todayCount, setTodayCount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const [tick, setTick] = useState(0);
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [checkinType, setCheckinType] = useState<"traffic" | "activity">("traffic");

  // re-evaluate time/distance every 10s
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db(), "config/global"), (s) =>
      setConfig(s.exists() ? (s.data() as GlobalConfig) : null),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!userDoc) return;
    const dayKey = todayKeyBangkok();
    const ref = doc(db(), `users/${userDoc.uid}/dailyCheckins/${dayKey}`);
    const unsub = onSnapshot(ref, (s) =>
      setTodayCount((s.data()?.count as number | undefined) ?? 0),
    );
    return () => unsub();
  }, [userDoc]);

  // กลุ่มจราจรของชั้นปี — ใช้หา "เวรปัจจุบัน"
  useEffect(() => {
    if (!userDoc?.year) return;
    const q = query(collection(db(), "groups"), where("year", "==", userDoc.year));
    const unsub = onSnapshot(q, (s) =>
      setGroups(s.docs.map((d) => d.data() as GroupDoc)),
    );
    return () => unsub();
  }, [userDoc?.year]);

  // กลุ่มของ user + เวรปัจจุบัน (กลุ่มแรกที่ยังไม่เช็ค เรียงตามเลข)
  const duty = useMemo(() => {
    if (!userDoc) return { myGroup: null, currentDuty: null, isMyTurn: false };
    const sorted = [...groups].sort((a, b) => a.number - b.number);
    const myGroup = sorted.find((g) => g.memberUids.includes(userDoc.uid)) ?? null;
    const currentDuty = sorted.find((g) => !g.checkStatus) ?? null;
    const isMyTurn = !!myGroup && !!currentDuty && myGroup.id === currentDuty.id;
    return { myGroup, currentDuty, isMyTurn };
  }, [groups, userDoc]);

  const activeSlot = useMemo(() => {
    if (!config) return null;
    const now = nowMinutesBangkok();
    return (
      config.timeSlots.find(
        (s) => now >= hhmmToMinutes(s.start) && now <= hhmmToMinutes(s.end),
      ) ?? null
    );
  }, [config, tick]);

  const nextSlot = useMemo(() => {
    if (!config) return null;
    const now = nowMinutesBangkok();
    return (
      [...config.timeSlots]
        .sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start))
        .find((s) => hhmmToMinutes(s.start) > now) ?? null
    );
  }, [config, tick]);

  const nearest = useMemo(() => {
    if (!config || !gps.position) return null;
    let best: { id: string; name: string; lat: number; lng: number; dist: number } | null = null;
    for (const l of config.locations) {
      const d = distanceMeters(gps.position, l);
      if (!best || d < best.dist) best = { ...l, dist: d };
    }
    return best;
  }, [config, gps.position]);

  const isTester = !!userDoc?.isTester;

  const withinTime = !!activeSlot;
  const withinRadius =
    !!nearest && !!config && nearest.dist <= config.allowedRadiusMeters;
  // วันละ 2 รอบ: 0 = เช็คอิน, 1 = เช็คเอาท์, >=2 = เสร็จสิ้น
  const phase: "in" | "out" | "done" =
    todayCount <= 0 ? "in" : todayCount === 1 ? "out" : "done";
  const dailyDone = !isTester && phase === "done";
  const accuracyOk =
    gps.accuracy !== null && config !== null && gps.accuracy <= config.maxAccuracyMeters;
  const canCheckin = isTester
    ? !!gps.position
    : withinTime && withinRadius && accuracyOk && duty.isMyTurn && !dailyDone && !!gps.position;

  const onCheckin = async () => {
    if (!gps.position || !gps.accuracy || !userDoc) return;
    setSubmitting(true);
    try {
      await submitCheckin(userDoc.uid, gps.position, gps.accuracy);
      toast.success(phase === "in" ? "เช็คอินสำเร็จ" : "เช็คเอาท์สำเร็จ");
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 2500);
    } catch (e) {
      const m = e instanceof Error ? e.message : "ไม่สำเร็จ";
      toast.error(m);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">สวัสดี</div>
          <div className="font-semibold">
            {userDoc?.nickname || userDoc?.fullName} · ปี {userDoc?.year} · {userDoc?.classroom}
          </div>
          {isTester && (
            <div className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              โหมด Tester · ข้ามทุกเงื่อนไข
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="mb-4 flex gap-2">
        <Button
          variant={checkinType === "traffic" ? "default" : "outline"}
          onClick={() => setCheckinType("traffic")}
          className="flex-1"
        >
          จราจร
        </Button>
        <Button
          variant={checkinType === "activity" ? "default" : "outline"}
          onClick={() => setCheckinType("activity")}
          className="flex-1"
        >
          กิจกรรม
        </Button>
      </div>

      {checkinType === "activity" && userDoc ? (
        <ActivityCheckin userDoc={userDoc} />
      ) : !config ? (
        <Card className="mb-4">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            กำลังโหลดการตั้งค่า...
          </CardContent>
        </Card>
      ) : (
        <>
          {!isTester && (
            <Card className={`mb-3 ${duty.isMyTurn ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
              <CardContent className="pt-4 text-sm">
                {!duty.myGroup ? (
                  <span className="text-amber-800">คุณยังไม่ได้อยู่ในกลุ่มจราจร — เช็คอินไม่ได้</span>
                ) : !duty.currentDuty ? (
                  <span className="text-amber-800">วันนี้ไม่มีกลุ่มที่เป็นเวร</span>
                ) : duty.isMyTurn ? (
                  <span className="font-medium text-green-800">
                    ✓ ตอนนี้เป็นเวรของกลุ่ม {duty.myGroup.number} (กลุ่มคุณ) — เช็คอินได้
                  </span>
                ) : (
                  <span className="text-amber-800">
                    ยังไม่ถึงเวรกลุ่มคุณ — ตอนนี้เวรกลุ่ม {duty.currentDuty.number} (คุณอยู่กลุ่ม {duty.myGroup.number})
                  </span>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="mb-3">
            <CardHeader>
              <CardTitle className="text-base">ช่วงเวลาที่เช็คอินได้</CardTitle>
            </CardHeader>
            <CardContent>
              {config.timeSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีช่วงเวลา</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {config.timeSlots.map((s) => {
                    const isActive = activeSlot?.id === s.id;
                    return (
                      <li
                        key={s.id}
                        className={`flex justify-between rounded px-2 py-1 ${
                          isActive ? "bg-green-100 font-semibold text-green-800" : ""
                        }`}
                      >
                        <span>{s.label || "รอบเช็คอิน"}</span>
                        <span>
                          {s.start} - {s.end}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <CheckinMap
            user={gps.position}
            targets={config.locations}
            radius={config.allowedRadiusMeters}
          />

          <div className="my-3 space-y-2">
            <GpsStatus
              gps={gps}
              withinTime={withinTime}
              withinRadius={withinRadius}
              distance={nearest?.dist ?? null}
              radius={config.allowedRadiusMeters}
              maxAccuracy={config.maxAccuracyMeters}
              dailyDone={dailyDone}
              nextSlot={nextSlot}
            />
            {gps.error && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      () => toast.success("สิทธิ์ GPS อนุญาตแล้ว กรุณารอสักครู่"),
                      () => toast.error("กรุณาอนุญาตสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์"),
                      { enableHighAccuracy: true }
                    );
                  }
                }}
              >
                <Settings className="mr-2 h-4 w-4" />
                ตั้งค่าสิทธิ์ GPS
              </Button>
            )}
          </div>

          <Button
            size="lg"
            className={`w-full transition-all ${
              dailyDone
                ? "bg-gray-400 text-white hover:bg-gray-400"
                : justChecked
                ? "bg-green-600 hover:bg-green-600"
                : phase === "out"
                ? "bg-red-600 text-white hover:bg-red-700"
                : ""
            }`}
            disabled={(!canCheckin && !dailyDone) || submitting || justChecked || dailyDone}
            onClick={onCheckin}
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : justChecked ? (
              <>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                สำเร็จ
              </>
            ) : dailyDone ? (
              "หน้าที่จราจรเสร็จสิ้น"
            ) : phase === "out" ? (
              "เช็คเอาท์"
            ) : (
              "เช็คอิน"
            )}
          </Button>

          <EmergencyCodeBox
            uid={userDoc?.uid ?? ""}
            onSuccess={() => {
              toast.success("เช็คอินสำเร็จด้วยรหัส");
              setJustChecked(true);
              setTimeout(() => setJustChecked(false), 2500);
            }}
          />

          <div className="mt-2 flex justify-center">
            <HelpModal />
          </div>
        </>
      )}

      <StudentBottomNav />
    </main>
  );
}

function EmergencyCodeBox({ uid, onSuccess }: { uid: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) {
      setErr("รหัสต้องเป็นตัวเลข 6 หลัก");
      return;
    }
    if (!uid) return;
    setBusy(true);
    setErr(null);
    try {
      await submitCheckinWithCode(uid, code);
      onSuccess();
      setOpen(false);
      setCode("");
    } catch (e) {
      const m = e instanceof Error ? e.message : "ไม่สำเร็จ";
      setErr(m);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border bg-secondary/40 p-3">
      {!open ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          GPS ใช้ไม่ได้? ใช้รหัสฉุกเฉินจากครู
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">กรอกรหัส 6 หลัก</p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            className="text-center text-lg tracking-widest"
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ยืนยัน"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["student"]}>
      <CheckinInner />
    </RequireRole>
  );
}
