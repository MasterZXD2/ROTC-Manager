"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { StudentBottomNav } from "@/components/StudentBottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CheckinDoc, ActivityDoc, ActivityCheckinDoc, ActivityExemptionDoc } from "@/lib/types";
import { ExternalLink, MapPin, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

type Tab = "activities" | "history";

function HistoryInner() {
  const { userDoc } = useAuth();
  const [tab, setTab] = useState<Tab>("activities");
  const [items, setItems] = useState<CheckinDoc[]>([]);
  const [activities, setActivities] = useState<ActivityDoc[]>([]);
  const [activityCheckins, setActivityCheckins] = useState<ActivityCheckinDoc[]>([]);
  const [activityExemptions, setActivityExemptions] = useState<ActivityExemptionDoc[]>([]);

  useEffect(() => {
    if (!userDoc) return;
    const q = query(
      collection(db(), "checkins"),
      where("userId", "==", userDoc.uid),
      orderBy("timestamp", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => d.data() as CheckinDoc)),
    );
    return () => unsub();
  }, [userDoc]);

  useEffect(() => {
    if (!userDoc) return;
    // ดึงกิจกรรมที่เปิดเผย (isVisible = true หรือ undefined)
    const q = query(
      collection(db(), "activities"),
      where("year", "==", userDoc.year),
    );
    const unsub = onSnapshot(q, (snap) =>
      setActivities(snap.docs.map((d) => d.data() as ActivityDoc).filter((a) => a.isVisible !== false)),
    );
    return () => unsub();
  }, [userDoc]);

  useEffect(() => {
    if (!userDoc) return;
    const q = query(
      collection(db(), "activityCheckins"),
      where("userId", "==", userDoc.uid),
    );
    const unsub = onSnapshot(q, (snap) =>
      setActivityCheckins(snap.docs.map((d) => d.data() as ActivityCheckinDoc)),
    );
    return () => unsub();
  }, [userDoc]);

  useEffect(() => {
    if (!userDoc) return;
    const q = query(
      collection(db(), "activityExemptions"),
      where("studentUid", "==", userDoc.uid),
    );
    const unsub = onSnapshot(q, (snap) =>
      setActivityExemptions(snap.docs.map((d) => d.data() as ActivityExemptionDoc)),
    );
    return () => unsub();
  }, [userDoc]);

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-3 text-xl font-bold">ประวัติการเช็คอิน</h1>

      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={tab === "activities" ? "default" : "outline"}
          onClick={() => setTab("activities")}
        >
          กิจกรรม
        </Button>
        <Button
          size="sm"
          variant={tab === "history" ? "default" : "outline"}
          onClick={() => setTab("history")}
        >
          ประวัติการเช็คอิน
        </Button>
      </div>

      {tab === "activities" ? (
        <>
          {activities.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                ยังไม่มีกิจกรรม
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {activities.map((activity) => {
              const checkedIn = activityCheckins.some((ac) => ac.activityId === activity.id);
              const exempted = activityExemptions.some((ae) => ae.activityId === activity.id);
              const attended = checkedIn || exempted;
              return (
                <Card key={activity.id} className="border-blue-200 bg-blue-50/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{activity.name}</CardTitle>
                      {attended ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {activity.type === "external" ? (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">
                          ภายนอก
                        </span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                          ทั่วไป
                        </span>
                      )}
                      <span className={attended ? "font-medium text-green-600" : "text-gray-500"}>
                        {attended ? (exempted ? "ได้รับการยกเว้น" : "เช็คอินแล้ว") : "ยังไม่ได้เช็คอิน"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {items.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                ยังไม่มีประวัติ
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {items.map((c) => (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {new Date(c.timestamp).toLocaleString("th-TH", {
                      timeZone: "Asia/Bangkok",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    ห่าง {c.distanceMeters >= 0 ? `${c.distanceMeters} ม.` : "—"} · ±
                    {Math.round(c.accuracy)} ม.
                    {c.method === "emergency_code" && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 text-amber-800">
                        รหัสฉุกเฉิน
                      </span>
                    )}
                  </div>
                  {c.mapLink ? (
                    <Link
                      href={c.mapLink}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      ดูบนแผนที่ <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">— ไม่มีตำแหน่ง (รหัสฉุกเฉิน)</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <StudentBottomNav />
    </main>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["student"]}>
      <HistoryInner />
    </RequireRole>
  );
}
