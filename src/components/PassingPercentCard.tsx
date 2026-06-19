"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save } from "lucide-react";
import { setYearPassingPercent } from "@/lib/actions";
import { DEFAULT_PASSING_PERCENT } from "@/lib/types";
import { toast } from "sonner";

export function PassingPercentCard({ callerUid, year }: { callerUid: string; year: number }) {
  const [pct, setPct] = useState<number>(DEFAULT_PASSING_PERCENT);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setLoaded(false);
    (async () => {
      const snap = await getDoc(doc(db(), "yearConfigs", `year${year}`));
      if (snap.exists()) {
        const d = snap.data();
        if (typeof d.passingPercent === "number") setPct(d.passingPercent);
        else setPct(DEFAULT_PASSING_PERCENT);
      } else {
        setPct(DEFAULT_PASSING_PERCENT);
      }
      setLoaded(true);
    })();
  }, [year]);

  const save = async () => {
    setBusy(true);
    try {
      await setYearPassingPercent(callerUid, year, pct);
      setSavedAt(Date.now());
      toast.success(`บันทึกเกณฑ์ผ่าน ${pct}% (ปี ${year})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-3 border-purple-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-purple-700">เกณฑ์ผ่านการประเมิน · ปี {year}</CardTitle>
        <p className="text-xs text-muted-foreground">
          นักเรียนต้องทำงานครบ ≥ % ที่กำหนดถึงจะ "ผ่าน"
        </p>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-24"
            />
            <span className="text-sm">%</span>
            <Button size="sm" onClick={save} disabled={busy}>
              <Save className="mr-1 h-4 w-4" />บันทึก
            </Button>
            {savedAt && <span className="text-xs text-green-700">บันทึกแล้ว</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
