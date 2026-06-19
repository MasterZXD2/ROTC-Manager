"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, X, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { exemptActivityAttendance, unexemptActivityAttendance } from "@/lib/actions";
import { downloadXlsx, todayStamp, thaiDateTime } from "@/lib/exports";
import type { ActivityDoc, ActivityCheckinDoc, ActivityExemptionDoc, UserDoc } from "@/lib/types";

export function ActivityCheckinResults({
  activity,
  callerUid,
  onClose,
}: {
  activity: ActivityDoc;
  callerUid: string;
  onClose: () => void;
}) {
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [checkins, setCheckins] = useState<ActivityCheckinDoc[]>([]);
  const [exemptions, setExemptions] = useState<ActivityExemptionDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [studentsSnap, checkinsSnap, exemptionsSnap] = await Promise.all([
        getDocs(
          query(
            collection(db(), "users"),
            where("year", "==", activity.year),
            where("role", "==", "student"),
          ),
        ),
        getDocs(
          query(
            collection(db(), "activityCheckins"),
            where("activityId", "==", activity.id),
          ),
        ),
        getDocs(
          query(
            collection(db(), "activityExemptions"),
            where("activityId", "==", activity.id),
          ),
        ),
      ]);

      setStudents(studentsSnap.docs.map((d) => d.data() as UserDoc));
      setCheckins(checkinsSnap.docs.map((d) => d.data() as ActivityCheckinDoc));
      setExemptions(exemptionsSnap.docs.map((d) => d.data() as ActivityExemptionDoc));
    };
    load();
  }, [activity.id, activity.year]);

  const handleExempt = async (studentUid: string) => {
    setBusy(studentUid);
    try {
      await exemptActivityAttendance(callerUid, {
        activityId: activity.id,
        studentUid,
        reason: "ยกเว้นโดยแอดมิน",
      });
      toast.success("ยกเว้นแล้ว");
      // Reload exemptions
      const snap = await getDocs(
        query(
          collection(db(), "activityExemptions"),
          where("activityId", "==", activity.id),
        ),
      );
      setExemptions(snap.docs.map((d) => d.data() as ActivityExemptionDoc));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ยกเว้นไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const handleUnexempt = async (studentUid: string) => {
    setBusy(studentUid);
    try {
      await unexemptActivityAttendance(callerUid, {
        activityId: activity.id,
        studentUid,
      });
      toast.success("ยกเลิกการยกเว้นแล้ว");
      // Reload exemptions
      const snap = await getDocs(
        query(
          collection(db(), "activityExemptions"),
          where("activityId", "==", activity.id),
        ),
      );
      setExemptions(snap.docs.map((d) => d.data() as ActivityExemptionDoc));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const exportExcel = () => {
    const rows = students.map((s) => {
      const checkin = checkins.find((c) => c.userId === s.uid);
      const exemption = exemptions.find((e) => e.studentUid === s.uid);
      const status = exemption ? "ยกเว้น" : checkin ? "มา" : "ขาด";
      const time = checkin ? thaiDateTime(checkin.timestamp) : "";
      return [s.studentId, s.fullName, s.nickname, s.classroom, status, time];
    });

    downloadXlsx(`กิจกรรม-${activity.name}-${todayStamp()}`, [
      {
        name: activity.name,
        headers: ["รหัส นร.", "ชื่อ-สกุล", "ชื่อเล่น", "ห้อง", "สถานะ", "เวลาเช็คอิน"],
        rows,
        colWidths: [12, 28, 14, 10, 12, 20],
      },
    ]);
    toast.success("ดาวน์โหลด Excel แล้ว");
  };

  const checkedInCount = checkins.length + exemptions.length;
  const totalCount = students.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>ผลการเช็คอิน: {activity.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                มา {checkedInCount}/{totalCount} คน
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <Download className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">ไม่มีนักเรียนในชั้นปีนี้</p>
          ) : (
            <div className="space-y-1">
              {students.map((student) => {
                const checkin = checkins.find((c) => c.userId === student.uid);
                const exemption = exemptions.find((e) => e.studentUid === student.uid);
                const isCheckedIn = !!checkin;
                const isExempted = !!exemption;

                return (
                  <div
                    key={student.uid}
                    className={`flex items-center justify-between rounded border p-2 ${
                      isCheckedIn
                        ? "border-green-200 bg-green-50"
                        : isExempted
                        ? "border-blue-200 bg-blue-50"
                        : "border-red-200 bg-red-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isCheckedIn ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : isExempted ? (
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div className="text-sm">
                        <div className="font-medium">
                          {student.fullName} ({student.nickname})
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {student.studentId} · {student.classroom}
                          {checkin && (
                            <span className="ml-2">
                              เช็คอิน{" "}
                              {new Date(checkin.timestamp).toLocaleTimeString("th-TH", {
                                timeZone: "Asia/Bangkok",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExempted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnexempt(student.uid)}
                        disabled={busy === student.uid}
                      >
                        ยกเลิกยกเว้น
                      </Button>
                    ) : !isCheckedIn ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExempt(student.uid)}
                        disabled={busy === student.uid}
                      >
                        ยกเว้น
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
