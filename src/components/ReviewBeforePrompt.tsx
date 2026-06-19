"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Edit3, Download, Upload, X } from "lucide-react";
import {
  isDesktopViewport, setEditorPayload, type EditorPayload,
} from "@/lib/editor-bus";

interface Props {
  /** ข้อมูลที่จะส่งไป /editor ถ้าเลือก "ตรวจสอบ" */
  payload: Omit<EditorPayload, "createdAt">;
  /** ฟังก์ชัน "ดำเนินการต่อ" — ใช้เมื่อ user เลือกข้าม editor */
  onProceed: () => void;
  open: boolean;
  onClose: () => void;
}

/** Popup ถามก่อน export/import: "ตรวจสอบก่อนไหม?"
 *  - ขึ้นเฉพาะ desktop (mobile ไป proceed ตรงๆ ผ่าน helper อื่น)
 */
export function ReviewBeforePrompt({ payload, onProceed, open, onClose }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const goEditor = () => {
    setBusy(true);
    setEditorPayload({ ...payload, createdAt: Date.now() });
    router.push("/editor");
  };

  const proceed = () => {
    onProceed();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={!busy ? onClose : undefined}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{payload.title}</h2>
            <p className="text-sm text-muted-foreground">
              ต้องการตรวจสอบ/แก้ไข {payload.rows.length} แถวก่อน
              {payload.mode === "import" ? "นำเข้า" : "ดาวน์โหลด"}ไหม?
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={busy}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full justify-start"
            onClick={goEditor}
            disabled={busy}
          >
            <Edit3 className="mr-2 h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">ตรวจสอบ / แก้ไขก่อน</div>
              <div className="text-xs text-muted-foreground">
                เปิดในหน้า editor ขนาดใหญ่ — แก้ทุกเซลล์ได้
              </div>
            </div>
          </Button>
          <Button
            size="lg"
            className="w-full justify-start"
            onClick={proceed}
            disabled={busy}
          >
            {payload.mode === "import" ? (
              <Upload className="mr-2 h-4 w-4" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            <div className="text-left">
              <div className="font-medium">
                {payload.mode === "import" ? "นำเข้าทันที" : "ดาวน์โหลดทันที"}
              </div>
              <div className="text-xs opacity-80">ใช้ข้อมูลตามนี้ ไม่ต้องตรวจ</div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Helper hook: trigger flow review-or-proceed
 *  - desktop: เปิด popup
 *  - mobile: เรียก onProceed ตรงๆ (ไม่ขึ้น popup) */
export function useReviewFlow() {
  const [pending, setPending] = useState<{
    payload: Omit<EditorPayload, "createdAt">;
    onProceed: () => void;
  } | null>(null);

  const trigger = (payload: Omit<EditorPayload, "createdAt">, onProceed: () => void) => {
    if (isDesktopViewport()) {
      setPending({ payload, onProceed });
    } else {
      onProceed();
    }
  };

  const Element = pending ? (
    <ReviewBeforePrompt
      payload={pending.payload}
      onProceed={pending.onProceed}
      open={!!pending}
      onClose={() => setPending(null)}
    />
  ) : null;

  return { trigger, Element };
}
