"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { StudentBottomNav } from "@/components/StudentBottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, AlertCircle } from "lucide-react";
import type { GroupDoc } from "@/lib/types";

function ShiftsInner() {
  const { userDoc } = useAuth();
  const [myGroup, setMyGroup] = useState<GroupDoc | null>(null);
  const [allGroups, setAllGroups] = useState<GroupDoc[]>([]);

  // หากลุ่มของตัวเอง
  useEffect(() => {
    if (!userDoc?.uid) return;
    const q = query(
      collection(db(), "groups"),
      where("memberUids", "array-contains", userDoc.uid),
    );
    return onSnapshot(q, (s) => {
      setMyGroup(s.empty ? null : (s.docs[0].data() as GroupDoc));
    });
  }, [userDoc]);

  // หากลุ่มทั้งหมดในชั้นปี (เรียงตามลำดับเวร)
  useEffect(() => {
    if (!userDoc?.year) return;
    const q = query(
      collection(db(), "groups"),
      where("year", "==", userDoc.year),
    );
    return onSnapshot(q, (s) =>
      setAllGroups(
        s.docs
          .map((d) => d.data() as GroupDoc)
          .sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)),
      ),
    );
  }, [userDoc]);

  // หากลุ่มปัจจุบัน = กลุ่มแรกที่ยังไม่เช็ค
  const currentGroup = allGroups.find((g) => !g.checkStatus);
  const currentIndex = currentGroup ? allGroups.indexOf(currentGroup) : -1;
  const nextGroup = currentIndex >= 0 ? allGroups[currentIndex + 1] : null;

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-3 text-xl font-bold">เวรของฉัน</h1>

      {!myGroup ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">คุณยังไม่ได้อยู่ในกลุ่มจราจร</div>
            <div className="text-xs text-muted-foreground">
              ให้ครูเพิ่มคุณเข้ากลุ่มก่อน
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* กลุ่มของฉัน */}
          <Card className="mb-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                กลุ่มของคุณ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-bold">กลุ่ม {myGroup.number}</div>
              <div className="text-sm text-muted-foreground">
                {myGroup.members.length} คน
              </div>
              {myGroup.note && (
                <p className="text-xs text-muted-foreground">{myGroup.note}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {myGroup.members.map((m) => (
                  <span
                    key={m.uid}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      m.uid === userDoc?.uid
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {m.nickname || m.fullName}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* เวรวันนี้ */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">เวรวันนี้</CardTitle>
            </CardHeader>
            <CardContent>
              {!currentGroup ? (
                <p className="text-sm text-muted-foreground">
                  ทุกกลุ่มทำเวรครบแล้ว (รอครูรีเซ็ต)
                </p>
              ) : (
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">
                    {currentGroup.number}
                    {nextGroup && (
                      <>
                        {" → "}
                        <span className="text-muted-foreground">{nextGroup.number}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    กลุ่ม {currentGroup.number} เวรปัจจุบัน
                    {nextGroup && `, กลุ่ม ${nextGroup.number} เวรต่อไป`}
                  </p>
                  {myGroup.number === currentGroup.number && (
                    <div className="mt-3 rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary">
                      วันนี้กลุ่มของคุณเวร!
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <StudentBottomNav />
    </main>
  );
}

export default function Page() {
  return (
    <RequireRole allow={["student"]}>
      <ShiftsInner />
    </RequireRole>
  );
}
