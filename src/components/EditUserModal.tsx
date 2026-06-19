"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Loader2 } from "lucide-react";
import { updateStudentProfile, type ProfilePatch } from "@/lib/actions";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { UserDoc } from "@/lib/types";

interface Props {
  callerUid: string;
  callerRole: "admin_teacher" | "admin" | "top_admin";
  user: UserDoc;
  open: boolean;
  onClose: () => void;
}

export function EditUserModal({ callerUid, callerRole, user, open, onClose }: Props) {
  const confirm = useConfirm();
  const [fullName, setFullName] = useState(user.fullName);
  const [nickname, setNickname] = useState(user.nickname);
  const [classroom, setClassroom] = useState(user.classroom);
  const [studentId, setStudentId] = useState(user.studentId);
  const [year, setYear] = useState<number>(user.year || 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setFullName(user.fullName);
    setNickname(user.nickname);
    setClassroom(user.classroom);
    setStudentId(user.studentId);
    setYear(user.year || 1);
    setErr(null);
  }, [user, open]);

  if (!open) return null;

  const submit = async () => {
    if (callerRole !== "top_admin" && year !== user.year) {
      const ok = await confirm({
        title: `เปลี่ยนชั้นปีจาก ${user.year} → ${year}?`,
        description: "หลังบันทึก คุณจะมองไม่เห็นนักเรียนคนนี้อีก (ไปอยู่ในชั้นปีอื่น)",
        destructive: true,
        confirmLabel: "ยืนยันย้าย",
      });
      if (!ok) return;
    }
    setBusy(true);
    setErr(null);
    try {
      const patch: ProfilePatch = { fullName, nickname, classroom, studentId, year };
      await updateStudentProfile(callerUid, user.uid, patch);
      toast.success("บันทึกข้อมูลแล้ว");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">แก้ไขข้อมูลนักเรียน</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-3">
          <Field label="ชื่อ-นามสกุล">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="ชื่อเล่น">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </Field>
          <Field label="ห้อง / ชั้น">
            <Input value={classroom} onChange={(e) => setClassroom(e.target.value)} />
          </Field>
          <Field label="รหัสนักเรียน">
            <Input
              value={studentId}
              inputMode="numeric"
              onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="ชั้นปี นศท.">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3"
            >
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>ปี {y}</option>
              ))}
            </select>
          </Field>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>ยกเลิก</Button>
            <Button className="flex-1" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "บันทึก"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
