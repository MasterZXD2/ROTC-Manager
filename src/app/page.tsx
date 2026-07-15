"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isProfileComplete } from "@/lib/profile";
import { Loader2 } from "lucide-react";

export default function RootPage() {
  const { loading, fbUser, userDoc } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!fbUser) return router.replace("/login");
    if (!userDoc) return;
    if (userDoc.role === "top_admin") return router.replace("/top-admin");
    if (userDoc.role === "admin_teacher" || userDoc.role === "admin")
      return router.replace("/admin-teacher");
    if (userDoc.role === "admin_student") return router.replace("/admin-student");
    if (!isProfileComplete(userDoc))
      return router.replace("/register");
    router.replace("/student/checkin");
  }, [loading, fbUser, userDoc, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
