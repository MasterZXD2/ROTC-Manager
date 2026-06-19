"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ size = "icon", variant = "ghost" }: {
  size?: "icon" | "sm";
  variant?: "ghost" | "outline";
}) {
  const { mode, toggle } = useTheme();
  const Icon = mode === "dark" ? Moon : mode === "system" ? Monitor : Sun;
  const label =
    mode === "dark" ? "โหมดมืด"
    : mode === "system" ? "ตามระบบ"
    : "โหมดสว่าง";

  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggle}
      title={`ธีม: ${label} (กดเพื่อเปลี่ยน)`}
      aria-label={`เปลี่ยนธีม — ตอนนี้ ${label}`}
    >
      <Icon className="h-5 w-5" />
      {size !== "icon" && <span className="ml-1">{label}</span>}
    </Button>
  );
}
