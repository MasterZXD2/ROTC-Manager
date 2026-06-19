"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";
import { decideSwapRequest } from "@/lib/actions";
import { toast } from "sonner";
import type { SwapRequestDoc } from "@/lib/types";

interface Props {
  callerUid: string;
  /** ถ้าระบุ จะกรองเฉพาะคำขอของกลุ่ม (ใช้กับ admin_teacher) — ไม่ส่ง = ทุกกลุ่ม */
  filterByGroupIds?: string[];
}

export function SwapRequestsPanel({ callerUid, filterByGroupIds }: Props) {
  const [requests, setRequests] = useState<SwapRequestDoc[]>([]);
  const [tab, setTab] = useState<"pending" | "all">("pending");

  useEffect(() => {
    if (tab === "pending") {
      const q = query(
        collection(db(), "swapRequests"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc"),
        limit(100),
      );
      return onSnapshot(q, (s) =>
        setRequests(s.docs.map((d) => d.data() as SwapRequestDoc)),
      );
    } else {
      const q = query(
        collection(db(), "swapRequests"),
        orderBy("createdAt", "desc"),
        limit(100),
      );
      return onSnapshot(q, (s) =>
        setRequests(s.docs.map((d) => d.data() as SwapRequestDoc)),
      );
    }
  }, [tab]);

  const filtered = filterByGroupIds
    ? requests.filter((r) => filterByGroupIds.includes(r.fromGroupId))
    : requests;

  const pendingCount = filtered.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {pendingCount > 0 && tab === "pending" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              รออนุมัติ {pendingCount}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>
            รออนุมัติ
          </Button>
          <Button size="sm" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>
            ทั้งหมด
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {tab === "pending" ? "ไม่มีคำขอที่รออนุมัติ" : "ยังไม่มีคำขอ"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <RequestCard key={r.id} req={r} callerUid={callerUid} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ req, callerUid }: { req: SwapRequestDoc; callerUid: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(true);
    try {
      await decideSwapRequest(callerUid, req.id, decision, note);
      toast.success(decision === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const statusBadge =
    req.status === "approved" ? (
      <span className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-200">
        <CheckCircle2 className="h-3 w-3" />อนุมัติ
      </span>
    ) : req.status === "rejected" ? (
      <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-200">
        <XCircle className="h-3 w-3" />ไม่อนุมัติ
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-200">
        <Clock className="h-3 w-3" />รออนุมัติ
      </span>
    );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">
            {req.requestedByName} · {req.fromGroupName}
          </CardTitle>
          {statusBadge}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1 rounded bg-muted/40 p-2 text-xs">
          <span className="font-medium">{formatThaiDate(req.fromDate)}</span>
          {req.toDate && (
            <>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium">{formatThaiDate(req.toDate)}</span>
            </>
          )}
          {!req.toDate && <span className="text-muted-foreground">(ขอลาเฉยๆ)</span>}
        </div>
        <div>
          <span className="text-muted-foreground">เหตุผล:</span> {req.reason}
        </div>
        {req.decisionNote && (
          <div className="text-xs">
            <span className="text-muted-foreground">หมายเหตุ ({req.decidedByName}):</span> {req.decisionNote}
          </div>
        )}

        {req.status === "pending" && (
          <div className="flex flex-col gap-2 pt-1">
            <Input
              placeholder="หมายเหตุ (ไม่บังคับ)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => decide("rejected")}
                disabled={busy}
              >
                <XCircle className="mr-1 h-4 w-4" />ปฏิเสธ
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => decide("approved")}
                disabled={busy}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />อนุมัติ
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatThaiDate(ms: number): string {
  return new Date(ms).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "short", day: "numeric", month: "short",
  });
}
