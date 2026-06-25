"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useGeolocation } from "@/lib/useGeolocation";
import { distanceMeters } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, CheckCircle2, KeyRound } from "lucide-react";
import { submitActivityCheckin, submitActivityEmergencyCheckin } from "@/lib/actions";
import { toast } from "sonner";
import type { ActivityDoc, ActivityCheckinDoc, UserDoc } from "@/lib/types";

export function ActivityCheckin({ userDoc }: { userDoc: UserDoc }) {
  const gps = useGeolocation(true);
  const [activities, setActivities] = useState<ActivityDoc[]>([]);
  const [checkins, setCheckins] = useState<ActivityCheckinDoc[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    const q = query(
      collection(db(), "activities"),
      where("year", "==", userDoc.year),
      where("isOpen", "==", true),
    );
    return onSnapshot(q, (snap) =>
      setActivities(snap.docs.map((d) => d.data() as ActivityDoc)),
    );
  }, [userDoc.year]);

  useEffect(() => {
    const q = query(
      collection(db(), "activityCheckins"),
      where("userId", "==", userDoc.uid),
    );
    return onSnapshot(q, (snap) =>
      setCheckins(snap.docs.map((d) => d.data() as ActivityCheckinDoc)),
    );
  }, [userDoc.uid]);

  const handleGpsCheckin = async (activity: ActivityDoc) => {
    if (!gps.position) return toast.error("รอสัญญาณ GPS");
    if (gps.accuracy !== null && gps.accuracy > 100) {
      return toast.error(`ความแม่นยำ GPS ต่ำ (${gps.accuracy.toFixed(0)} ม.)`);
    }

    setSubmitting(activity.id);
    try {
      await submitActivityCheckin(
        userDoc.uid,
        activity.id,
        { lat: gps.position.lat, lng: gps.position.lng },
        gps.accuracy ?? 0,
      );
      toast.success("เช็คอินสำเร็จ!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เช็คอินไม่สำเร็จ");
    } finally {
      setSubmitting(null);
    }
  };

  const handleCodeCheckin = async (activityId: string) => {
    if (!code.trim()) return toast.error("กรอกรหัสฉุกเฉิน");
    setSubmitting(activityId);
    try {
      await submitActivityEmergencyCheckin(userDoc.uid, code);
      toast.success("เช็คอินสำเร็จ!");
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เช็คอินไม่สำเร็จ");
    } finally {
      setSubmitting(null);
    }
  };

  const isCheckedIn = (activityId: string) =>
    checkins.some((c) => c.activityId === activityId);

  const nearestDistance = (activity: ActivityDoc) => {
    if (!gps.position) return null;
    let best = Infinity;
    for (const loc of activity.locations) {
      const d = distanceMeters({ lat: gps.position.lat, lng: gps.position.lng }, loc);
      if (d < best) best = d;
    }
    return best;
  };

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          ยังไม่มีการเช็คอินในขณะนี้<br />
          รอครูหรือหัวหน้าเปิดให้เช็คอิน
        </CardContent>
      </Card>
    );
  }

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

      {activities.map((activity) => {
        const checked = isCheckedIn(activity.id);
        const dist = nearestDistance(activity);
        const canCheckin = dist !== null && dist <= activity.radiusMeters;

        return (
          <Card key={activity.id} className={checked ? "border-green-500 bg-green-50" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {checked && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                กิจกรรม {activity.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {activity.locations.length} จุด · ระยะ {activity.radiusMeters} ม.
              </div>

              {checked ? (
                <div className="rounded bg-green-100 p-3 text-center font-medium text-green-700">
                  ✓ คุณเช็คอินแล้ว
                </div>
              ) : (
                <>
                  {dist !== null && (
                    <div className="text-xs text-muted-foreground">
                      ระยะห่างจากจุดใกล้สุด: {dist.toFixed(0)} ม.
                    </div>
                  )}

                  <Button
                    onClick={() => handleGpsCheckin(activity)}
                    disabled={!canCheckin || submitting === activity.id}
                    className="w-full"
                  >
                    {submitting === activity.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {canCheckin ? "เช็คอินด้วย GPS" : "อยู่นอกระยะ"}
                  </Button>

                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="รหัสฉุกเฉิน 6 หลัก"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      maxLength={6}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleCodeCheckin(activity.id)}
                      disabled={submitting === activity.id}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
