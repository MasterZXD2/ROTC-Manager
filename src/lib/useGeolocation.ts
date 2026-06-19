"use client";

import { useEffect, useRef, useState } from "react";

export type GpsErrorKind =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported";

export interface GpsState {
  loading: boolean;
  position: { lat: number; lng: number } | null;
  accuracy: number | null;
  error: { kind: GpsErrorKind; message: string } | null;
  lastUpdate: number | null;
}

const ERROR_MAP: Record<number, { kind: GpsErrorKind; message: string }> = {
  1: {
    kind: "permission_denied",
    message: "ไม่ได้อนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์",
  },
  2: {
    kind: "position_unavailable",
    message: "หาตำแหน่งไม่ได้ — เปิด GPS แล้วออกมากลางแจ้ง",
  },
  3: {
    kind: "timeout",
    message: "หาตำแหน่งช้าเกินไป — ลองใหม่อีกครั้ง",
  },
};

/**
 * watchPosition wrapper — update ตำแหน่งต่อเนื่อง
 * ใช้แสดง "ห่างกี่เมตร" แบบ real-time ไม่ต้องรอตอนกดปุ่ม
 */
export function useGeolocation(enabled: boolean = true): GpsState {
  const [state, setState] = useState<GpsState>({
    loading: enabled,
    position: null,
    accuracy: null,
    error: null,
    lastUpdate: null,
  });
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        loading: false,
        position: null,
        accuracy: null,
        lastUpdate: null,
        error: { kind: "unsupported", message: "อุปกรณ์ไม่รองรับ GPS" },
      });
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          loading: false,
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          lastUpdate: Date.now(),
          error: null,
        });
      },
      (err) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: ERROR_MAP[err.code] ?? {
            kind: "position_unavailable",
            message: err.message || "ไม่สามารถระบุตำแหน่งได้",
          },
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => {
      if (watchId.current !== null)
        navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled]);

  return state;
}
