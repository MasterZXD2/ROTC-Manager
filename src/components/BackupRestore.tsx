"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload, Loader2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { exportAllData, importAllData } from "@/lib/actions";
import { downloadXlsx } from "@/lib/exports";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { UserDoc } from "@/lib/types";
import * as XLSX from "xlsx";

export function BackupRestore({ userDoc }: { userDoc: UserDoc }) {
  const confirm = useConfirm();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [fileData, setFileData] = useState<any>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportAllData(userDoc.uid);

      const timestamp = new Date().toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).replace(/\//g, "-").replace(/,/g, "").replace(/:/g, "").replace(/ /g, "-");

      const wb = XLSX.utils.book_new();

      // Users
      const usersSheet = XLSX.utils.json_to_sheet(data.users);
      XLSX.utils.book_append_sheet(wb, usersSheet, "Users");

      // Checkins
      const checkinsSheet = XLSX.utils.json_to_sheet(data.checkins);
      XLSX.utils.book_append_sheet(wb, checkinsSheet, "Checkins");

      // Activity Checkins
      const activityCheckinsSheet = XLSX.utils.json_to_sheet(data.activityCheckins);
      XLSX.utils.book_append_sheet(wb, activityCheckinsSheet, "ActivityCheckins");

      // Groups
      const groupsSheet = XLSX.utils.json_to_sheet(data.groups);
      XLSX.utils.book_append_sheet(wb, groupsSheet, "Groups");

      // Activities
      const activitiesSheet = XLSX.utils.json_to_sheet(data.activities);
      XLSX.utils.book_append_sheet(wb, activitiesSheet, "Activities");

      // Tasks
      const tasksSheet = XLSX.utils.json_to_sheet(data.tasks);
      XLSX.utils.book_append_sheet(wb, tasksSheet, "Tasks");

      // Activity Logs
      const logsSheet = XLSX.utils.json_to_sheet(data.activityLogs);
      XLSX.utils.book_append_sheet(wb, logsSheet, "ActivityLogs");

      XLSX.writeFile(wb, `ROTC-Backup-${timestamp}.xlsx`);
      toast.success("Export สำเร็จ!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer);

      const data = {
        users: XLSX.utils.sheet_to_json(wb.Sheets["Users"] || {}, { defval: "" }),
        checkins: XLSX.utils.sheet_to_json(wb.Sheets["Checkins"] || {}, { defval: "" }),
        activityCheckins: XLSX.utils.sheet_to_json(wb.Sheets["ActivityCheckins"] || {}, { defval: "" }),
        groups: XLSX.utils.sheet_to_json(wb.Sheets["Groups"] || {}, { defval: "" }),
        activities: XLSX.utils.sheet_to_json(wb.Sheets["Activities"] || {}, { defval: "" }),
        tasks: XLSX.utils.sheet_to_json(wb.Sheets["Tasks"] || {}, { defval: "" }),
        activityLogs: XLSX.utils.sheet_to_json(wb.Sheets["ActivityLogs"] || {}, { defval: "" }),
      };

      setFileData(data);
      setPreview({
        usersCount: data.users.length,
        checkinsCount: data.checkins.length,
        activityCheckinsCount: data.activityCheckins.length,
        groupsCount: data.groups.length,
        activitiesCount: data.activities.length,
        tasksCount: data.tasks.length,
        logsCount: data.activityLogs.length,
        sampleUsers: data.users.slice(0, 3).map((u: any) => u.fullName || u.email),
      });

      toast.success("อ่านไฟล์สำเร็จ — ตรวจสอบข้อมูลด้านล่าง");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    }
  };

  const handleImport = async () => {
    if (!fileData) return;

    const ok = await confirm({
      title: "⚠️ ยืนยัน Full Restore",
      description: `จะลบข้อมูลเดิมทั้งหมดแล้วนำเข้า:\n• ${fileData.users.length} ผู้ใช้\n• ${fileData.checkins.length} เช็คอิน\n• ${fileData.activityCheckins.length} เช็คอินกิจกรรม\n• ${fileData.groups.length} กลุ่ม\n• ${fileData.activities.length} กิจกรรม\n• ${fileData.tasks.length} งาน\n• ${fileData.activityLogs.length} ประวัติ\n\n⚠️ การกระทำนี้ย้อนกลับไม่ได้!`,
      destructive: true,
      confirmLabel: "Restore ทั้งหมด",
    });

    if (!ok) return;

    setImporting(true);
    try {
      await importAllData(userDoc.uid, fileData);
      toast.success("Import สำเร็จ! — รีเฟรชหน้าเว็บเพื่อดูข้อมูลใหม่");
      setPreview(null);
      setFileData(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import ไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Export Card */}
      <Card className="border-blue-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Download className="h-5 w-5" />
            Export Backup (สำรองข้อมูล)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            ดาวน์โหลดข้อมูลทั้งระบบเป็น Excel (รองรับการเปลี่ยน Database ในอนาคต)
          </p>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exporting} size="lg">
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                กำลัง Export...
              </>
            ) : (
              <>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export ทั้งหมด
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Import Card */}
      <Card className="border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700">
            <Upload className="h-5 w-5" />
            Import Backup (Full Restore)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            นำเข้าข้อมูลจาก backup — ⚠️ จะลบข้อมูลเดิมทั้งหมดแล้วนำเข้าใหม่
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Input
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              disabled={importing}
            />
          </div>

          {preview && (
            <Card className="border-green-300 bg-green-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-green-700">Preview — ข้อมูลที่จะนำเข้า</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>• ผู้ใช้: {preview.usersCount} คน</div>
                <div>• เช็คอิน: {preview.checkinsCount} ครั้ง</div>
                <div>• เช็คอินกิจกรรม: {preview.activityCheckinsCount} ครั้ง</div>
                <div>• กลุ่ม: {preview.groupsCount} กลุ่ม</div>
                <div>• กิจกรรม: {preview.activitiesCount} กิจกรรม</div>
                <div>• งาน: {preview.tasksCount} งาน</div>
                <div>• ประวัติ: {preview.logsCount} รายการ</div>
                {preview.sampleUsers.length > 0 && (
                  <div className="mt-2 rounded border border-green-400 bg-white p-2">
                    <div className="text-xs text-muted-foreground">ตัวอย่างผู้ใช้:</div>
                    {preview.sampleUsers.map((name: string, i: number) => (
                      <div key={i} className="text-xs">• {name}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {preview && (
            <Button onClick={handleImport} disabled={importing} variant="destructive" size="lg" className="w-full">
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  กำลัง Import...
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  ยืนยัน Full Restore
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
