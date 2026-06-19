import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  db,
  REGION,
  distanceMeters,
  hhmmToMinutes,
  nowMinutesBangkok,
  todayKeyBangkok,
  googleMapsLink,
  genCode,
  FV,
  DAILY_CHECKIN_CAP,
} from "./shared";

type GlobalConfig = {
  timeSlots: Array<{ id: string; start: string; end: string; label?: string }>;
  locations: Array<{ id: string; name: string; lat: number; lng: number }>;
  allowedRadiusMeters: number;
  maxAccuracyMeters: number;
  historyRetentionDays: number;
};

async function loadConfig(): Promise<GlobalConfig> {
  const snap = await db.doc("config/global").get();
  if (!snap.exists)
    throw new HttpsError("failed-precondition", "ยังไม่ได้ตั้งค่าระบบ");
  return snap.data() as GlobalConfig;
}

function findActiveSlot(slots: GlobalConfig["timeSlots"]): typeof slots[number] | null {
  const now = nowMinutesBangkok();
  return (
    slots.find((s) => {
      const a = hhmmToMinutes(s.start);
      const b = hhmmToMinutes(s.end);
      return now >= a && now <= b;
    }) ?? null
  );
}

function findNearestLocation(
  locs: GlobalConfig["locations"],
  user: { lat: number; lng: number },
) {
  let best: { loc: typeof locs[number]; dist: number } | null = null;
  for (const l of locs) {
    const d = distanceMeters(user, { lat: l.lat, lng: l.lng });
    if (!best || d < best.dist) best = { loc: l, dist: d };
  }
  return best;
}

async function loadProfile(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw new HttpsError("not-found", "ไม่พบโปรไฟล์");
  return snap.data() as {
    uid: string;
    fullName: string;
    nickname: string;
    classroom: string;
    studentId: string;
    year: number;
    role: string;
    email: string;
  };
}

function assertProfileComplete(p: { fullName: string; classroom: string; studentId: string; year: number }) {
  if (!p.fullName || !p.classroom || !p.studentId || !p.year) {
    throw new HttpsError("failed-precondition", "กรุณากรอกข้อมูลโปรไฟล์ให้ครบ");
  }
}

async function dailyCount(uid: string, dayKey: string): Promise<number> {
  const snap = await db
    .doc(`users/${uid}/dailyCheckins/${dayKey}`)
    .get();
  return (snap.data()?.count as number) ?? 0;
}

async function recordCheckin(opts: {
  uid: string;
  profile: Awaited<ReturnType<typeof loadProfile>>;
  position: { lat: number; lng: number };
  accuracy: number;
  distance: number;
  slotId: string;
  locationId: string;
  method: "gps" | "emergency_code";
}) {
  const { uid, profile, position, accuracy, distance, slotId, locationId, method } = opts;
  const now = Date.now();
  const dayKey = todayKeyBangkok(new Date(now));
  const checkinRef = db.collection("checkins").doc();
  const counterRef = db.doc(`users/${uid}/dailyCheckins/${dayKey}`);

  await db.runTransaction(async (tx) => {
    const counter = await tx.get(counterRef);
    const used = (counter.data()?.count as number) ?? 0;
    if (used >= DAILY_CHECKIN_CAP) {
      throw new HttpsError("resource-exhausted", "วันนี้คุณทำหน้าที่จราจรเสร็จสิ้นแล้ว");
    }
    const phase = used === 0 ? "in" : "out";
    tx.set(checkinRef, {
      id: checkinRef.id,
      userId: uid,
      fullName: profile.fullName,
      nickname: profile.nickname,
      classroom: profile.classroom,
      year: profile.year,
      studentId: profile.studentId,
      timestamp: now,
      location: position,
      accuracy,
      distanceMeters: Math.round(distance),
      mapLink: googleMapsLink(position.lat, position.lng),
      slotId,
      locationId,
      method,
      phase,
    });
    tx.set(
      counterRef,
      { count: used + 1, updatedAt: now },
      { merge: true },
    );
  });

  return { id: checkinRef.id };
}

/* ---------------- submitCheckin (GPS) ---------------- */

export const submitCheckin = onCall(
  { region: REGION, cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "ต้องเข้าสู่ระบบ");
    const uid = req.auth.uid;

    const { lat, lng, accuracy } = req.data as {
      lat: number; lng: number; accuracy: number;
    };
    if (typeof lat !== "number" || typeof lng !== "number" || typeof accuracy !== "number")
      throw new HttpsError("invalid-argument", "ตำแหน่งไม่ถูกต้อง");

    const [profile, cfg] = await Promise.all([loadProfile(uid), loadConfig()]);
    assertProfileComplete(profile);

    if (accuracy > cfg.maxAccuracyMeters)
      throw new HttpsError("failed-precondition",
        `สัญญาณ GPS อ่อนเกินไป (±${Math.round(accuracy)}ม.) ออกไปกลางแจ้ง`);

    const slot = findActiveSlot(cfg.timeSlots);
    if (!slot) throw new HttpsError("failed-precondition", "ไม่ได้อยู่ในช่วงเวลาที่กำหนด");

    if (cfg.locations.length === 0)
      throw new HttpsError("failed-precondition", "ยังไม่ได้กำหนดจุดเช็คอิน");

    const nearest = findNearestLocation(cfg.locations, { lat, lng });
    if (!nearest || nearest.dist > cfg.allowedRadiusMeters)
      throw new HttpsError("failed-precondition",
        `อยู่นอกพื้นที่ (ห่าง ${Math.round(nearest?.dist ?? 0)}ม.)`);

    const dayKey = todayKeyBangkok();
    const used = await dailyCount(uid, dayKey);
    if (used >= DAILY_CHECKIN_CAP)
      throw new HttpsError("resource-exhausted", "วันนี้คุณทำหน้าที่จราจรเสร็จสิ้นแล้ว");

    return await recordCheckin({
      uid, profile,
      position: { lat, lng },
      accuracy,
      distance: nearest.dist,
      slotId: slot.id,
      locationId: nearest.loc.id,
      method: "gps",
    });
  },
);

/* ---------------- emergency code ---------------- */

export const requestEmergencyCode = onCall(
  { region: REGION, cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "ต้องเข้าสู่ระบบ");
    const caller = await loadProfile(req.auth.uid);
    if (caller.role !== "admin" && caller.role !== "top_admin")
      throw new HttpsError("permission-denied", "เฉพาะแอดมินเท่านั้น");

    const { year, classroom } = (req.data ?? {}) as { year?: number; classroom?: string };
    const targetYear = caller.role === "admin" ? caller.year : (year ?? caller.year);

    const code = genCode();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    await db.collection("emergencyCodes").doc(code).set({
      code,
      createdBy: caller.uid,
      createdByName: caller.fullName || caller.email,
      year: targetYear,
      classroom: classroom ?? null,
      expiresAt,
      used: false,
      createdAt: FV.serverTimestamp(),
    });

    return { code, expiresAt };
  },
);

export const submitCheckinWithCode = onCall(
  { region: REGION, cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "ต้องเข้าสู่ระบบ");
    const uid = req.auth.uid;
    const { code, lat, lng, accuracy } = req.data as {
      code: string; lat?: number; lng?: number; accuracy?: number;
    };
    if (!code || !/^\d{6}$/.test(code))
      throw new HttpsError("invalid-argument", "รหัสไม่ถูกต้อง");

    const [profile, cfg] = await Promise.all([loadProfile(uid), loadConfig()]);
    assertProfileComplete(profile);

    const slot = findActiveSlot(cfg.timeSlots);
    if (!slot) throw new HttpsError("failed-precondition", "ไม่ได้อยู่ในช่วงเวลาที่กำหนด");

    const codeRef = db.collection("emergencyCodes").doc(code);
    const fallbackLat = typeof lat === "number" ? lat : 0;
    const fallbackLng = typeof lng === "number" ? lng : 0;
    const fallbackAcc = typeof accuracy === "number" ? accuracy : 9999;

    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(codeRef);
      if (!snap.exists) throw new HttpsError("not-found", "รหัสไม่ถูกต้อง");
      const c = snap.data()!;
      if (c.used) throw new HttpsError("failed-precondition", "รหัสถูกใช้ไปแล้ว");
      if (Date.now() > c.expiresAt) throw new HttpsError("deadline-exceeded", "รหัสหมดอายุ");
      if (c.year !== profile.year)
        throw new HttpsError("permission-denied", "รหัสนี้ไม่ใช่ของชั้นปีคุณ");
      if (c.classroom && c.classroom !== profile.classroom)
        throw new HttpsError("permission-denied", "รหัสนี้ไม่ใช่ของห้องคุณ");
      tx.update(codeRef, { used: true, usedBy: uid, usedAt: Date.now() });
      return c;
    });

    return await recordCheckin({
      uid, profile,
      position: { lat: fallbackLat, lng: fallbackLng },
      accuracy: fallbackAcc,
      distance: -1,
      slotId: slot.id,
      locationId: claim.classroom ?? "emergency",
      method: "emergency_code",
    });
  },
);
