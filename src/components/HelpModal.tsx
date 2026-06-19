"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpCircle, X } from "lucide-react";

export function HelpModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="mr-1 h-4 w-4" />
        ฉันเปิด GPS แล้ว แต่ยังใช้ไม่ได้
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">วิธีเปิด GPS</h2>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <section className="mb-6 space-y-2">
              <h3 className="font-semibold">iPhone (iOS)</h3>
              <ol className="list-decimal space-y-1 pl-6 text-sm">
                <li>เปิดแอป "ตั้งค่า"</li>
                <li>เลื่อนลงเลือก "Safari" (หรือ Chrome ถ้าใช้ Chrome)</li>
                <li>เลือก "ตำแหน่ง" → ตั้งเป็น "ถาม" หรือ "อนุญาต"</li>
                <li>กลับไปที่ "ตั้งค่า → ความเป็นส่วนตัวและความปลอดภัย → บริการหาที่ตั้ง"</li>
                <li>เปิดสวิตช์ "บริการหาที่ตั้ง" และตั้งให้ Safari/Chrome เป็น "ขณะใช้แอป"</li>
              </ol>
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                ถ้าเปิดเว็บใน LINE: กดเมนูจุด 3 จุดมุมขวาบน → "เปิดในเบราว์เซอร์อื่น"
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Android</h3>
              <ol className="list-decimal space-y-1 pl-6 text-sm">
                <li>เลื่อนแถบบนลงมา → กดไอคอน "ตำแหน่ง" ให้เป็นสีฟ้า</li>
                <li>เปิดแอป "ตั้งค่า" → "ตำแหน่ง" → ความแม่นยำสูง</li>
                <li>ตั้งค่า → แอป → Chrome → สิทธิ์ → ตำแหน่ง → อนุญาต</li>
                <li>รีเฟรชหน้าเว็บนี้</li>
              </ol>
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                ถ้าเปิดใน LINE: กดจุด 3 จุดมุมขวาบน → "เปิดด้วย Chrome"
              </p>
            </section>

            <p className="mt-6 rounded-md bg-blue-50 p-3 text-xs text-blue-800">
              เปิดไม่ได้จริงๆ? ขอ "รหัสฉุกเฉิน 6 หลัก" จากครูได้ที่หน้าเช็คอิน
            </p>
          </div>
        </div>
      )}
    </>
  );
}
