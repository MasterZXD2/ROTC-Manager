"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RequireRole } from "@/components/RequireRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity, CheckCircle2, Users, Trash2, Settings,
  UserCog, Calendar, ClipboardList, ArrowRightLeft, ChevronLeft
} from "lucide-react";

type ActivityLogDoc = {
  id: string;
  type: string;
  userId: string;
  userName: string;
  timestamp: number;
  year?: number;
  details: Record<string, any>;
};

type Range = "today" | "week" | "month";

function rangeStart(r: Range): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(new Date());
  const todayMs = new Date(today + "T00:00:00+07:00").getTime();
  if (r === "today") return todayMs;
  if (r === "week") return todayMs - 6 * 86400_000;
  return todayMs - 29 * 86400_000;
}

function ActivityLogPage() {
  const router = useRouter();
  const [range, setRange] = useState<Range>("week");
  const [logs, setLogs] = useState<ActivityLogDoc[]>([]);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    const since = rangeStart(range);
    const q = query(
      collection(db(), "activityLogs"),
      where("timestamp", ">=", since),
      orderBy("timestamp", "desc"),
      limit(500),
    );
    return onSnapshot(q, (snap) =>
      setLogs(snap.docs.map((d) => d.data() as ActivityLogDoc)),
    );
  }, [range]);

  const grouped = useMemo(() => {
    const filtered = filterType === "all" ? logs : logs.filter((l) => l.type === filterType);
    const m = new Map<string, ActivityLogDoc[]>();
    for (const log of filtered) {
      const day = new Date(log.timestamp).toLocaleDateString("th-TH", {
        timeZone: "Asia/Bangkok",
      });
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(log);
    }
    return Array.from(m.entries());
  }, [logs, filterType]);

  const types = [
    { value: "all", label: "ทั้งหมด" },
    { value: "checkin", label: "เช็คอิน" },
    { value: "group_create", label: "สร้างกลุ่ม" },
    { value: "group_update", label: "แก้ไขกลุ่ม" },
    { value: "group_delete", label: "ลบกลุ่ม" },
    { value: "duty_session", label: "ตั้งเวร" },
    { value: "task_create", label: "สร้างงาน" },
    { value: "task_check", label: "ติ๊กงาน" },
    { value: "role_change", label: "เปลี่ยนสิทธิ์" },
    { value: "delete_user", label: "ลบ user" },
    { value: "config_change", label: "เปลี่ยนค่าตั้ง" },
  ];

  return (
    <main className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Activity Log</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["today", "week", "month"] as const).map((r) => (
          <Button
            key={r}
            variant={range === r ? "default" : "outline"}
            size="sm"
            onClick={() => setRange(r)}
          >
            {r === "today" ? "วันนี้" : r === "week" ? "7 วัน" : "30 วัน"}
          </Button>
        ))}
      </div>

      <div className="mb-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {grouped.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              ไม่มี activity ในช่วงนี้
            </CardContent>
          </Card>
        )}
        {grouped.map(([day, list]) => (
          <Card key={day}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {day} · {list.length} รายการ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {list.map((log) => (
                <LogItem key={log.id} log={log} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

function LogItem({ log }: { log: ActivityLogDoc }) {
  const time = new Date(log.timestamp).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });

  const iconMap: Record<string, any> = {
    checkin: CheckCircle2,
    group_create: Users,
    group_update: Users,
    group_delete: Trash2,
    duty_session: Calendar,
    task_create: ClipboardList,
    task_check: ClipboardList,
    task_delete: Trash2,
    role_change: UserCog,
    delete_user: Trash2,
    config_change: Settings,
    swap_request: ArrowRightLeft,
    swap_approve: ArrowRightLeft,
    swap_reject: ArrowRightLeft,
  };

  const Icon = iconMap[log.type] ?? Activity;

  const labelMap: Record<string, string> = {
    checkin: "เช็คอิน",
    group_create: "สร้างกลุ่ม",
    group_update: "แก้ไขกลุ่ม",
    group_delete: "ลบกลุ่ม",
    duty_session: "ตั้งเวร",
    task_create: "สร้างงาน",
    task_check: "ติ๊กงาน",
    task_delete: "ลบงาน",
    role_change: "เปลี่ยนสิทธิ์",
    delete_user: "ลบ user",
    config_change: "เปลี่ยนค่าตั้ง",
    swap_request: "ขอสลับเวร",
    swap_approve: "อนุมัติสลับเวร",
    swap_reject: "ปฏิเสธสลับเวร",
  };

  const label = labelMap[log.type] ?? log.type;

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{time}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          โดย {log.userName}
          {log.year && ` · ปี ${log.year}`}
        </div>
        {log.details && Object.keys(log.details).length > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            {formatDetails(log.type, log.details)}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDetails(type: string, details: Record<string, any>): string {
  switch (type) {
    case "checkin": {
      const methodLabel =
        details.method === "emergency_code" ? "รหัสฉุกเฉิน"
        : details.method === "tester" ? "Tester"
        : "GPS";
      const phaseLabel =
        details.phase === "in" ? "เช็คอิน"
        : details.phase === "out" ? "เช็คเอาท์"
        : "";
      const parts = [
        `${details.fullName} · ${details.classroom}`,
        phaseLabel && `[${phaseLabel}]`,
        `ผ่าน ${methodLabel}`,
        details.groupName,
      ].filter(Boolean);
      return parts.join(" · ");
    }
    case "group_create":
    case "group_update":
      return `กลุ่ม: ${details.groupName ?? details.name ?? ""}`;
    case "group_delete":
      return `ลบกลุ่ม: ${details.groupName ?? ""}`;
    case "duty_session":
      return `กลุ่ม ${details.groupName} · ${details.date ?? ""}`;
    case "task_create":
      return `งาน: ${details.taskName ?? details.name ?? ""}`;
    case "task_check":
      return `${details.studentName} · ${details.taskName} · ${details.done ? "ทำแล้ว" : "ยังไม่ทำ"}`;
    case "role_change":
      return `${details.targetName} → ${details.newRole}`;
    case "delete_user":
      return `ลบ: ${details.targetName}`;
    case "config_change":
      return `เปลี่ยน: ${details.field ?? ""}`;
    default:
      return JSON.stringify(details);
  }
}

export default function Page() {
  return (
    <RequireRole allow={["top_admin"]}>
      <ActivityLogPage />
    </RequireRole>
  );
}
