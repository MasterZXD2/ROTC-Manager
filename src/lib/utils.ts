import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ระยะทาง Haversine เป็นเมตร — ใช้ทั้ง client (preview) และ server (validate) */
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

/** "HH:MM" -> นาทีตั้งแต่เที่ยงคืน (Asia/Bangkok) */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** เวลาปัจจุบัน (นาทีตั้งแต่เที่ยงคืน) ใน timezone Asia/Bangkok */
export function nowMinutesBangkok(d: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = fmt.format(d).split(":").map(Number);
  return h * 60 + m;
}

/** YYYY-MM-DD ใน Asia/Bangkok — ใช้เป็น docId daily counter */
export function todayKeyBangkok(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/** ลิงก์ดูตำแหน่งบนเว็บเรา (ไม่ออก Google Maps) */
export function googleMapsLink(lat: number, lng: number): string {
  return `/map?lat=${lat}&lng=${lng}`;
}
