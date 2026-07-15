"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, MapPin, Edit2, Trash2, ExternalLink, Code, Users } from "lucide-react";
import { toast } from "sonner";
import {
  createActivity,
  updateActivity,
  deleteActivity,
  toggleActivityOpen,
  createActivityEmergencyCode,
} from "@/lib/actions";
import type { ActivityDoc, UserDoc } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmProvider";
import { ActivityCheckinResults } from "@/components/ActivityCheckinResults";

export function AdminActivitiesTab({ userDoc }: { userDoc: UserDoc }) {
  const isTopAdmin = userDoc.role === "top_admin";
  const [selectedYear, setSelectedYear] = useState<number>(userDoc.year || 1);
  const [activities, setActivities] = useState<ActivityDoc[]>([]);
  const [showModal, setShowModal] = useState<ActivityDoc | "new" | null>(null);
  const [showResults, setShowResults] = useState<ActivityDoc | null>(null);
  const [emergencyCode, setEmergencyCode] = useState<{ code: string; activityName: string } | null>(null);
  const confirm = useConfirm();

  const activeYear = isTopAdmin ? selectedYear : userDoc.year;

  useEffect(() => {
    const q = query(
      collection(db(), "activities"),
      where("year", "==", activeYear),
      orderBy("createdAt", "desc"),
    );
    return onSnapshot(q, (snap) =>
      setActivities(snap.docs.map((d) => d.data() as ActivityDoc)),
    );
  }, [activeYear]);

  const handleToggle = async (activity: ActivityDoc) => {
    try {
      await toggleActivityOpen(userDoc.uid, activity.id, !activity.isOpen);
      toast.success(activity.isOpen ? "ปิดกิจกรรมแล้ว" : "เปิดกิจกรรมแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    }
  };

  const handleDelete = async (activity: ActivityDoc) => {
    const ok = await confirm({
      title: `ลบกิจกรรม "${activity.name}"?`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteActivity(userDoc.uid, activity.id);
      toast.success("ลบกิจกรรมแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  const handleCreateCode = async (activity: ActivityDoc) => {
    try {
      const code = await createActivityEmergencyCode(userDoc.uid, activity.id);
      setEmergencyCode({ code, activityName: activity.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างรหัสไม่สำเร็จ");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">กิจกรรม</h2>
        <div className="flex items-center gap-2">
          {isTopAdmin && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
            >
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>ปี {y}</option>
              ))}
            </select>
          )}
          <Button onClick={() => setShowModal("new")} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            เพิ่มการเช็คอิน
          </Button>
        </div>
      </div>

      {activities.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีกิจกรรม — กด "เพิ่มการเช็คอิน" เพื่อสร้าง
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => (
            <Card key={activity.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        activity.isOpen ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <CardTitle className="text-base">{activity.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCreateCode(activity)}
                      title="สร้างรหัสฉุกเฉิน"
                    >
                      <Code className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowModal(activity)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(activity)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {activity.locations.length} จุด · {activity.radiusMeters} ม.
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={activity.isOpen ? "destructive" : "default"}
                    size="sm"
                    onClick={() => handleToggle(activity)}
                  >
                    {activity.isOpen ? "ปิด" : "เปิด"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResults(activity)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    ดูผลการเช็คอิน
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <ActivityModal
          activity={showModal}
          userDoc={userDoc}
          defaultYear={activeYear}
          onClose={() => setShowModal(null)}
        />
      )}
      {showResults && (
        <ActivityCheckinResults
          activity={showResults}
          callerUid={userDoc.uid}
          onClose={() => setShowResults(null)}
        />
      )}
      {emergencyCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-center">รหัสฉุกเฉิน</CardTitle>
              <p className="text-center text-sm text-muted-foreground">
                กิจกรรม: {emergencyCode.activityName}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-amber-100 p-6 text-center">
                <div className="text-5xl font-bold tracking-widest text-amber-700">
                  {emergencyCode.code}
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                รหัสนี้หมดอายุใน 10 นาที
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setEmergencyCode(null)}
              >
                ปิด
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ActivityModal({
  activity,
  userDoc,
  defaultYear,
  onClose,
}: {
  activity: ActivityDoc | "new";
  userDoc: UserDoc;
  defaultYear: number;
  onClose: () => void;
}) {
  const isNew = activity === "new";
  const [name, setName] = useState(isNew ? "" : activity.name);
  const [year, setYear] = useState(isNew ? defaultYear : activity.year);
  const [type, setType] = useState<"normal" | "external">(isNew ? "normal" : (activity.type || "normal"));
  const [radiusMeters, setRadiusMeters] = useState(isNew ? 30 : activity.radiusMeters);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>(
    isNew ? [] : activity.locations,
  );
  const [busy, setBusy] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return toast.error("กรอกชื่อกิจกรรม");
    if (radiusMeters < 10 || radiusMeters > 500 || isNaN(radiusMeters)) {
      return toast.error("ระยะเช็คอินต้องอยู่ระหว่าง 10-500 เมตร");
    }

    setBusy(true);
    try {
      if (isNew) {
        await createActivity(userDoc.uid, { name, year, type, locations, radiusMeters });
        toast.success("สร้างกิจกรรมแล้ว");
      } else {
        await updateActivity(userDoc.uid, activity.id, { name, type, locations, radiusMeters });
        toast.success("แก้ไขกิจกรรมแล้ว");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const addLocation = () => {
    const id = Date.now().toString();
    setLocations([...locations, { id, name: "", lat: 0, lng: 0 }]);
  };

  const removeLocation = (id: string) => {
    setLocations(locations.filter((l) => l.id !== id));
  };

  const updateLocation = (id: string, patch: Partial<typeof locations[0]>) => {
    setLocations(locations.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const getCurrentPosition = (locationId: string) => {
    if (!navigator.geolocation) {
      toast.error("เบราว์เซอร์ไม่รองรับ GPS");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateLocation(locationId, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        toast.success("ดึงตำแหน่งปัจจุบันแล้ว");
        setGettingLocation(false);
      },
      (error) => {
        toast.error("ไม่สามารถดึงตำแหน่งได้: " + error.message);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <CardHeader>
          <CardTitle>{isNew ? "เพิ่มการเช็คอิน" : "แก้ไขกิจกรรม"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">ชื่อกิจกรรม</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="เช่น ตรวจแถว"
            />
          </div>

          {isNew && userDoc.role === "top_admin" && (
            <div>
              <label className="mb-1 block text-sm font-medium">ชั้นปี</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full rounded border px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>
                    ปี {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">ประเภทกิจกรรม</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "normal" | "external")}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="normal">เช็คชื่อทั่วไป</option>
              <option value="external">เช็คชื่ออื่นๆ (ภายนอก)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {type === "normal" ? "กิจกรรมปกติ" : "ไปทำงานข้างนอก"}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">ระยะเช็คอิน (เมตร)</label>
            <input
              type="number"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="w-full rounded border px-3 py-2 text-sm"
              min="10"
              max="500"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">จุดเช็คอิน</label>
              <Button variant="outline" size="sm" onClick={addLocation}>
                <Plus className="mr-1 h-3 w-3" />
                เพิ่มจุด
              </Button>
            </div>
            {locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีจุดเช็คอิน</p>
            ) : (
              <div className="space-y-2">
                {locations.map((loc) => (
                  <div key={loc.id} className="rounded border p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <input
                        type="text"
                        value={loc.name}
                        onChange={(e) => updateLocation(loc.id, { name: e.target.value })}
                        placeholder="ชื่อจุด"
                        className="flex-1 rounded border px-2 py-1 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLocation(loc.id)}
                        className="ml-2"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={loc.lat}
                        onChange={(e) => updateLocation(loc.id, { lat: Number(e.target.value) })}
                        placeholder="Latitude"
                        step="0.000001"
                        className="rounded border px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        value={loc.lng}
                        onChange={(e) => updateLocation(loc.id, { lng: Number(e.target.value) })}
                        placeholder="Longitude"
                        step="0.000001"
                        className="rounded border px-2 py-1 text-sm"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => getCurrentPosition(loc.id)}
                      disabled={gettingLocation}
                      className="mt-2 w-full"
                    >
                      <MapPin className="mr-2 h-3 w-3" />
                      {gettingLocation ? "กำลังดึงตำแหน่ง..." : "ใช้ตำแหน่งปัจจุบัน"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={busy} className="flex-1">
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              ยกเลิก
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
