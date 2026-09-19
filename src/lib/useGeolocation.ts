"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  refresh: () => void;
}

type GpsSnapshot = Omit<GpsState, "refresh">;

const ERROR_MAP: Record<number, { kind: GpsErrorKind; message: string }> = {
  1: {
    kind: "permission_denied",
    message: "ไม่ได้อนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์ (Safari ต้องใช้ HTTPS)",
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
  const [state, setState] = useState<GpsSnapshot>({
    loading: enabled,
    position: null,
    accuracy: null,
    error: null,
    lastUpdate: null,
  });
  const watchId = useRef<number | null>(null);

  const applyPosition = useCallback((pos: GeolocationPosition) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) return;

    setState({
      loading: false,
      position: { lat, lng },
      accuracy,
      lastUpdate: Date.now(),
      error: null,
    });
  }, []);

  const applyError = useCallback((err: GeolocationPositionError) => {
    setState((s) => ({
      ...s,
      loading: false,
      error: ERROR_MAP[err.code] ?? {
        kind: "position_unavailable",
        message: err.message || "ไม่สามารถระบุตำแหน่งได้",
      },
    }));
  }, []);

  const refresh = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(applyPosition, applyError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000,
    });
  }, [applyError, applyPosition]);

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

    // ตรวจสอบ HTTPS (Safari บังคับ)
    if (typeof window !== "undefined" && window.location.protocol === "http:" && window.location.hostname !== "localhost") {
      setState({
        loading: false,
        position: null,
        accuracy: null,
        lastUpdate: null,
        error: {
          kind: "permission_denied",
          message: "Safari ต้องใช้ HTTPS เท่านั้น — ใช้ Chrome หรือ Firefox แทน หรือเปิดผ่าน HTTPS"
        },
      });
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(applyPosition, applyError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000,
    });

    return () => {
      if (watchId.current !== null)
        navigator.geolocation.clearWatch(watchId.current);
    };
  }, [applyError, applyPosition, enabled]);

  return { ...state, refresh };
}
