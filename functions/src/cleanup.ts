import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, REGION } from "./shared";

/**
 * รันทุกคืน (เวลาไทย 02:00) — ลบ check-in ที่เก่ากว่า historyRetentionDays
 * (default 90 วัน — ตั้งใน config/global) และล้าง emergencyCodes ที่หมดอายุ
 */
export const cleanupOldCheckins = onSchedule(
  {
    region: REGION,
    schedule: "0 2 * * *",
    timeZone: "Asia/Bangkok",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const cfgSnap = await db.doc("config/global").get();
    const retentionDays =
      (cfgSnap.data()?.historyRetentionDays as number | undefined) ?? 90;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const batchSize = 400;
    let totalDeleted = 0;

    while (true) {
      const q = await db
        .collection("checkins")
        .where("timestamp", "<", cutoff)
        .limit(batchSize)
        .get();
      if (q.empty) break;
      const batch = db.batch();
      q.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += q.size;
      if (q.size < batchSize) break;
    }

    // ล้างรหัสฉุกเฉินที่หมดอายุ > 1 วัน
    const codeCutoff = Date.now() - 24 * 60 * 60 * 1000;
    while (true) {
      const q = await db
        .collection("emergencyCodes")
        .where("expiresAt", "<", codeCutoff)
        .limit(batchSize)
        .get();
      if (q.empty) break;
      const batch = db.batch();
      q.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (q.size < batchSize) break;
    }

    console.log(
      `cleanupOldCheckins: deleted ${totalDeleted} check-ins (retention=${retentionDays} วัน)`,
    );
  },
);
