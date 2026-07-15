"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useGeolocation } from "@/lib/useGeolocation";
import { distanceMeters, hhmmToMinutes, nowMinutesBangkok, todayKeyBangkok } from "@/lib/utils";
import type { GlobalConfig, GroupDoc, UserDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";
import { submitCheckin, submitCheckinWithCode } from "@/lib/actions";
import { toast } from "sonner";

export function TrafficCheckin({ userDoc }: { userDoc: UserDoc }) {
  const gps = useGeolocation(true);
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [todayCount, setTodayCount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const [tick, setTick] = useState(0);
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [code, setCode] = useState("");
  const [submittingCode, setSubmittingCode] = useState(false);

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

  useEffect(() => {
    if (!userDoc?.year) return;
    const q = query(collection(db(), "groups"), where("year", "==", userDoc.year));
    const unsub = onSnapshot(q, (s) =>
      setGroups(s.docs.map((d) => d.data() as GroupDoc)),
    );
    return () => unsub();
  }, [userDoc?.year]);

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

  const canCheckin = useMemo(() => {
    if (!config || !gps.position || !activeSlot || config.locations.length === 0) return false;
    // หาจุดใกล้สุด
    let minDist = Infinity;
    for (const loc of config.locations) {
      const d = distanceMeters(gps.position, loc);
      if (d < minDist) minDist = d;
    }
    return minDist <= config.allowedRadiusMeters && (duty.isMyTurn || !!userDoc.isTrafficRepair);
  }, [config, gps.position, activeSlot, tick, duty.isMyTurn, userDoc.isTrafficRepair]);

  const handleCheckin = async () => {
    if (!userDoc) return;
    if (!gps.position) return toast.error("รอสัญญาณ GPS");
    if (gps.accuracy && gps.accuracy > 100) {
      return toast.error(`ความแม่นยำ GPS ต่ำ (${gps.accuracy.toFixed(0)} ม.)`);
    }
    if (!canCheckin) return toast.error("อยู่นอกระยะเช็คอิน");

    setSubmitting(true);
    try {
      await submitCheckin(
        userDoc.uid,
        { lat: gps.position.lat, lng: gps.position.lng },
        gps.accuracy ?? 0,
      );
      toast.success("เช็คอินสำเร็จ!");
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เช็คอินไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeCheckin = async () => {
    if (!userDoc) return;
    if (!code.trim()) return toast.error("กรอกรหัส 6 หลัก");
    setSubmittingCode(true);
    try {
      await submitCheckinWithCode(userDoc.uid, code);
      toast.success("เช็คอินสำเร็จ!");
      setCode("");
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เช็คอินไม่สำเร็จ");
    } finally {
      setSubmittingCode(false);
    }
  };

  if (!userDoc) return null;

  return (
    <div className="space-y-3">
      {gps.loading && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-6 text-center text-sm text-blue-700">
            กำลังตรวจสอบตำแหน่ง GPS...
          </CardContent>
        </Card>
      )}

      {gps.error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-center text-sm text-red-700">
            {gps.error.message}
          </CardContent>
        </Card>
      )}

      {gps.position && gps.accuracy !== null && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4 text-center text-sm text-green-700">
            ✓ GPS พร้อม (ความแม่นยำ {gps.accuracy.toFixed(0)} ม.)
          </CardContent>
        </Card>
      )}

      {justChecked && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="flex items-center gap-2 py-4 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">เช็คอินสำเร็จ!</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">เช็คอินจราจร</CardTitle>
          <p className="text-xs text-muted-foreground">
            วันนี้เช็คอินไปแล้ว {todayCount} ครั้ง
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeSlot ? (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              ช่วงเวลา: {activeSlot.start} - {activeSlot.end}
            </div>
          ) : nextSlot ? (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              ยังไม่ถึงเวลา — ช่วงถัดไป {nextSlot.start}
            </div>
          ) : (
            <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-600">
              ไม่มีช่วงเช็คอินในวันนี้
            </div>
          )}

          {duty.myGroup && (
            <div className="text-sm">
              <p className="text-muted-foreground">กลุ่มของคุณ: กลุ่ม {duty.myGroup.number}</p>
              {duty.currentDuty && (
                <p className="text-muted-foreground">
                  เวรปัจจุบัน: กลุ่ม {duty.currentDuty.number}
                  {duty.isMyTurn && <span className="ml-2 text-green-600">← ถึงเวรคุณ!</span>}
                </p>
              )}
            </div>
          )}
          {userDoc.isTrafficRepair && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-700">
              สถานะกำลังซ่อม: เช็คอินได้โดยไม่ต้องเป็นกลุ่มเวรวันนี้
            </div>
          )}

          {config && gps.position && config.locations.length > 0 && (
            <div className="space-y-2">
              {config.locations.map((loc) => {
                const dist = distanceMeters(gps.position!, loc);
                return (
                  <div key={loc.id} className="rounded-lg border p-2 text-sm">
                    <div className="font-medium">{loc.name}</div>
                    <div className="text-muted-foreground">
                      ระยะ: {dist.toFixed(0)} ม. {dist <= config.allowedRadiusMeters && <span className="text-green-600">✓ อยู่ในระยะ</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button
            onClick={handleCheckin}
            disabled={!canCheckin || submitting || !activeSlot}
            className="w-full"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                กำลังเช็คอิน...
              </>
            ) : (
              "เช็คอิน GPS"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-300">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-700">
            <KeyRound className="h-4 w-4" />
            เช็คอินด้วยรหัสฉุกเฉิน
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            ใช้เมื่อ GPS ใช้ไม่ได้ — ขอรหัส 6 หลักจากครู
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            type="text"
            placeholder="กรอกรหัส 6 หลัก"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="text-center text-lg tracking-widest"
          />
          <Button
            onClick={handleCodeCheckin}
            disabled={submittingCode || code.length !== 6}
            variant="outline"
            className="w-full"
          >
            {submittingCode ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                กำลังเช็คอิน...
              </>
            ) : (
              "เช็คอินด้วยรหัส"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
