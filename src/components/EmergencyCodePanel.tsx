"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requestEmergencyCode } from "@/lib/actions";
import type { UserDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmergencyCodePanel({ userDoc }: { userDoc: UserDoc }) {
  const isTopAdmin = userDoc.role === "top_admin";
  const canCreate = isTopAdmin || userDoc.role === "admin_teacher" || userDoc.role === "admin";
  const [year, setYear] = useState(
    userDoc.year >= 1 && userDoc.year <= 5 ? userDoc.year : 1,
  );
  const [code, setCode] = useState<{ value: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canCreate) return null;

  const createCode = async () => {
    setBusy(true);
    try {
      const result = await requestEmergencyCode({
        callerUid: userDoc.uid,
        year: isTopAdmin ? year : undefined,
      });
      setCode({ value: result.code, expiresAt: result.expiresAt });
      toast.success("สร้างรหัสฉุกเฉินแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างรหัสไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-700">
          <KeyRound className="h-4 w-4" />
          รหัสฉุกเฉินสำหรับเช็คอินจราจร
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isTopAdmin && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">ชั้นปี</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-10 w-full rounded-lg border bg-background px-3"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>ปี {value}</option>
              ))}
            </select>
          </label>
        )}

        {code ? (
          <div className="space-y-2">
            <div className="text-center text-3xl font-bold tracking-widest text-amber-700">
              {code.value}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              ใช้ได้ถึง {new Date(code.expiresAt).toLocaleTimeString("th-TH", {
                timeZone: "Asia/Bangkok",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
            <Button variant="outline" className="w-full" onClick={createCode} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              สร้างรหัสใหม่
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={createCode} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 h-4 w-4" />
            )}
            สร้างรหัสฉุกเฉิน 6 หลัก
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
