"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

export function MaintenanceNotice() {
  const { fbUser } = useAuth();
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!fbUser) { setActive(false); return; }
    return onSnapshot(doc(db(), "config", "maintenance"), (snapshot) => setActive(snapshot.data()?.active === true), () => setActive(false));
  }, [fbUser]);
  if (!active) return null;
  return <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">ผู้ดูแลกำลังจัดการข้อมูล ระบบพักการบันทึกชั่วคราว กรุณารอจนข้อความนี้หายแล้วลองอีกครั้ง</div>;
}
