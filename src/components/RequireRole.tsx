"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface Props {
  allow: Role[];
  redirectIfMissing?: string;
  children: ReactNode;
}

export function RequireRole({ allow, redirectIfMissing = "/", children }: Props) {
  const { loading, fbUser, userDoc } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      router.replace("/login");
      return;
    }
    if (!userDoc) return;
    if (!allow.includes(userDoc.role)) {
      router.replace(redirectIfMissing);
      return;
    }
    if (
      userDoc.role === "student" &&
      (!userDoc.fullName || !userDoc.studentId || !userDoc.year)
    ) {
      router.replace("/register");
    }
  }, [loading, fbUser, userDoc, allow, redirectIfMissing, router]);

  if (loading || !fbUser || !userDoc) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!allow.includes(userDoc.role)) return null;
  return <>{children}</>;
}
