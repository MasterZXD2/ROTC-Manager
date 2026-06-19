"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";

const PinMap = dynamic(() => import("@/components/PinMap").then((m) => m.PinMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

function MapInner() {
  const params = useSearchParams();
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isFinite(lat) || !isFinite(lng)) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-muted-foreground">ลิงก์ไม่ถูกต้อง</p>
        <Link href="/" className="mt-3 inline-block text-primary underline">กลับหน้าหลัก</Link>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b bg-background p-3">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />กลับ
          </Button>
        </Link>
        <div className="text-xs text-muted-foreground">
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </div>
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
        >
          <Button variant="outline" size="sm">
            <ExternalLink className="mr-1 h-4 w-4" />Google Maps
          </Button>
        </a>
      </header>
      <div className="min-h-0 flex-1">
        {mounted && <PinMap lat={lat} lng={lng} />}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">กำลังโหลด...</div>}>
      <MapInner />
    </Suspense>
  );
}
