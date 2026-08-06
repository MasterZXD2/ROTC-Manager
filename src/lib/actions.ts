"use client";

import {
  collection, doc, getDoc, runTransaction, setDoc, deleteDoc, getDocs, query, where, limit, writeBatch, updateDoc, deleteField,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  distanceMeters, hhmmToMinutes, nowMinutesBangkok, todayKeyBangkok, googleMapsLink,
} from "./utils";
import type { GlobalConfig, GroupDoc, DutyLogDoc, Role, UserDoc } from "./types";

/* ---------- helpers ---------- */

async function loadConfig(): Promise<GlobalConfig> {
  const snap = await getDoc(doc(db(), "config/global"));
  if (!snap.exists()) throw new Error("ยังไม่ได้ตั้งค่าระบบ");
  return snap.data() as GlobalConfig;
}

async function loadProfile(uid: string): Promise<UserDoc> {
  const snap = await getDoc(doc(db(), "users", uid));
  if (!snap.exists()) throw new Error("ไม่พบโปรไฟล์");
  return snap.data() as UserDoc;
}

function findActiveSlot(slots: GlobalConfig["timeSlots"]) {
  const now = nowMinutesBangkok();
  return slots.find((s) => now >= hhmmToMinutes(s.start) && now <= hhmmToMinutes(s.end)) ?? null;
}

function findNearest(locs: GlobalConfig["locations"], pos: { lat: number; lng: number }) {
  let best: { loc: GlobalConfig["locations"][number]; dist: number } | null = null;
  for (const l of locs) {
    const d = distanceMeters(pos, l);
    if (!best || d < best.dist) best = { loc: l, dist: d };
  }
  return best;
}

function genCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 900000 + 100000);
}

async function logActivity(
  userId: string,
  userName: string,
  type: string,
  details: Record<string, any>,
  year?: number,
) {
  const logRef = doc(collection(db(), "activityLogs"));
  const now = Date.now();

  // Firestore ไม่รับค่า undefined — กรองออกจาก details
  const cleanDetails: Record<string, any> = {};
  for (const [k, v] of Object.entries(details)) {
    if (v !== undefined) cleanDetails[k] = v;
  }

  const payload: Record<string, any> = {
    id: logRef.id,
    userId,
    userName,
    type,
    timestamp: now,
    details: cleanDetails,
  };
  if (year !== undefined) payload.year = year;

  await setDoc(logRef, payload);
}

/* ---------- submit check-in (GPS) ---------- */

/** หากลุ่มที่ user สังกัด + กลุ่มที่เป็น "เวรปัจจุบัน" ของชั้นปีนั้น
 *  เวรปัจจุบัน = กลุ่มแรกที่ยังไม่เช็ค (checkStatus=null) เรียงตามเลขกลุ่ม */
async function findDutyForUser(uid: string, year: number) {
  // 1. หากลุ่มของ user (ในชั้นปีตัวเอง)
  const myGroupQ = query(
    collection(db(), "groups"),
    where("memberUids", "array-contains", uid),
  );
  const myGroupSnap = await getDocs(myGroupQ);
  const myGroup = myGroupSnap.empty
    ? null
    : (myGroupSnap.docs[0].data() as GroupDoc);

  // 2. หากลุ่มทั้งหมดของชั้นปี เพื่อหาเวรปัจจุบัน (กลุ่มแรกที่ยังไม่เช็ค)
  const yearGroupsQ = query(
    collection(db(), "groups"),
    where("year", "==", year),
  );
  const yearGroupsSnap = await getDocs(yearGroupsQ);
  const groups = yearGroupsSnap.docs
    .map((d) => d.data() as GroupDoc)
    .sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number));
  const currentDuty = groups.find((g) => !g.checkStatus) ?? null;

  return { myGroup, currentDuty };
}

export async function submitCheckin(
  uid: string,
  pos: { lat: number; lng: number },
  accuracy: number,
): Promise<void> {
  const [profile, cfg] = await Promise.all([loadProfile(uid), loadConfig()]);
  if (!profile.fullName || !profile.studentId || !profile.year)
    throw new Error("กรุณากรอกข้อมูลโปรไฟล์ให้ครบ");

  const isTester = !!profile.isTester;
  const isTrafficRepair = !!profile.isTrafficRepair;

  if (!isTester && accuracy > cfg.maxAccuracyMeters)
    throw new Error(`สัญญาณ GPS อ่อนเกินไป (±${Math.round(accuracy)}ม.)`);

  // หากลุ่มของ user + เวรปัจจุบันของชั้นปี
  const now = Date.now();
  const duty = await findDutyForUser(uid, profile.year);

  // ถ้าไม่ใช่ tester:
  // - ไม่อยู่กลุ่มจราจร → ไม่ให้เช็คอิน
  // - ชั้นปียังไม่มีกลุ่มที่เป็นเวร (ทุกกลุ่มติ๊กหมดแล้ว) → ไม่ให้เช็คอิน
  // - กลุ่มของ user ไม่ใช่เวรปัจจุบัน → ไม่ให้เช็คอิน
  // - อยู่นอกช่วงเวลาเช็คอิน → ไม่ให้เช็คอิน
  if (!isTester && !isTrafficRepair) {
    if (!duty.myGroup) throw new Error("คุณยังไม่ได้อยู่ในกลุ่มจราจร");
    if (!duty.currentDuty) throw new Error("วันนี้ไม่มีกลุ่มที่เป็นเวร");
    if (duty.currentDuty.id !== duty.myGroup.id)
      throw new Error(`ยังไม่ถึงเวรของกลุ่มคุณ (ตอนนี้เวรกลุ่ม ${duty.currentDuty.number})`);
  }

  if (!isTester && !findActiveSlot(cfg.timeSlots))
    throw new Error("อยู่นอกช่วงเวลาเช็คอิน");

  if (!isTester && cfg.locations.length === 0)
    throw new Error("ยังไม่ได้กำหนดจุดเช็คอิน");

  const nearest = cfg.locations.length > 0 ? findNearest(cfg.locations, pos) : null;
  if (!isTester && (!nearest || nearest.dist > cfg.allowedRadiusMeters))
    throw new Error(`อยู่นอกพื้นที่ (ห่าง ${Math.round(nearest?.dist ?? 0)}ม.)`);

  const activeSlot = findActiveSlot(cfg.timeSlots);
  const dayKey = todayKeyBangkok();
  const counterRef = doc(db(), `users/${uid}/dailyCheckins/${dayKey}`);
  const checkinRef = doc(collection(db(), "checkins"));

  // รอบเช็คอิน: 0 = เช็คอิน (เริ่ม), 1 = เช็คเอาท์ (จบ) — สูงสุด 2 ครั้ง/วัน
  let phase: "in" | "out" = "in";

  await runTransaction(db(), async (tx) => {
    const counter = await tx.get(counterRef);
    const used = (counter.data()?.count as number | undefined) ?? 0;
    if (!isTester && used >= 2)
      throw new Error("วันนี้คุณทำหน้าที่จราจรเสร็จสิ้นแล้ว");
    phase = used === 0 ? "in" : "out";

    tx.set(checkinRef, {
      id: checkinRef.id,
      userId: uid,
      fullName: profile.fullName,
      nickname: profile.nickname,
      classroom: profile.classroom,
      year: profile.year,
      studentId: profile.studentId,
      timestamp: now,
      location: pos,
      accuracy,
      distanceMeters: nearest ? Math.round(nearest.dist) : -1,
      mapLink: googleMapsLink(pos.lat, pos.lng),
      slotId: activeSlot?.id ?? "manual",
      locationId: nearest?.loc.id ?? "tester",
      method: isTester ? "tester" : "gps",
      phase,
      groupId: duty.myGroup?.id ?? null,
      groupName: duty.myGroup ? `กลุ่ม ${duty.myGroup.number}` : (isTrafficRepair ? "กำลังซ่อม" : null),
      sessionId: null,
      trafficRepair: isTrafficRepair,
    });
    if (counter.exists()) {
      tx.update(counterRef, { count: used + 1, updatedAt: now });
    } else {
      tx.set(counterRef, { count: 1, updatedAt: now });
    }
  });

  // log activity — ไม่ให้ log fail มาทำ checkin ที่สำเร็จแล้วพัง
  try {
    await logActivity(
      uid,
      profile.fullName || profile.email,
      "checkin",
      {
        fullName: profile.fullName,
        classroom: profile.classroom,
        method: isTester ? "tester" : "gps",
        phase,
        groupName: duty.myGroup ? `กลุ่ม ${duty.myGroup.number}` : (isTrafficRepair ? "กำลังซ่อม" : undefined),
        trafficRepair: isTrafficRepair,
      },
      profile.year,
    );
  } catch (e) {
    console.error("logActivity (checkin) failed:", e);
  }
}

/* ---------- emergency code ---------- */

export async function requestEmergencyCode(args: {
  callerUid: string;
}): Promise<{ code: string; expiresAt: number }> {
  const caller = await loadProfile(args.callerUid);
  const allowed =
    caller.role === "admin_teacher" ||
    caller.role === "top_admin" ||
    caller.role === "admin"; // legacy
  if (!allowed) throw new Error("เฉพาะครูและ Top Admin เท่านั้น");

  const code = genCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  await setDoc(doc(db(), "emergencyCodes", code), {
    code,
    createdBy: caller.uid,
    createdByName: caller.fullName || caller.email,
    year: caller.year,
    classroom: null,
    expiresAt,
    used: false,
    createdAt: Date.now(),
  });

  return { code, expiresAt };
}

export async function submitCheckinWithCode(
  uid: string,
  code: string,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("รหัสไม่ถูกต้อง");

  const [profile, cfg] = await Promise.all([loadProfile(uid), loadConfig()]);
  if (!profile.fullName) throw new Error("กรุณากรอกข้อมูลโปรไฟล์ให้ครบ");

  const slot = findActiveSlot(cfg.timeSlots);
  if (!slot) throw new Error("ไม่ได้อยู่ในช่วงเวลาที่กำหนด");

  const codeRef = doc(db(), "emergencyCodes", code);
  const dayKey = todayKeyBangkok();
  const counterRef = doc(db(), `users/${uid}/dailyCheckins/${dayKey}`);
  const checkinRef = doc(collection(db(), "checkins"));
  const now = Date.now();
  let phase: "in" | "out" = "in";

  await runTransaction(db(), async (tx) => {
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists()) throw new Error("รหัสไม่ถูกต้อง");
    const c = codeSnap.data();
    if (c.used) throw new Error("รหัสถูกใช้ไปแล้ว");
    if (Date.now() > c.expiresAt) throw new Error("รหัสหมดอายุ");
    if (c.year !== null && c.year !== profile.year)
      throw new Error("รหัสนี้ไม่ใช่ของชั้นปีคุณ");

    const counter = await tx.get(counterRef);
    const used = (counter.data()?.count as number | undefined) ?? 0;
    if (used >= 2)
      throw new Error("วันนี้คุณทำหน้าที่จราจรเสร็จสิ้นแล้ว");
    phase = used === 0 ? "in" : "out";

    tx.update(codeRef, { used: true, usedBy: uid, usedAt: now });
    tx.set(checkinRef, {
      id: checkinRef.id,
      userId: uid,
      fullName: profile.fullName,
      nickname: profile.nickname,
      classroom: profile.classroom,
      year: profile.year,
      studentId: profile.studentId,
      timestamp: now,
      location: { lat: 0, lng: 0 },
      accuracy: 9999,
      distanceMeters: -1,
      mapLink: "",
      slotId: slot.id,
      locationId: "emergency",
      method: "emergency_code",
      phase,
    });
    if (counter.exists()) {
      tx.update(counterRef, { count: used + 1, updatedAt: now });
    } else {
      tx.set(counterRef, { count: 1, updatedAt: now });
    }
  });

  // log activity — เช็คอินด้วยรหัสฉุกเฉินก็ต้องขึ้นใน Activity Log
  try {
    await logActivity(
      uid,
      profile.fullName || profile.email,
      "checkin",
      {
        fullName: profile.fullName,
        classroom: profile.classroom,
        method: "emergency_code",
        phase,
      },
      profile.year,
    );
  } catch (e) {
    console.error("logActivity (checkin code) failed:", e);
  }
}

/* ---------- role management ---------- */

export async function setUserRole(
  callerUid: string,
  targetUid: string,
  role: Role,
): Promise<void> {
  if (callerUid === targetUid) throw new Error("ห้ามเปลี่ยนสิทธิ์ของตัวเอง");
  const caller = await loadProfile(callerUid);
  if (caller.role !== "top_admin") throw new Error("เฉพาะ Top Admin เท่านั้น");

  const target = await loadProfile(targetUid);
  if (target.email.toLowerCase() === "goten8615xd@gmail.com" && role !== "top_admin")
    throw new Error("ห้ามลดสิทธิ์ Top Admin หลัก");

  await setDoc(
    doc(db(), "users", targetUid),
    { ...target, role, updatedAt: Date.now() },
    { merge: true },
  );

  // log activity
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "role_change",
    { targetName: target.fullName || target.email, newRole: role },
    target.year,
  );
}

/* ---------- invite codes (รหัส login ตอน register) ---------- */

export async function createInviteCode(args: {
  callerUid: string;
}): Promise<{ code: string; expiresAt: number; year: number | null }> {
  const caller = await loadProfile(args.callerUid);
  const isTeacher = caller.role === "admin_teacher" || caller.role === "admin";
  const isTop = caller.role === "top_admin";
  if (!isTeacher && !isTop) throw new Error("เฉพาะครูและ Top Admin เท่านั้น");

  const year = isTop ? null : caller.year;
  const code = genCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  await setDoc(doc(db(), "inviteCodes", code), {
    code,
    createdBy: caller.uid,
    createdByName: caller.fullName || caller.email,
    year,
    expiresAt,
    createdAt: Date.now(),
  });
  return { code, expiresAt, year };
}

export async function redeemInviteCode(
  uid: string,
  code: string,
): Promise<{ year: number | null }> {
  if (!/^\d{6}$/.test(code)) throw new Error("รหัสต้องเป็นตัวเลข 6 หลัก");
  const codeRef = doc(db(), "inviteCodes", code);
  const snap = await getDoc(codeRef);
  if (!snap.exists()) throw new Error("รหัสไม่ถูกต้อง");
  const c = snap.data();
  if (Date.now() > c.expiresAt) throw new Error("รหัสหมดอายุ");
  return { year: (c.year as number | null) ?? null };
}

export async function setUserYear(
  callerUid: string,
  targetUid: string,
  year: number,
): Promise<void> {
  if (![1, 2, 3, 4, 5].includes(year)) throw new Error("ชั้นปีไม่ถูกต้อง");
  const caller = await loadProfile(callerUid);
  if (caller.role !== "top_admin") throw new Error("เฉพาะ Top Admin เท่านั้น");

  const target = await loadProfile(targetUid);
  await setDoc(
    doc(db(), "users", targetUid),
    { ...target, year, updatedAt: Date.now() },
    { merge: true },
  );
}

export async function setUserTester(
  callerUid: string,
  targetUid: string,
  isTester: boolean,
): Promise<void> {
  const caller = await loadProfile(callerUid);
  if (caller.role !== "top_admin") throw new Error("เฉพาะ Top Admin เท่านั้น");

  const target = await loadProfile(targetUid);
  await setDoc(
    doc(db(), "users", targetUid),
    { ...target, isTester, updatedAt: Date.now() },
    { merge: true },
  );
}

export async function setUserTrafficRepair(
  callerUid: string,
  targetUid: string,
  isTrafficRepair: boolean,
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const target = await loadProfile(targetUid);
  const isTeacher = caller.role === "admin_teacher" || caller.role === "admin";
  const isTop = caller.role === "top_admin";
  if (!isTeacher && !isTop) throw new Error("ไม่มีสิทธิ์");
  if (isTeacher && (target.role !== "student" || target.year !== caller.year)) {
    throw new Error("ครูตั้งค่าได้เฉพาะนักเรียนในชั้นปีตัวเอง");
  }

  await setDoc(
    doc(db(), "users", targetUid),
    { ...target, isTrafficRepair, updatedAt: Date.now() },
    { merge: true },
  );
}

/* ---------- profile edit (admin_teacher / top_admin) ---------- */

export interface ProfilePatch {
  fullName?: string;
  nickname?: string;
  classroom?: string;
  studentId?: string;
  year?: number;
}

export async function updateStudentProfile(
  callerUid: string,
  targetUid: string,
  patch: ProfilePatch,
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const target = await loadProfile(targetUid);
  const isTeacher = caller.role === "admin_teacher" || caller.role === "admin";
  const isTop = caller.role === "top_admin";
  if (!isTeacher && !isTop) throw new Error("ไม่มีสิทธิ์");

  if (isTeacher && !isTop) {
    if (target.role !== "student") throw new Error("ครูแก้ได้เฉพาะนักเรียน");
    if (target.year !== caller.year)
      throw new Error("แก้ได้เฉพาะนักเรียนในชั้นปีตัวเอง");
  }

  if (patch.year !== undefined && (patch.year < 1 || patch.year > 5))
    throw new Error("ชั้นปีต้องอยู่ระหว่าง 1-5");
  if (patch.studentId !== undefined && !/^\d{4,12}$/.test(patch.studentId))
    throw new Error("รหัสนักเรียนเป็นตัวเลข 4-12 หลัก");

  await setDoc(
    doc(db(), "users", targetUid),
    { ...target, ...patch, updatedAt: Date.now() },
    { merge: true },
  );
}

/* ---------- delete user + checkins ---------- */

export async function deleteUserAndCheckins(
  callerUid: string,
  targetUid: string,
): Promise<void> {
  if (callerUid === targetUid) throw new Error("ห้ามลบตัวเอง");
  const [caller, target] = await Promise.all([
    loadProfile(callerUid), loadProfile(targetUid),
  ]);

  if (target.email.toLowerCase() === "goten8615xd@gmail.com")
    throw new Error("ห้ามลบ Top Admin หลัก");

  if (caller.role === "admin_teacher" || caller.role === "admin") {
    if (target.role !== "student" || target.year !== caller.year)
      throw new Error("ครูลบได้เฉพาะนักเรียนในชั้นปีตัวเอง");
  } else if (caller.role !== "top_admin") {
    throw new Error("ไม่มีสิทธิ์");
  }

  // ลบ checkins ของ user ทีละ batch
  while (true) {
    const q = query(
      collection(db(), "checkins"),
      where("userId", "==", targetUid),
      limit(400),
    );
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = writeBatch(db());
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 400) break;
  }

  // ลบ daily counters
  const dailyQ = await getDocs(collection(db(), `users/${targetUid}/dailyCheckins`));
  if (!dailyQ.empty) {
    const batch = writeBatch(db());
    dailyQ.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // บันทึก UID ที่ถูกลบ — ป้องกัน login กลับเข้ามาใหม่ (Firebase Auth account ยังคงอยู่
  // เนื่องจาก free plan ไม่มี Admin SDK สำหรับลบ Auth user)
  await setDoc(doc(db(), "blockedUsers", targetUid), {
    uid: targetUid,
    email: target.email,
    blockedAt: Date.now(),
    blockedBy: callerUid,
  });

  // ลบ user doc สุดท้าย
  await deleteDoc(doc(db(), "users", targetUid));

  // log activity
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "delete_user",
    { targetName: target.fullName || target.email },
    target.year,
  );
}

/* ---------- manual cleanup (Top Admin กดเอง) ---------- */

export async function cleanupOldCheckins(retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let total = 0;

  // ลบ checkins เก่า
  while (true) {
    const q = query(
      collection(db(), "checkins"),
      where("timestamp", "<", cutoff),
      limit(400),
    );
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = writeBatch(db());
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) break;
  }

  // ลบ activityLogs เก่า
  while (true) {
    const q = query(
      collection(db(), "activityLogs"),
      where("timestamp", "<", cutoff),
      limit(400),
    );
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = writeBatch(db());
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) break;
  }

  // ล้างรหัสฉุกเฉินหมดอายุ
  const codeCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const codeQ = query(
    collection(db(), "emergencyCodes"),
    where("expiresAt", "<", codeCutoff),
    limit(400),
  );
  const codeSnap = await getDocs(codeQ);
  if (!codeSnap.empty) {
    const batch = writeBatch(db());
    codeSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return total;
}

/* ---------- tasks (งานนักศึกษาวิชาทหาร) ---------- */

export async function createTask(
  callerUid: string,
  args: { name: string; year: number },
): Promise<string> {
  const caller = await loadProfile(callerUid);
  const allowed = ["admin_student", "admin_teacher", "admin", "top_admin"];
  if (!allowed.includes(caller.role)) throw new Error("ไม่มีสิทธิ์");
  if (caller.role !== "top_admin" && caller.year !== args.year)
    throw new Error("สร้างได้เฉพาะชั้นปีตัวเอง");
  if (!args.name.trim()) throw new Error("กรุณาตั้งชื่องาน");
  if (![1, 2, 3, 4, 5].includes(args.year)) throw new Error("ชั้นปีไม่ถูกต้อง");

  const ref = doc(collection(db(), "tasks"));
  const now = Date.now();
  await setDoc(ref, {
    id: ref.id,
    name: args.name.trim(),
    year: args.year,
    order: now,
    createdBy: caller.uid,
    createdByName: caller.fullName || caller.email,
    createdAt: now,
  });

  // log activity
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "task_create",
    { taskName: args.name.trim() },
    args.year,
  );

  return ref.id;
}

export async function deleteTask(callerUid: string, taskId: string): Promise<void> {
  const caller = await loadProfile(callerUid);
  const allowed = ["admin_student", "admin_teacher", "admin", "top_admin"];
  if (!allowed.includes(caller.role)) throw new Error("ไม่มีสิทธิ์");

  const taskSnap = await getDoc(doc(db(), "tasks", taskId));
  if (!taskSnap.exists()) return;
  const task = taskSnap.data();
  if (caller.role !== "top_admin" && caller.year !== task.year)
    throw new Error("ลบได้เฉพาะงานในชั้นปีตัวเอง");

  // ลบ task + completions ทั้งหมดของ task นี้
  while (true) {
    const q = query(
      collection(db(), "taskCompletions"),
      where("taskId", "==", taskId),
      limit(400),
    );
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = writeBatch(db());
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 400) break;
  }
  await deleteDoc(doc(db(), "tasks", taskId));

  // log activity
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "task_delete",
    { taskName: task.name },
    task.year,
  );
}

export async function toggleTaskCompletion(
  callerUid: string,
  args: { taskId: string; taskName: string; studentUid: string; year: number; done: boolean },
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const allowed = ["admin_student", "admin_teacher", "admin", "top_admin"];
  if (!allowed.includes(caller.role)) throw new Error("ไม่มีสิทธิ์");
  if (caller.role !== "top_admin" && caller.year !== args.year)
    throw new Error("ติ๊กได้เฉพาะชั้นปีตัวเอง");

  const completionId = `${args.taskId}_${args.studentUid}`;
  await setDoc(doc(db(), "taskCompletions", completionId), {
    id: completionId,
    taskId: args.taskId,
    taskName: args.taskName,
    studentUid: args.studentUid,
    year: args.year,
    done: args.done,
    checkedBy: caller.uid,
    checkedByName: caller.fullName || caller.email,
    checkedAt: Date.now(),
  });

  // log activity
  const student = await loadProfile(args.studentUid);
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "task_check",
    {
      taskName: args.taskName,
      studentName: student.fullName || student.email,
      done: args.done,
    },
    args.year,
  );
}

/* ---------- year config (passing percent) ---------- */

export async function setYearPassingPercent(
  callerUid: string,
  year: number,
  passingPercent: number,
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const isTeacher = caller.role === "admin_teacher" || caller.role === "admin";
  const isTop = caller.role === "top_admin";
  if (!isTeacher && !isTop) throw new Error("ไม่มีสิทธิ์");
  if (isTeacher && !isTop && caller.year !== year)
    throw new Error("ตั้งได้เฉพาะชั้นปีตัวเอง");
  if (passingPercent < 0 || passingPercent > 100)
    throw new Error("เกณฑ์ % ต้องอยู่ระหว่าง 0-100");

  await setDoc(doc(db(), "yearConfigs", `year${year}`), {
    year,
    passingPercent: Math.round(passingPercent),
    updatedBy: caller.uid,
    updatedAt: Date.now(),
  });
}

/* ---------- pending students (bulk import) ---------- */

export interface PendingStudentInput {
  studentId: string;
  fullName: string;
  nickname?: string;
  classroom?: string;
  year: number;
}

export async function bulkUpsertPendingStudents(
  callerUid: string,
  rows: PendingStudentInput[],
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const caller = await loadProfile(callerUid);
  const isTeacher = caller.role === "admin_teacher" || caller.role === "admin";
  const isTop = caller.role === "top_admin";
  if (!isTeacher && !isTop) throw new Error("ไม่มีสิทธิ์");

  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  const now = Date.now();

  // upload เป็น chunk ละ 400 (ลิมิต batch 500)
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const batch = writeBatch(db());
    for (const r of chunk) {
      if (!/^\d{4,12}$/.test(r.studentId)) {
        errors.push(`${r.studentId}: รหัสนักเรียนต้องเป็นตัวเลข 4-12 หลัก`);
        skipped++;
        continue;
      }
      if (!r.fullName.trim()) {
        errors.push(`${r.studentId}: ไม่มีชื่อ-นามสกุล`);
        skipped++;
        continue;
      }
      if (![1, 2, 3, 4, 5].includes(r.year)) {
        errors.push(`${r.studentId}: ชั้นปีต้องเป็น 1-5`);
        skipped++;
        continue;
      }
      if (isTeacher && !isTop && r.year !== caller.year) {
        errors.push(`${r.studentId}: ครูเพิ่มได้เฉพาะปี ${caller.year}`);
        skipped++;
        continue;
      }
      batch.set(doc(db(), "pendingStudents", r.studentId), {
        studentId: r.studentId,
        fullName: r.fullName.trim(),
        nickname: r.nickname?.trim() ?? "",
        classroom: r.classroom?.trim() ?? "",
        year: r.year,
        createdBy: caller.uid,
        createdByName: caller.fullName || caller.email,
        createdAt: now,
      });
      inserted++;
    }
    if (chunk.length > 0) await batch.commit();
  }

  return { inserted, skipped, errors };
}

/** อ่านข้อมูล pre-filled ตอนนักเรียน register */
export async function lookupPendingStudent(studentId: string) {
  const snap = await getDoc(doc(db(), "pendingStudents", studentId));
  if (!snap.exists()) return null;
  return snap.data() as {
    studentId: string;
    fullName: string;
    nickname: string;
    classroom: string;
    year: number;
  };
}

/* ---------- groups (กลุ่มจราจร — ข้ามชั้นปีได้) ---------- */

async function ensureAdminLevel(callerUid: string) {
  const caller = await loadProfile(callerUid);
  const ok = ["admin_teacher", "admin", "top_admin"].includes(caller.role);
  if (!ok) throw new Error("เฉพาะครูเท่านั้น");
  return caller;
}

export async function createGroup(
  callerUid: string,
  args: { number: number; year: number; note?: string },
): Promise<string> {
  await ensureAdminLevel(callerUid);
  if (!Number.isInteger(args.number) || args.number < 1) throw new Error("เลขกลุ่มต้อง >= 1");
  const ref = doc(collection(db(), "groups"));
  const caller = await loadProfile(callerUid);
  const now = Date.now();
  await setDoc(ref, {
    id: ref.id,
    number: args.number,
    order: now, // ลำดับเริ่มต้น = เวลาสร้าง (ต่อท้าย)
    year: args.year,
    memberUids: [],
    members: [],
    note: args.note ?? "",
    checked: false,
    createdBy: caller.uid,
    createdByName: caller.fullName || caller.email,
    createdAt: now,
    updatedAt: now,
  });

  // log activity
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "group_create",
    { groupNumber: args.number, year: args.year },
    args.year,
  );

  return ref.id;
}

export async function renameGroup(
  callerUid: string,
  groupId: string,
  number: number,
  year: number,
  note?: string,
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const ref = doc(db(), "groups", groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบกลุ่ม");
  const cur = snap.data();
  await setDoc(ref, {
    ...cur,
    number,
    year,
    note: note ?? cur.note ?? "",
    updatedAt: Date.now(),
  });

  // log activity
  const caller = await loadProfile(callerUid);
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "group_update",
    { groupNumber: number, year },
    year,
  );
}

export async function deleteGroup(callerUid: string, groupId: string): Promise<void> {
  await ensureAdminLevel(callerUid);
  const groupSnap = await getDoc(doc(db(), "groups", groupId));
  const groupNumber = groupSnap.exists() ? (groupSnap.data() as any).number : 0;
  const groupYear = groupSnap.exists() ? (groupSnap.data() as any).year : undefined;

  await deleteDoc(doc(db(), "groups", groupId));

  // log activity
  const caller = await loadProfile(callerUid);
  await logActivity(
    callerUid,
    caller.fullName || caller.email,
    "group_delete",
    { groupNumber },
    groupYear,
  );
}

export async function checkGroup(
  callerUid: string,
  groupId: string,
  status: "pass" | "fail",
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const ref = doc(db(), "groups", groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบกลุ่ม");
  const cur = snap.data() as GroupDoc;
  const now = Date.now();
  const dayKey = todayKeyBangkok();

  await setDoc(ref, {
    ...cur,
    checkStatus: status,
    checkedBy: caller.uid,
    checkedByName: caller.fullName || caller.email,
    checkedAt: now,
    updatedAt: now,
  });

  // บันทึกประวัติเวรรายวัน — snapshot สมาชิก ณ วันเข้าเวร
  const logId = `${dayKey}_${groupId}`;
  await setDoc(doc(db(), "dutyLogs", logId), {
    id: logId,
    groupId,
    groupNumber: cur.number,
    year: cur.year,
    dayKey,
    checkStatus: status,
    members: (cur.members ?? []).map((m) => ({
      uid: m.uid,
      fullName: m.fullName,
      nickname: m.nickname,
      classroom: m.classroom,
    })),
    checkedBy: caller.uid,
    checkedByName: caller.fullName || caller.email,
    checkedAt: now,
  });
}

export async function uncheckGroup(
  _callerUid: string,
  groupId: string,
): Promise<void> {
  const ref = doc(db(), "groups", groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบกลุ่ม");

  // ใช้ updateDoc + deleteField แทน setDoc({...undefined}) — Firestore ไม่รับ undefined
  await updateDoc(ref, {
    checkStatus: deleteField(),
    checkedBy: deleteField(),
    checkedByName: deleteField(),
    checkedAt: deleteField(),
    updatedAt: Date.now(),
  });

  // ลบประวัติเวรของวันนี้ (ถ้ามี) — กดยกเลิกติ๊ก
  const dayKey = todayKeyBangkok();
  await deleteDoc(doc(db(), "dutyLogs", `${dayKey}_${groupId}`));
}

export async function resetAllGroupChecks(callerUid: string, year: number): Promise<void> {
  await ensureAdminLevel(callerUid);
  const q = query(collection(db(), "groups"), where("year", "==", year));
  const snap = await getDocs(q);
  const batch = writeBatch(db());
  snap.docs.forEach((d) => {
    batch.update(d.ref, {
      checkStatus: deleteField(),
      checkedBy: deleteField(),
      checkedByName: deleteField(),
      checkedAt: deleteField(),
      updatedAt: Date.now(),
    });
  });
  await batch.commit();
}

export async function addGroupMember(
  callerUid: string,
  groupId: string,
  studentUid: string,
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const ref = doc(db(), "groups", groupId);
  const [groupSnap, student] = await Promise.all([
    getDoc(ref),
    loadProfile(studentUid),
  ]);
  if (!groupSnap.exists()) throw new Error("ไม่พบกลุ่ม");
  const cur = groupSnap.data() as any;
  if (cur.memberUids?.includes(studentUid))
    throw new Error("นักเรียนคนนี้อยู่ในกลุ่มแล้ว");

  // เช็คว่าอยู่กลุ่มอื่นไหม (กฎ: 1 คน 1 กลุ่ม)
  const otherQ = query(
    collection(db(), "groups"),
    where("memberUids", "array-contains", studentUid),
  );
  const other = await getDocs(otherQ);
  if (!other.empty) {
    const og = other.docs[0].data() as any;
    throw new Error(`นักเรียนคนนี้อยู่ในกลุ่ม "${og.name}" แล้ว`);
  }

  const member = {
    uid: student.uid,
    fullName: student.fullName,
    nickname: student.nickname,
    studentId: student.studentId,
    classroom: student.classroom,
    year: student.year,
  };
  await setDoc(ref, {
    ...cur,
    memberUids: [...(cur.memberUids ?? []), studentUid],
    members: [...(cur.members ?? []), member],
    updatedAt: Date.now(),
  });
}

export async function removeGroupMember(
  callerUid: string,
  groupId: string,
  studentUid: string,
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const ref = doc(db(), "groups", groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบกลุ่ม");
  const cur = snap.data() as any;
  await setDoc(ref, {
    ...cur,
    memberUids: (cur.memberUids ?? []).filter((u: string) => u !== studentUid),
    members: (cur.members ?? []).filter((m: any) => m.uid !== studentUid),
    updatedAt: Date.now(),
  });
}

/** เรียงลำดับกลุ่มใหม่ — รับ array ของ groupId ตามลำดับที่ต้องการ
 *  เขียนเฉพาะ field order (ไม่แตะ number — เลขกลุ่มเป็นป้ายชื่อถาวร) */
export async function reorderGroups(
  callerUid: string,
  orderedGroupIds: string[],
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const batch = writeBatch(db());
  const now = Date.now();
  orderedGroupIds.forEach((gid, i) => {
    batch.update(doc(db(), "groups", gid), { order: i + 1, updatedAt: now });
  });
  await batch.commit();
}

/* ---------- attendance exemptions (ยกเว้นการขาด — นับเป็นมาแทน) ---------- */

/** doc id = `${dayKey}_${studentUid}` เพื่อกันซ้ำ/วันละครั้ง */
export async function exemptAttendance(
  callerUid: string,
  args: { studentUid: string; year: number; dayKey: string; reason?: string },
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const allowed = ["admin_student", "admin_teacher", "admin", "top_admin"];
  if (!allowed.includes(caller.role)) throw new Error("ไม่มีสิทธิ์");
  if (caller.role !== "top_admin" && caller.year !== args.year)
    throw new Error("ทำได้เฉพาะชั้นปีตัวเอง");

  const id = `${args.dayKey}_${args.studentUid}`;
  await setDoc(doc(db(), "attendanceExemptions", id), {
    id,
    studentUid: args.studentUid,
    year: args.year,
    dayKey: args.dayKey,
    reason: args.reason ?? "",
    exemptedBy: caller.uid,
    exemptedByName: caller.fullName || caller.email,
    exemptedAt: Date.now(),
  });
}

export async function unexemptAttendance(
  callerUid: string,
  args: { studentUid: string; dayKey: string },
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const allowed = ["admin_student", "admin_teacher", "admin", "top_admin"];
  if (!allowed.includes(caller.role)) throw new Error("ไม่มีสิทธิ์");
  await deleteDoc(doc(db(), "attendanceExemptions", `${args.dayKey}_${args.studentUid}`));
}

/* ---------- swap requests (นักเรียนขอสลับเวร) ---------- */

export async function createSwapRequest(
  callerUid: string,
  args: {
    fromSessionId: string;
    toSessionId?: string;
    reason: string;
  },
): Promise<string> {
  const me = await loadProfile(callerUid);
  if (!args.reason.trim()) throw new Error("กรุณาใส่เหตุผล");
  const fromSnap = await getDoc(doc(db(), "sessions", args.fromSessionId));
  if (!fromSnap.exists()) throw new Error("ไม่พบเวรต้นทาง");
  const from = fromSnap.data() as any;

  // ตรวจว่าตัวเองอยู่กลุ่มที่มีเวรนี้ไหม
  const groupSnap = await getDoc(doc(db(), "groups", from.groupId));
  const group = groupSnap.data() as any;
  if (!group?.memberUids?.includes(me.uid))
    throw new Error("คุณไม่ได้อยู่ในกลุ่มนี้");

  let toDate: number | null = null;
  if (args.toSessionId) {
    const toSnap = await getDoc(doc(db(), "sessions", args.toSessionId));
    if (!toSnap.exists()) throw new Error("ไม่พบเวรปลายทาง");
    toDate = (toSnap.data() as any).date;
  }

  const ref = doc(collection(db(), "swapRequests"));
  await setDoc(ref, {
    id: ref.id,
    fromSessionId: from.id,
    fromGroupId: from.groupId,
    fromGroupName: from.groupName,
    fromDate: from.date,
    toSessionId: args.toSessionId ?? null,
    toDate,
    requestedBy: me.uid,
    requestedByName: me.fullName || me.email,
    reason: args.reason.trim(),
    status: "pending",
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function decideSwapRequest(
  callerUid: string,
  requestId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const caller = await loadProfile(callerUid);
  const ref = doc(db(), "swapRequests", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบคำขอ");
  const cur = snap.data() as any;
  if (cur.status !== "pending") throw new Error("คำขอนี้ถูกตัดสินไปแล้ว");
  await setDoc(ref, {
    ...cur,
    status: decision,
    decidedBy: caller.uid,
    decidedByName: caller.fullName || caller.email,
    decidedAt: Date.now(),
    decisionNote: note ?? "",
  });
}

export async function cancelSwapRequest(
  callerUid: string,
  requestId: string,
): Promise<void> {
  const ref = doc(db(), "swapRequests", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบคำขอ");
  const cur = snap.data() as any;
  if (cur.requestedBy !== callerUid) throw new Error("ยกเลิกได้เฉพาะคำขอของตัวเอง");
  if (cur.status !== "pending") throw new Error("ยกเลิกได้เฉพาะคำขอที่รออนุมัติ");
  await setDoc(ref, { ...cur, status: "rejected", decidedAt: Date.now() });
}

/* ========== Activity Check-in System ========== */

export async function createActivity(
  callerUid: string,
  data: {
    name: string;
    year: number;
    type: "normal" | "external";
    locations: Array<{ id: string; name: string; lat: number; lng: number }>;
    radiusMeters: number;
  },
): Promise<string> {
  await ensureAdminLevel(callerUid);
  const caller = await loadProfile(callerUid);
  const isTop = caller.role === "top_admin";
  if (!isTop && data.year !== caller.year)
    throw new Error("แก้ได้เฉพาะชั้นปีตัวเอง");

  const ref = doc(collection(db(), "activities"));
  await setDoc(ref, {
    id: ref.id,
    name: data.name,
    year: data.year,
    type: data.type,
    locations: data.locations,
    radiusMeters: data.radiusMeters,
    isOpen: false,
    createdBy: caller.uid,
    createdByName: caller.fullName || caller.email,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return ref.id;
}

export async function updateActivity(
  callerUid: string,
  activityId: string,
  patch: {
    name?: string;
    type?: "normal" | "external";
    locations?: Array<{ id: string; name: string; lat: number; lng: number }>;
    radiusMeters?: number;
  },
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const caller = await loadProfile(callerUid);
  const ref = doc(db(), "activities", activityId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบกิจกรรม");
  const cur = snap.data() as any;

  const isTop = caller.role === "top_admin";
  if (!isTop && cur.year !== caller.year)
    throw new Error("แก้ได้เฉพาะชั้นปีตัวเอง");

  await setDoc(ref, { ...cur, ...patch, updatedAt: Date.now() });
}

export async function deleteActivity(
  callerUid: string,
  activityId: string,
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const caller = await loadProfile(callerUid);
  const ref = doc(db(), "activities", activityId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบกิจกรรม");
  const cur = snap.data() as any;

  const isTop = caller.role === "top_admin";
  if (!isTop && cur.year !== caller.year)
    throw new Error("ลบได้เฉพาะชั้นปีตัวเอง");

  const deleteRelated = async (collectionName: string) => {
    while (true) {
      const snap = await getDocs(
        query(collection(db(), collectionName), where("activityId", "==", activityId), limit(400)),
      );
      if (snap.empty) return;
      const batch = writeBatch(db());
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (snap.size < 400) return;
    }
  };

  await Promise.all([
    deleteRelated("activityCheckins"),
    deleteRelated("activityExemptions"),
    deleteRelated("activityEmergencyCodes"),
  ]);

  {
    const batch = writeBatch(db());
    batch.delete(ref);
    await batch.commit();
  }
}

export async function toggleActivityOpen(
  callerUid: string,
  activityId: string,
  isOpen: boolean,
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const caller = await loadProfile(callerUid);
  const ref = doc(db(), "activities", activityId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบกิจกรรม");
  const cur = snap.data() as any;

  const isTop = caller.role === "top_admin";
  if (!isTop && cur.year !== caller.year)
    throw new Error("แก้ได้เฉพาะชั้นปีตัวเอง");

  await setDoc(ref, { ...cur, isOpen, updatedAt: Date.now() });
}

export async function submitActivityCheckin(
  uid: string,
  activityId: string,
  pos: { lat: number; lng: number },
  accuracy: number,
): Promise<void> {
  const [profile, activitySnap] = await Promise.all([
    loadProfile(uid),
    getDoc(doc(db(), "activities", activityId)),
  ]);
  if (!activitySnap.exists()) throw new Error("ไม่พบกิจกรรม");
  const activity = activitySnap.data() as any;

  if (!activity.isOpen) throw new Error("กิจกรรมนี้ยังไม่เปิดให้เช็คอิน");
  if (activity.year !== profile.year) throw new Error("กิจกรรมนี้ไม่ใช่ของชั้นปีคุณ");

  const checkinId = `${activityId}_${uid}`;

  // หาจุดใกล้สุด
  let best: { loc: any; dist: number } | null = null;
  for (const loc of activity.locations) {
    const d = distanceMeters(pos, loc);
    if (!best || d < best.dist) best = { loc, dist: d };
  }
  if (!best) throw new Error("ไม่พบจุดเช็คอิน");
  if (best.dist > activity.radiusMeters)
    throw new Error(`คุณอยู่ห่างจากจุดเช็คอิน "${best.loc.name}" ${best.dist.toFixed(0)} เมตร (อนุญาตไม่เกิน ${activity.radiusMeters} ม.)`);

  await runTransaction(db(), async (tx) => {
    const checkinRef = doc(db(), "activityCheckins", checkinId);
    const existingSnap = await tx.get(checkinRef);
    if (existingSnap.exists()) throw new Error("คุณเช็คอินกิจกรรมนี้ไปแล้ว");

    tx.set(checkinRef, {
      id: checkinId,
      activityId,
      activityName: activity.name,
      userId: uid,
      fullName: profile.fullName,
      nickname: profile.nickname,
      classroom: profile.classroom,
      year: profile.year,
      studentId: profile.studentId,
      timestamp: Date.now(),
      location: pos,
      accuracy,
      distanceMeters: best.dist,
      mapLink: googleMapsLink(pos.lat, pos.lng),
      locationId: best.loc.id,
      method: "gps",
    });
  });
}

export async function submitActivityEmergencyCheckin(
  uid: string,
  activityId: string,
  code: string,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("รหัสฉุกเฉินไม่ถูกต้อง");

  const profile = await loadProfile(uid);
  const codeRef = doc(db(), "activityEmergencyCodes", code);
  const activityRef = doc(db(), "activities", activityId);

  await runTransaction(db(), async (tx) => {
    const activitySnap = await tx.get(activityRef);
    const codeSnap = await tx.get(codeRef);

    if (!activitySnap.exists()) throw new Error("ไม่พบกิจกรรม");
    const activity = activitySnap.data() as any;
    if (!activity.isOpen) throw new Error("กิจกรรมนี้ปิดรับเช็คอินแล้ว");

    if (!codeSnap.exists()) throw new Error("รหัสไม่ถูกต้อง");
    const codeData = codeSnap.data() as any;
    if (codeData.activityId !== activityId)
      throw new Error("รหัสนี้เป็นของกิจกรรมอื่น");
    if (codeData.used) throw new Error("รหัสนี้ถูกใช้ไปแล้ว");
    if (Date.now() > codeData.expiresAt) throw new Error("รหัสหมดอายุแล้ว");
    if (codeData.year !== profile.year)
      throw new Error("รหัสนี้ไม่ใช่ของชั้นปีคุณ");

    const checkinId = activityId + "_" + uid;
    const checkinRef = doc(db(), "activityCheckins", checkinId);
    const existingSnap = await tx.get(checkinRef);
    if (existingSnap.exists()) throw new Error("คุณเช็คอินกิจกรรมนี้ไปแล้ว");

    const now = Date.now();
    tx.set(checkinRef, {
      id: checkinId,
      activityId,
      activityName: activity.name,
      userId: uid,
      fullName: profile.fullName,
      nickname: profile.nickname,
      classroom: profile.classroom,
      year: profile.year,
      studentId: profile.studentId,
      timestamp: now,
      location: { lat: 0, lng: 0 },
      accuracy: 0,
      distanceMeters: -1,
      mapLink: "",
      locationId: "",
      method: "emergency_code",
    });
    tx.update(codeRef, {
      used: true,
      usedBy: uid,
      usedAt: now,
    });
  });
}
export async function createActivityEmergencyCode(
  callerUid: string,
  activityId: string,
): Promise<string> {
  await ensureAdminLevel(callerUid);
  const caller = await loadProfile(callerUid);
  const activitySnap = await getDoc(doc(db(), "activities", activityId));
  if (!activitySnap.exists()) throw new Error("ไม่พบกิจกรรม");
  const activity = activitySnap.data() as any;

  const code = genCode();
  await setDoc(doc(db(), "activityEmergencyCodes", code), {
    code,
    activityId,
    activityName: activity.name,
    createdBy: caller.uid,
    createdByName: caller.fullName || caller.email,
    year: activity.year,
    expiresAt: Date.now() + 10 * 60 * 1000,
    used: false,
  });
  return code;
}

export async function exemptActivityAttendance(
  callerUid: string,
  data: { activityId: string; studentUid: string; reason?: string },
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const caller = await loadProfile(callerUid);
  const activitySnap = await getDoc(doc(db(), "activities", data.activityId));
  if (!activitySnap.exists()) throw new Error("ไม่พบกิจกรรม");
  const activity = activitySnap.data() as any;

  const exemptId = `${data.activityId}_${data.studentUid}`;
  await setDoc(doc(db(), "activityExemptions", exemptId), {
    id: exemptId,
    activityId: data.activityId,
    studentUid: data.studentUid,
    year: activity.year,
    reason: data.reason ?? "",
    exemptedBy: caller.uid,
    exemptedByName: caller.fullName || caller.email,
    exemptedAt: Date.now(),
  });
}

export async function unexemptActivityAttendance(
  callerUid: string,
  data: { activityId: string; studentUid: string },
): Promise<void> {
  await ensureAdminLevel(callerUid);
  const exemptId = `${data.activityId}_${data.studentUid}`;
  await deleteDoc(doc(db(), "activityExemptions", exemptId));
}

export async function setCharacterEvaluation(
  callerUid: string,
  data: { studentUid: string; year: number; evaluated: boolean },
): Promise<void> {
  const caller = await loadProfile(callerUid);
  const target = await loadProfile(data.studentUid);
  const allowed = ["admin_student", "admin_teacher", "admin", "top_admin"];
  if (!allowed.includes(caller.role)) throw new Error("ไม่มีสิทธิ์");
  if (caller.role !== "top_admin" && caller.year !== data.year)
    throw new Error("ทำได้เฉพาะชั้นปีตัวเอง");
  if (target.year !== data.year)
    throw new Error("ชั้นปีของนักเรียนไม่ตรงกับรายการประเมิน");
  if (!["student", "admin_student"].includes(target.role))
    throw new Error("ประเมินได้เฉพาะนักเรียน");

  const id = `${data.year}_${data.studentUid}`;
  await setDoc(doc(db(), "characterEvaluations", id), {
    id,
    studentUid: data.studentUid,
    year: data.year,
    evaluated: data.evaluated,
    evaluatedBy: caller.uid,
    evaluatedByName: caller.fullName || caller.email,
    evaluatedAt: Date.now(),
  });
}

// ============================================================================
// Backup & Restore
// ============================================================================

export async function exportAllData(callerUid: string): Promise<{
  users: any[];
  checkins: any[];
  activityCheckins: any[];
  groups: any[];
  activities: any[];
  tasks: any[];
  activityLogs: any[];
}> {
  const caller = await loadProfile(callerUid);
  if (caller.role !== "top_admin") throw new Error("ไม่มีสิทธิ์");

  const [
    usersSnap,
    checkinsSnap,
    activityCheckinsSnap,
    groupsSnap,
    activitiesSnap,
    tasksSnap,
    logsSnap,
  ] = await Promise.all([
    getDocs(collection(db(), "users")),
    getDocs(collection(db(), "checkins")),
    getDocs(collection(db(), "activityCheckins")),
    getDocs(collection(db(), "groups")),
    getDocs(collection(db(), "activities")),
    getDocs(collection(db(), "tasks")),
    getDocs(collection(db(), "activityLogs")),
  ]);

  return {
    users: usersSnap.docs.map((d) => d.data()),
    checkins: checkinsSnap.docs.map((d) => d.data()),
    activityCheckins: activityCheckinsSnap.docs.map((d) => d.data()),
    groups: groupsSnap.docs.map((d) => d.data()),
    activities: activitiesSnap.docs.map((d) => d.data()),
    tasks: tasksSnap.docs.map((d) => d.data()),
    activityLogs: logsSnap.docs.map((d) => d.data()),
  };
}

export async function importAllData(
  callerUid: string,
  data: {
    users: any[];
    checkins: any[];
    activityCheckins: any[];
    groups: any[];
    activities: any[];
    tasks: any[];
    activityLogs: any[];
  },
): Promise<void> {
  const caller = await loadProfile(callerUid);
  if (caller.role !== "top_admin") throw new Error("ไม่มีสิทธิ์");

  const importBatch = async (collName: string, records: any[]) => {
    for (let i = 0; i < records.length; i += 500) {
      const batch = writeBatch(db());
      records.slice(i, i + 500).forEach((record) => {
        batch.set(doc(db(), collName, record.id), record);
      });
      await batch.commit();
    }
  };

  const deleteOrphans = async (collName: string, newRecords: any[]) => {
    const newIds = new Set(newRecords.map((r) => r.id as string));
    const snap = await getDocs(collection(db(), collName));
    const orphans = snap.docs.filter((d) => !newIds.has(d.id));
    for (let i = 0; i < orphans.length; i += 500) {
      const batch = writeBatch(db());
      orphans.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  const collections: Array<[string, any[]]> = [
    ["users", data.users],
    ["checkins", data.checkins],
    ["activityCheckins", data.activityCheckins],
    ["groups", data.groups],
    ["activities", data.activities],
    ["tasks", data.tasks],
    ["activityLogs", data.activityLogs],
  ];

  // Phase 1: เขียนข้อมูลใหม่ก่อน — ป้องกันข้อมูลสูญหายถ้าเกิดข้อผิดพลาดกลางคัน
  await Promise.all(collections.map(([name, records]) => importBatch(name, records)));

  // Phase 2: ลบ doc ที่ไม่อยู่ใน backup ใหม่
  await Promise.all(collections.map(([name, records]) => deleteOrphans(name, records)));
}
