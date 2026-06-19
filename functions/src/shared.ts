import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const FV = FieldValue;

export const REGION = "asia-southeast1";
export const BOOTSTRAP_TOP_ADMIN_EMAIL = "goten8615xd@gmail.com";

export const DEFAULT_CONFIG = {
  timeSlots: [] as Array<{ id: string; start: string; end: string; label?: string }>,
  locations: [] as Array<{ id: string; name: string; lat: number; lng: number }>,
  allowedRadiusMeters: 30,
  maxAccuracyMeters: 50,
  historyRetentionDays: 90,
};

/** สูงสุด 2 รอบ/วัน: เช็คอิน (เริ่ม) + เช็คเอาท์ (จบ) */
export const DAILY_CHECKIN_CAP = 2;

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function nowMinutesBangkok(d: Date = new Date()): number {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = f.format(d).split(":").map(Number);
  return h * 60 + m;
}

export function todayKeyBangkok(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function genCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
