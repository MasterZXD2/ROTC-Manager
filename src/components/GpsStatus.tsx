"use client";

import { CheckCircle2, AlertTriangle, Loader2, Navigation } from "lucide-react";
import type { GpsState } from "@/lib/useGeolocation";
import { cn } from "@/lib/utils";

interface Props {
  gps: GpsState;
  withinTime: boolean;
  withinRadius: boolean;
  distance: number | null;
  radius: number;
  maxAccuracy: number;
  dailyDone: boolean;
  nextSlot?: { start: string; end: string } | null;
}

export function GpsStatus({
  gps, withinTime, withinRadius, distance, radius, maxAccuracy, dailyDone, nextSlot,
}: Props) {
  let kind: "ok" | "wait" | "warn" | "error" = "ok";
  let title = "พร้อมเช็คอิน";
  let detail = "";

  if (gps.error) {
    kind = "error";
    title = "ใช้ตำแหน่งไม่ได้";
    detail = gps.error.message;
  } else if (gps.loading || !gps.position) {
    kind = "wait";
    title = "กำลังหาตำแหน่ง...";
    detail = "เปิด GPS และอนุญาตเบราว์เซอร์ใช้ตำแหน่ง";
  } else if (gps.accuracy !== null && gps.accuracy > maxAccuracy) {
    kind = "warn";
    title = "สัญญาณ GPS อ่อน";
    detail = `±${Math.round(gps.accuracy)} ม. · ออกไปกลางแจ้ง`;
  } else if (!withinTime) {
    kind = "warn";
    title = "อยู่นอกช่วงเวลา";
    detail = nextSlot ? `รอบถัดไป ${nextSlot.start} - ${nextSlot.end}` : "ไม่มีรอบเช็คอินวันนี้";
  } else if (!withinRadius) {
    kind = "warn";
    title = "อยู่นอกพื้นที่";
    detail = distance !== null ? `ห่าง ${Math.round(distance)} ม. (อนุญาต ${radius} ม.)` : "เดินเข้ามาใกล้จุดเช็คอิน";
  } else if (dailyDone) {
    kind = "warn";
    title = "หน้าที่จราจรเสร็จสิ้น";
    detail = "วันนี้เช็คครบ 2 รอบแล้ว";
  } else {
    detail = `±${Math.round(gps.accuracy ?? 0)} ม. · ห่าง ${Math.round(distance ?? 0)} ม.`;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        kind === "ok" && "border-green-200 bg-green-50",
        kind === "wait" && "border-blue-200 bg-blue-50",
        kind === "warn" && "border-amber-200 bg-amber-50",
        kind === "error" && "border-red-200 bg-red-50",
      )}
    >
      <div className="shrink-0">
        {kind === "ok" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
        {kind === "wait" && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
        {kind === "warn" && <AlertTriangle className="h-5 w-5 text-amber-600" />}
        {kind === "error" && <Navigation className="h-5 w-5 text-red-600" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
