"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Download, Upload, RotateCcw, Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ConfirmProvider";
import { db } from "@/lib/firebase";
import { BACKUP_COLLECTIONS, COLLECTION_NAMES, KEPT_COLLECTIONS, TERM_COLLECTIONS, validateRestoreAccounts, type BackupFile } from "@/lib/backup-format";
import { downloadBackup, prepareBackup, readBackupFile, releaseMaintenance, resetSemester, restoreBackup, type MaintenanceState, type PreparedBackup } from "@/lib/backup";
import type { UserDoc } from "@/lib/types";
import { toast } from "sonner";

type PendingOperation = PreparedBackup & { kind: "reset" | "restore"; target: BackupFile | null; recovery: boolean };

export function BackupRestore({ userDoc }: { userDoc: UserDoc }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const pendingPanel = useRef<HTMLDivElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<BackupFile | null>(null);
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [verified, setVerified] = useState(false);
  const [phrase, setPhrase] = useState("");

  useEffect(() => onSnapshot(doc(db(), "config", "maintenance"), (snapshot) => {
    setMaintenance((snapshot.data() as MaintenanceState | undefined) ?? null);
    setLoaded(true);
  }, () => setError("อ่านสถานะระบบไม่ได้ กรุณารีเฟรชและตรวจการเชื่อมต่อ")), []);

  useEffect(() => { if (pending) pendingPanel.current?.focus(); }, [pending]);
  useEffect(() => { if (error) errorPanel.current?.focus(); }, [error]);
  useEffect(() => {
    if (!busy && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, pending]);

  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try { await work(); } catch (e) {
      const message = e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ";
      setError(message);
      toast.error(message);
    } finally {
      running.current = false;
      setBusy(false);
      setStatus("");
    }
  }

  function begin(kind: "backup" | "reset" | "restore", previousOperationId?: string) {
    void run(async () => {
      const prepared = await prepareBackup(userDoc.uid, kind, setStatus, previousOperationId);
      const { safety, operationId } = prepared;
      if (kind === "backup") {
        downloadBackup(safety);
        toast.success("เตรียมไฟล์สำรองแล้ว กรุณาตรวจไฟล์ในโฟลเดอร์ดาวน์โหลด");
      } else {
        if (kind === "restore") {
          try {
            if (!target) throw new Error("กรุณาเลือกไฟล์ที่จะกู้คืนก่อน");
            validateRestoreAccounts(target, safety.collections.users, userDoc.uid);
          } catch (e) {
            if (!previousOperationId) await releaseMaintenance(userDoc.uid, operationId);
            throw e;
          }
        }
        setPending({ ...prepared, kind, target: kind === "restore" ? target : null, recovery: Boolean(previousOperationId) });
        setVerified(false);
        setPhrase("");
        downloadBackup(safety);
      }
    });
  }

  function selectFile(file: File | undefined, verify: boolean) {
    if (verify) setVerified(false);
    else setTarget(null);
    if (!file) return;
    void run(async () => {
      const backup = await readBackupFile(await file.text());
      if (verify) {
        if (backup.checksum !== pending?.safety.checksum) throw new Error("ไฟล์นี้ไม่ใช่ไฟล์สำรองก่อนดำเนินการที่เพิ่งดาวน์โหลด กรุณาเลือกไฟล์ให้ตรงกัน");
        setVerified(true);
      } else {
        setTarget(backup);
      }
    });
  }

  const expectedPhrase = pending?.kind === "reset" ? "เริ่มเทอมใหม่" : "กู้คืนข้อมูล";
  const disabled = busy || !loaded || Boolean(maintenance?.active) || Boolean(pending);

  async function execute() {
    if (!pending || !verified || phrase !== expectedPhrase || busy) return;
    const operation = pending;
    const ok = await confirm({
      title: operation.kind === "reset" ? "เริ่มเทอมใหม่ตามรายการนี้?" : "แทนที่ข้อมูลด้วยไฟล์สำรอง?",
      description: operation.kind === "reset"
        ? "ล้างเฉพาะข้อมูลประจำเทอม เก็บบัญชี รายชื่อ กลุ่มเวร และการตั้งค่าไว้ คุณได้ตรวจไฟล์สำรองก่อนล้างแล้ว"
        : "ข้อมูลปัจจุบันจะถูกแทนที่ด้วยข้อมูลในไฟล์ที่เลือก รวมบัญชีและการตั้งค่า คุณได้ตรวจไฟล์สำรองก่อนกู้คืนแล้ว",
      destructive: true,
      confirmLabel: expectedPhrase,
    });
    if (!ok) return;
    void run(async () => {
      // A failed multi-batch operation must be recovered from the saved file, not rerun blindly.
      setPending(null);
      setVerified(false);
      if (operation.kind === "reset") await resetSemester(userDoc.uid, operation, setStatus);
      else await restoreBackup(userDoc.uid, operation.target!, operation, setStatus);
      setPhrase("");
      setTarget(null);
      toast.success(operation.kind === "reset" ? "เริ่มเทอมใหม่แล้ว บัญชีและรายชื่อนักเรียนยังอยู่ครบ" : "กู้คืนและตรวจเทียบข้อมูลกับไฟล์สำรองแล้ว");
    });
  }

  async function cancel() {
    if (pending?.recovery) {
      setPending(null);
      setVerified(false);
      setPhrase("");
      return;
    }
    const ok = await confirm({
      title: pending ? "ยกเลิกขั้นตอนและเปิดรับข้อมูล?" : "เปิดรับข้อมูลอีกครั้ง?",
      description: pending && !pending.recovery ? "ยังไม่มีการล้างหรือกู้คืนข้อมูล ระบบจะกลับมาบันทึกข้อมูลได้ตามปกติ"
        : "เปิดรับข้อมูลเฉพาะเมื่อตรวจว่าข้อมูลครบถ้วนแล้ว และปิดหน้างานเดิมทุกแท็บ หากงานก่อนหน้าล้มเหลว ให้กู้คืนจากไฟล์สำรองก่อน",
      confirmLabel: "เปิดรับข้อมูล",
    });
    if (ok) void run(async () => {
      await releaseMaintenance(userDoc.uid, pending?.operationId ?? maintenance!.operationId);
      setPending(null);
      setVerified(false);
      setPhrase("");
    });
  }

  return (
    <section className="min-w-0 space-y-5" aria-label="สำรองและจัดการข้อมูล">
      <p className="text-sm text-muted-foreground">สำรองข้อมูลก่อนเปลี่ยนเทอม หรือกู้คืนข้อมูลจากไฟล์ที่เคยเก็บไว้ เฉพาะผู้ดูแลสูงสุดเท่านั้น</p>
      {error && <div ref={errorPanel} tabIndex={-1} role="alert" className="break-words rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
      {busy && <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border p-4 text-sm"><Loader2 className="h-4 w-4 shrink-0 animate-spin" />{status || "กำลังตรวจไฟล์..."} กรุณาอย่าปิดหน้านี้</p>}
      {maintenance?.active && !pending && !busy && (
        <Card className="border-amber-400">
          <CardHeader><CardTitle>ระบบกำลังพักรับข้อมูล</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>มีขั้นตอนจัดการข้อมูลค้างอยู่ หากเคยเริ่มล้างหรือกู้คืนแล้ว ข้อมูลอาจเปลี่ยนไปบางส่วน ให้ใช้ไฟล์สำรองก่อนดำเนินการเพื่อกู้คืน</p>
            <p>ก่อนรับช่วงหรือเปิดรับข้อมูล ให้ปิดหน้างานเดิมทุกแท็บและตรวจสอบกับผู้ดูแลที่เริ่มงาน</p>
            <Label htmlFor="recover-backup" className="block">เลือกไฟล์สำรองที่ต้องการกู้กลับ (.json)</Label>
            <Input id="recover-backup" type="file" accept=".json,application/json" onChange={(e) => { selectFile(e.target.files?.[0], false); e.target.value = ""; }} />
            {target && <><BackupSummary backup={target} /><Button className="h-auto min-h-11 whitespace-normal" onClick={async () => {
              const ok = await confirm({ title: "รับช่วงกู้คืนจากงานที่ค้าง?", description: "ยืนยันว่าปิดหน้างานเดิมแล้ว ระบบจะคงการพักรับข้อมูล สำรองสภาพปัจจุบัน และให้ตรวจไฟล์ก่อนกู้คืน", confirmLabel: "รับช่วงกู้คืน" });
              if (ok) begin("restore", maintenance.operationId);
            }}>เตรียมกู้คืนโดยยังพักรับข้อมูล</Button></>}
            <Button variant="outline" onClick={() => void cancel()}>ตรวจแล้ว เปิดรับข้อมูลอีกครั้ง</Button>
          </CardContent>
        </Card>
      )}
      {pending && (
        <div ref={pendingPanel} tabIndex={-1} role="region" aria-label="ตรวจสอบก่อนยืนยัน"><Card className="border-primary">
          <CardHeader>
            <CardTitle>{pending.kind === "reset" ? "เตรียมเริ่มเทอมใหม่" : "เตรียมกู้คืนข้อมูล"}</CardTitle>
            <p className="text-sm text-muted-foreground">{pending.recovery ? "ยังพักรับข้อมูลอยู่ ขั้นตอนนี้จะกู้กลับจากไฟล์ที่เลือก" : "พักการบันทึกข้อมูลแล้ว ยังไม่มีการล้างหรือแทนที่ข้อมูล"}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="font-medium">1. เก็บและตรวจไฟล์สำรองข้อมูลปัจจุบัน</p>
              <p className="text-sm text-muted-foreground">ระบบเริ่มดาวน์โหลดไฟล์แล้ว เลือกไฟล์นั้นกลับมาตรวจ เพื่อยืนยันว่าคุณมีสำเนาที่เปิดอ่านได้ก่อนดำเนินการ</p>
              <Button variant="outline" disabled={busy} onClick={() => downloadBackup(pending.safety)}><Download className="h-4 w-4" />ดาวน์โหลดไฟล์อีกครั้ง</Button>
              <Label htmlFor="verify-safety-backup" className="block">เลือกไฟล์สำรองที่เพิ่งดาวน์โหลด</Label>
              <Input id="verify-safety-backup" type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { selectFile(e.target.files?.[0], true); e.target.value = ""; }} />
              {verified && <p role="status" className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />ตรวจไฟล์แล้ว ตรงกับข้อมูลก่อนดำเนินการ</p>}
            </div>
            <div className="space-y-3">
              <p className="font-medium">2. ตรวจรายการ{pending.kind === "reset" ? "ที่จะล้างและเก็บไว้" : "ที่จะกู้คืน"}</p>
              {pending.kind === "reset" && <p className="rounded-lg bg-primary/5 p-3 text-sm">เก็บบัญชี รายชื่อนักเรียน กลุ่มและสมาชิกเวร การตั้งค่าระบบ เกณฑ์ผ่าน และบัญชีที่ถูกระงับไว้ โดยคืนสถานะกลุ่มเวรเป็น “ยังไม่ตรวจ”</p>}
              <BackupSummary backup={pending.target ?? pending.safety} reset={pending.kind === "reset"} />
              {pending.kind === "restore" && <p className="text-sm text-destructive">ข้อมูลที่ไม่อยู่ในไฟล์จะถูกลบ บัญชี Firebase สำหรับเข้าสู่ระบบไม่ได้ถูกสร้างหรือลบโดยการกู้คืนนี้</p>}
            </div>
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="data-confirmation">3. พิมพ์ “{expectedPhrase}” เพื่อยืนยัน</Label>
              <Input id="data-confirmation" autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} disabled={busy} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="destructive" className="h-auto min-h-11 whitespace-normal" disabled={busy || !verified || phrase !== expectedPhrase || !maintenance?.active} onClick={() => void execute()}>{expectedPhrase}</Button>
                <Button variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={() => void cancel()}>{pending.recovery ? "ยกเลิกและคงการพักรับข้อมูล" : "ยกเลิกและเปิดรับข้อมูล"}</Button>
              </div>
            </div>
          </CardContent>
        </Card></div>
      )}
      {!pending && !maintenance?.active && <><Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />สำรองข้อมูลทั้งหมด</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">ดาวน์โหลดไฟล์ JSON ครบทั้งรายชื่อ ประวัติ ผลประเมิน และการตั้งค่า เก็บไฟล์ไว้ในที่ปลอดภัยเพราะมีข้อมูลส่วนบุคคล ระบบจะพักรับข้อมูลชั่วคราวระหว่างอ่านข้อมูล</p>
          <Button disabled={disabled} onClick={() => begin("backup")}><Download className="h-4 w-4" />ดาวน์โหลดไฟล์สำรอง</Button>
          <p className="text-xs text-muted-foreground">ไฟล์นี้สำรองข้อมูลในระบบ ไม่รวมบัญชีเข้าสู่ระบบ Firebase Authentication</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5" />เริ่มเทอมใหม่</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">เก็บบัญชีและรายชื่อนักเรียนไว้ ล้างประวัติจราจร กิจกรรม งานและผลทำงาน ผลประเมิน ข้อยกเว้น คำขอสลับเวร และรหัสเดิม ระบบจะแสดงรายการทั้งหมดและให้ตรวจไฟล์สำรองก่อนล้าง</p>
          <Button variant="outline" disabled={disabled} onClick={() => begin("reset")}>เตรียมเริ่มเทอมใหม่</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />กู้คืนจากไฟล์สำรอง</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">เลือกไฟล์เพื่อดูข้อมูลก่อน กู้คืนจะย้อนข้อมูลทั้งระบบกลับไปตามไฟล์ จึงต้องสำรองข้อมูลปัจจุบันอีกครั้งก่อนยืนยัน</p>
          <Label htmlFor="restore-backup" className="block">ไฟล์สำรองที่จะกู้คืน (.json)</Label>
          <Input id="restore-backup" type="file" accept=".json,application/json" disabled={disabled} onChange={(e) => { selectFile(e.target.files?.[0], false); e.target.value = ""; }} />
          <p className="text-xs text-muted-foreground">ไฟล์ Excel สำรองรุ่นเก่ามีข้อมูลไม่ครบ จึงใช้แทนไฟล์กู้คืนทั้งระบบไม่ได้</p>
          {target && <>
            <BackupSummary backup={target} />
            <Button variant="outline" disabled={disabled} onClick={() => begin("restore")}>ตรวจแล้ว เตรียมกู้คืน</Button>
          </>}
        </CardContent>
      </Card>
      </>}
    </section>
  );
}

function BackupSummary({ backup, reset = false }: { backup: BackupFile; reset?: boolean }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm text-muted-foreground">สำรองเมื่อ {new Date(backup.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">จำนวนข้อมูล{reset ? "ที่จะล้างและเก็บไว้" : "ในไฟล์สำรอง"}</caption>
          <thead className="bg-muted/50"><tr><th className="p-2">ข้อมูล</th><th className="p-2 text-right">รายการ</th>{reset && <th className="p-2">ผลลัพธ์</th>}</tr></thead>
          <tbody>{(reset ? [...KEPT_COLLECTIONS, ...TERM_COLLECTIONS] : COLLECTION_NAMES).map((name) => (
            <tr key={name} className="border-t"><td className="p-2">{BACKUP_COLLECTIONS[name]}</td><td className="p-2 text-right tabular-nums">{backup.collections[name].length.toLocaleString("th-TH")}</td>{reset && <td className={`whitespace-nowrap p-2 ${KEPT_COLLECTIONS.includes(name) ? "text-primary" : "text-destructive"}`}>{KEPT_COLLECTIONS.includes(name) ? "เก็บไว้" : "ล้าง"}</td>}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
