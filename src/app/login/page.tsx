"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, MapPin, ClipboardCheck, Shield } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const { signIn, fbUser, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && fbUser) router.replace("/");
  }, [loading, fbUser, router]);

  const handle = async () => {
    setBusy(true);
    try {
      await signIn();
      router.replace("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-green-50 via-background to-emerald-50 p-6 dark:from-zinc-900 dark:via-background dark:to-zinc-950">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,_rgba(52,211,153,0.12),_transparent_50%)]" />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">ROTC Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ระบบจัดการนักศึกษาวิชาทหาร
          </p>
        </div>

        <div className="rounded-2xl border bg-background/80 p-5 shadow-sm backdrop-blur">
          <ul className="mb-5 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">เช็คอินด้วย GPS</div>
                <div className="text-xs text-muted-foreground">ตามช่วงเวลาและจุดที่กำหนด</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">รายการปฏิบัติหน้าที่</div>
                <div className="text-xs text-muted-foreground">ดูเปอร์เซ็นต์และผลการประเมินทันที</div>
              </div>
            </li>
          </ul>

          <Button size="lg" className="w-full" onClick={handle} disabled={busy}>
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <GoogleIcon />
                เข้าสู่ระบบด้วย Google
              </>
            )}
          </Button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            เข้าครั้งแรก ต้องมีรหัสเชิญจากครู
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          แนะนำให้เปิดใน Safari (iOS) หรือ Chrome (Android) — ไม่แนะนำใน LINE
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.06l3.01-2.34Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  );
}
