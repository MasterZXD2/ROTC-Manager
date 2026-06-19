"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, History, ClipboardCheck, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/student/checkin", label: "เช็คอิน", icon: Home },
  { href: "/student/shifts", label: "เวร", icon: Calendar },
  { href: "/student/duty", label: "งาน", icon: ClipboardCheck },
  { href: "/student/history", label: "ประวัติ", icon: History },
];

export function StudentBottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map((t) => {
          const active = path === t.href || path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-xs",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
