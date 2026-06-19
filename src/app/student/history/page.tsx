"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { StudentBottomNav } from "@/components/StudentBottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CheckinDoc } from "@/lib/types";
import { ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";

function HistoryInner() {
  const { userDoc } = useAuth();
  const [items, setItems] = useState<CheckinDoc[]>([]);

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

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-3 text-xl font-bold">ประวัติการเช็คอิน</h1>

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
            <CardContent className="text-xs text-muted-foreground space-y-1">
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
