import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { db, REGION, BOOTSTRAP_TOP_ADMIN_EMAIL } from "./shared";

type Role = "student" | "admin" | "top_admin";

async function getCallerRole(uid: string): Promise<Role> {
  const snap = await db.collection("users").doc(uid).get();
  return (snap.data()?.role as Role) ?? "student";
}

/**
 * Top Admin เปลี่ยน role ของ user คนอื่น
 * - ห้าม downgrade bootstrap top admin
 * - ห้ามเปลี่ยน role ตัวเอง
 */
export const setUserRole = onCall(
  { region: REGION, cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "ต้องเข้าสู่ระบบ");
    const callerUid = req.auth.uid;

    const callerRole = await getCallerRole(callerUid);
    if (callerRole !== "top_admin")
      throw new HttpsError("permission-denied", "เฉพาะ Top Admin เท่านั้น");

    const { targetUid, role } = req.data as { targetUid: string; role: Role };
    if (!targetUid || !["student", "admin", "top_admin"].includes(role))
      throw new HttpsError("invalid-argument", "ข้อมูลไม่ถูกต้อง");
    if (targetUid === callerUid)
      throw new HttpsError("failed-precondition", "ห้ามเปลี่ยนสิทธิ์ของตัวเอง");

    const targetRef = db.collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists)
      throw new HttpsError("not-found", "ไม่พบผู้ใช้");

    const targetEmail = (targetSnap.data()?.email as string | undefined)?.toLowerCase();
    if (
      targetEmail === BOOTSTRAP_TOP_ADMIN_EMAIL.toLowerCase() &&
      role !== "top_admin"
    ) {
      throw new HttpsError("failed-precondition", "ห้ามลดสิทธิ์ Top Admin หลัก");
    }

    await targetRef.update({ role, updatedAt: Date.now() });
    await getAuth().setCustomUserClaims(targetUid, { role });
    return { ok: true };
  },
);

/**
 * Top Admin ลบ user ทั้งระบบได้
 * Admin ลบได้เฉพาะ student ในชั้นปีตัวเอง
 * ลบ Auth + users doc + checkins ของคนนั้น
 */
export const deleteUserAndCheckins = onCall(
  { region: REGION, cors: true, timeoutSeconds: 120 },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "ต้องเข้าสู่ระบบ");
    const callerUid = req.auth.uid;
    const callerSnap = await db.collection("users").doc(callerUid).get();
    const caller = callerSnap.data();
    if (!caller) throw new HttpsError("not-found", "ไม่พบโปรไฟล์ผู้เรียก");

    const { targetUid } = req.data as { targetUid: string };
    if (!targetUid) throw new HttpsError("invalid-argument", "ขาด targetUid");
    if (targetUid === callerUid)
      throw new HttpsError("failed-precondition", "ห้ามลบตัวเอง");

    const targetRef = db.collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError("not-found", "ไม่พบผู้ใช้");
    const target = targetSnap.data()!;

    if (
      (target.email as string | undefined)?.toLowerCase() ===
      BOOTSTRAP_TOP_ADMIN_EMAIL.toLowerCase()
    ) {
      throw new HttpsError("failed-precondition", "ห้ามลบ Top Admin หลัก");
    }

    if (caller.role === "admin") {
      if (target.role !== "student" || target.year !== caller.year)
        throw new HttpsError("permission-denied", "Admin ลบได้เฉพาะนักเรียนในชั้นปีตัวเอง");
    } else if (caller.role !== "top_admin") {
      throw new HttpsError("permission-denied", "ไม่มีสิทธิ์");
    }

    // ลบ checkins ของ user เป็น batch
    const batchSize = 400;
    while (true) {
      const q = await db
        .collection("checkins")
        .where("userId", "==", targetUid)
        .limit(batchSize)
        .get();
      if (q.empty) break;
      const batch = db.batch();
      q.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (q.size < batchSize) break;
    }

    await targetRef.delete();
    try {
      await getAuth().deleteUser(targetUid);
    } catch (e) {
      console.warn("Auth deleteUser failed (อาจไม่มีอยู่แล้ว)", e);
    }
    return { ok: true };
  },
);
