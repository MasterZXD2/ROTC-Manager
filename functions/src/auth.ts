import { beforeUserCreated } from "firebase-functions/v2/identity";
import { HttpsError } from "firebase-functions/v2/https";
import { db, BOOTSTRAP_TOP_ADMIN_EMAIL, REGION, DEFAULT_CONFIG, FV } from "./shared";

/**
 * ก่อนสร้าง user — ถ้าเป็น email bootstrap ทำให้ doc มี role=top_admin ตั้งแต่แรก
 * และ seed config/global ครั้งแรก
 */
export const onUserSignup = beforeUserCreated(
  { region: REGION },
  async (event) => {
    const user = event.data;
    if (!user?.email) throw new HttpsError("invalid-argument", "ต้องมีอีเมล");

    const isBootstrap = user.email.toLowerCase() === BOOTSTRAP_TOP_ADMIN_EMAIL.toLowerCase();
    const role = isBootstrap ? "top_admin" : "student";

    const userRef = db.collection("users").doc(user.uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      await userRef.set({
        uid: user.uid,
        email: user.email,
        role,
        fullName: "",
        nickname: "",
        classroom: "",
        studentId: "",
        year: 0,
        photoURL: user.photoURL ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    if (isBootstrap) {
      const cfgRef = db.doc("config/global");
      const cfgSnap = await cfgRef.get();
      if (!cfgSnap.exists) {
        await cfgRef.set({ ...DEFAULT_CONFIG, createdAt: FV.serverTimestamp() });
      }
    }

    return { customClaims: { role } };
  },
);
