"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, KeyRound, Sparkles } from "lucide-react";
import { redeemInviteCode, lookupPendingStudent } from "@/lib/actions";
import { isProfileComplete } from "@/lib/profile";
import type { GlobalConfig } from "@/lib/types";
import { toast } from "sonner";

const schema = z.object({
  fullName: z.string().min(2, "กรุณากรอกชื่อ-นามสกุล"),
  nickname: z.string().min(1, "กรุณากรอกชื่อเล่น"),
  classroom: z.string().min(1, "กรุณากรอกห้อง/ชั้น"),
  studentId: z.string().regex(/^\d{4,12}$/, "รหัสนักเรียนเป็นตัวเลข 4-12 หลัก"),
  year: z.coerce.number().int().min(1).max(5),
});
type Form = z.infer<typeof schema>;

type Step = "code" | "form";

export default function RegisterPage() {
  const { fbUser, userDoc, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [codeYear, setCodeYear] = useState<number | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [requireCode, setRequireCode] = useState<boolean>(true);

  // โหลด config เพื่อเช็คว่าต้องใช้รหัสหรือไม่
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db(), "config/global"));
        const cfg = snap.data() as GlobalConfig | undefined;
        const required = cfg?.requireInviteCode !== false;
        setRequireCode(required);
        if (!required) setStep("form");
      } catch {
        // default เปิด
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!fbUser) return router.replace("/login");
    if (userDoc?.role && userDoc.role !== "student") {
      const dest =
        userDoc.role === "top_admin" ? "/top-admin"
        : userDoc.role === "admin_teacher" ? "/admin-teacher"
        : userDoc.role === "admin_student" ? "/admin-student"
        : "/admin";
      router.replace(dest);
      return;
    }
    if (isProfileComplete(userDoc)) {
      router.replace("/student/checkin");
    }
  }, [loading, fbUser, userDoc, router]);

  const {
    register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch,
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const watchStudentId = watch("studentId");
  const [autoFilled, setAutoFilled] = useState(false);

  // ลองหาในรายชื่อที่ admin pre-create ไว้ → auto-fill
  useEffect(() => {
    if (step !== "form") return;
    if (!/^\d{4,12}$/.test(watchStudentId ?? "")) {
      setAutoFilled(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await lookupPendingStudent(watchStudentId);
        if (cancelled || !p) return;
        if (codeYear && p.year !== codeYear) return;
        setValue("fullName", p.fullName, { shouldValidate: true });
        if (p.nickname) setValue("nickname", p.nickname, { shouldValidate: true });
        if (p.classroom) setValue("classroom", p.classroom, { shouldValidate: true });
        if (!codeYear) setValue("year", p.year, { shouldValidate: true });
        setAutoFilled(true);
        toast.success("กรอกข้อมูลให้อัตโนมัติแล้ว");
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [watchStudentId, codeYear, step, setValue]);

  const submitCode = async () => {
    setCodeErr(null);
    if (!/^\d{6}$/.test(code)) {
      setCodeErr("รหัสต้องเป็นตัวเลข 6 หลัก");
      return;
    }
    if (!fbUser) return;
    setRedeeming(true);
    try {
      const r = await redeemInviteCode(fbUser.uid, code);
      setCodeYear(r.year);
      if (r.year) setValue("year", r.year);
      setStep("form");
    } catch (e) {
      setCodeErr(e instanceof Error ? e.message : "ใช้รหัสไม่สำเร็จ");
    } finally {
      setRedeeming(false);
    }
  };

  const onSubmit = handleSubmit(async (data) => {
    setSubmitErr(null);
    if (!fbUser) return;
    try {
      await updateDoc(doc(db(), "users", fbUser.uid), {
        ...data,
        year: codeYear ?? data.year,
        updatedAt: Date.now(),
      });
      router.replace("/student/checkin");
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  });

  if (loading || !fbUser) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === "code") {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-1 text-2xl font-bold">กรอกรหัสเชิญ</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          ขอรหัส 6 หลักจากครูประจำชั้นปีของคุณ (ใช้ได้ภายใน 5 นาที)
        </p>
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> รหัส 6 หลัก
          </Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            className="text-center text-2xl tracking-widest"
          />
          {codeErr && <p className="text-sm text-destructive">{codeErr}</p>}
          <Button size="lg" className="w-full" onClick={submitCode} disabled={redeeming}>
            {redeeming ? <Loader2 className="h-5 w-5 animate-spin" /> : "ยืนยันรหัส"}
          </Button>
          {!requireCode && (
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => setStep("form")}
            >
              ข้ามไป (ไม่ใช้รหัส)
            </Button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-1 text-2xl font-bold">กรอกข้อมูลเพิ่มเติม</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        กรอกครั้งเดียวเพื่อเริ่มใช้งาน
        {codeYear && <> · ระบบกำหนดให้คุณอยู่ปี <b>{codeYear}</b></>}
      </p>

      {autoFilled && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          <Sparkles className="h-4 w-4" />
          ครูเพิ่มข้อมูลคุณไว้แล้ว — ตรวจสอบความถูกต้องก่อนกดบันทึก
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="ชื่อ-นามสกุล" error={errors.fullName?.message}>
          <Input {...register("fullName")} placeholder="เช่น สมชาย ใจดี" />
        </Field>
        <Field label="ชื่อเล่น" error={errors.nickname?.message}>
          <Input {...register("nickname")} placeholder="เช่น ชาย" />
        </Field>
        <Field label="ห้อง / ชั้น" error={errors.classroom?.message}>
          <Input {...register("classroom")} placeholder="เช่น 4/2" />
        </Field>
        <Field label="รหัสนักเรียน" error={errors.studentId?.message}>
          <Input {...register("studentId")} inputMode="numeric" placeholder="เช่น 12345" />
        </Field>
        <Field label="ชั้นปี นศท." error={errors.year?.message}>
          <select
            {...register("year")}
            disabled={!!codeYear}
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 disabled:opacity-60"
          >
            <option value="">เลือกชั้นปี</option>
            <option value="1">ปี 1</option>
            <option value="2">ปี 2</option>
            <option value="3">ปี 3</option>
            <option value="4">ปี 4</option>
            <option value="5">ปี 5</option>
          </select>
        </Field>

        {submitErr && <p className="text-sm text-destructive">{submitErr}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "บันทึก"}
        </Button>
      </form>
    </main>
  );
}

function Field({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
