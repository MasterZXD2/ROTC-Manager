"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Users, Trash2, Edit2, Loader2, RotateCcw, UserPlus, FileText, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { GroupDoc, UserDoc } from "@/lib/types";
import {
  createGroup, deleteGroup, renameGroup, addGroupMember, removeGroupMember,
  checkGroup, uncheckGroup, resetAllGroupChecks, reorderGroups,
} from "@/lib/actions";

export function AdminGroupsTab({
  userDoc, isTeacher,
}: {
  userDoc: UserDoc;
  isTeacher: boolean;
}) {
  const isTopAdmin = userDoc.role === "top_admin";
  const [selectedYear, setSelectedYear] = useState<number>(userDoc.year || 1);
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [editModal, setEditModal] = useState<GroupDoc | "new" | null>(null);
  const [addMemberModal, setAddMemberModal] = useState<GroupDoc | null>(null);
  const [bulkTextModal, setBulkTextModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const confirm = useConfirm();

  const activeYear = isTopAdmin ? selectedYear : userDoc.year;

  useEffect(() => {
    const q = query(collection(db(), "groups"), where("year", "==", activeYear));
    return onSnapshot(q, (s) =>
      setGroups(
        s.docs
          .map((d) => d.data() as GroupDoc)
          .sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number)),
      ),
    );
  }, [activeYear]);

  useEffect(() => {
    if (!activeYear) return;
    const q = query(
      collection(db(), "users"),
      where("year", "==", activeYear),
      where("role", "==", "student"),
    );
    return onSnapshot(q, (s) =>
      setStudents(
        s.docs
          .map((d) => d.data() as UserDoc)
          .sort((a, b) =>
            (a.fullName || a.email || a.uid).localeCompare(b.fullName || b.email || b.uid, "th"),
          ),
      ),
    );
  }, [activeYear]);

  const handleCheck = async (group: GroupDoc, status: "pass" | "fail") => {
    try {
      // ถ้ากดซ้ำ status เดิม = เอาติ๊กออก
      if (group.checkStatus === status) {
        await uncheckGroup(userDoc.uid, group.id);
      } else {
        await checkGroup(userDoc.uid, group.id, status);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: "รีเซ็ตการติ๊กทั้งหมด?",
      description: "จะเคลียร์การติ๊กของทุกกลุ่ม",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await resetAllGroupChecks(userDoc.uid, activeYear);
      toast.success("รีเซ็ตแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  // หากลุ่มปัจจุบัน = กลุ่มแรกที่ยังไม่เช็ค
  const currentGroup = groups.find((g) => !g.checkStatus);
  const nextGroup = currentGroup ? groups[groups.indexOf(currentGroup) + 1] : null;

  // ลากเปลี่ยนตำแหน่งกลุ่ม (เฉพาะครู)
  const handleDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = [...groups];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(null);
    // optimistic: เปลี่ยนเฉพาะ order (ไม่แตะ number — เลขกลุ่มคงเดิม)
    setGroups(reordered.map((g, i) => ({ ...g, order: i + 1 })));
    try {
      await reorderGroups(userDoc.uid, reordered.map((g) => g.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เรียงลำดับไม่สำเร็จ");
    }
  };

  const canDrag = isTeacher;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">กลุ่มจราจร</h2>
        <div className="flex gap-2">
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
          <Button size="sm" variant="outline" onClick={handleReset} disabled={busy}>
            <RotateCcw className="mr-2 h-4 w-4" />
            รีเซ็ต
          </Button>
          {isTeacher && (
            <>
              <Button size="sm" variant="outline" onClick={() => setBulkTextModal(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Paste Text
              </Button>
              <Button size="sm" onClick={() => setEditModal("new")}>
                <Plus className="mr-2 h-4 w-4" />
                สร้างกลุ่ม
              </Button>
            </>
          )}
        </div>
      </div>

      {currentGroup && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="pt-4 text-sm">
            <div className="font-medium">
              เวรปัจจุบัน: กลุ่ม {currentGroup.number}
              {nextGroup && ` → กลุ่ม ${nextGroup.number}`}
            </div>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            ยังไม่มีกลุ่ม
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {canDrag && groups.length > 1 && (
            <p className="text-xs text-muted-foreground">ลากที่จับ ⠿ เพื่อสลับลำดับกลุ่ม</p>
          )}
          {groups.map((g, i) => (
            <div
              key={g.id}
              onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
              onDrop={canDrag ? () => handleDrop(i) : undefined}
              className={dragIndex === i ? "opacity-50" : ""}
            >
              <GroupCard
                group={g}
                isTeacher={isTeacher}
                canDrag={canDrag}
                onEdit={() => setEditModal(g)}
                onCheckPass={() => handleCheck(g, "pass")}
                onCheckFail={() => handleCheck(g, "fail")}
                onAddMember={() => setAddMemberModal(g)}
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
              />
            </div>
          ))}
        </div>
      )}

      {editModal && (
        <GroupEditModal
          group={editModal === "new" ? null : editModal}
          students={students}
          callerUid={userDoc.uid}
          year={activeYear}
          onClose={() => setEditModal(null)}
        />
      )}

      {addMemberModal && (
        <AddMemberModal
          group={addMemberModal}
          students={students}
          callerUid={userDoc.uid}
          onClose={() => setAddMemberModal(null)}
        />
      )}

      {bulkTextModal && (
        <BulkTextModal
          students={students}
          callerUid={userDoc.uid}
          year={activeYear}
          onClose={() => setBulkTextModal(false)}
        />
      )}
    </div>
  );
}

function GroupCard({
  group, isTeacher, canDrag, onEdit, onCheckPass, onCheckFail, onAddMember, onDragStart, onDragEnd,
}: {
  group: GroupDoc;
  isTeacher: boolean;
  canDrag: boolean;
  onEdit: () => void;
  onCheckPass: () => void;
  onCheckFail: () => void;
  onAddMember: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    const ok = await confirm({
      title: `ลบกลุ่ม ${group.number}?`,
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteGroup(group.createdBy, group.id);
      toast.success("ลบกลุ่มแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const bgClass = group.checkStatus === "pass"
    ? "bg-green-50 border-green-200"
    : group.checkStatus === "fail"
    ? "bg-red-50 border-red-200"
    : "";

  return (
    <Card className={bgClass}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {canDrag && (
              <span
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                className="cursor-grab text-muted-foreground active:cursor-grabbing"
                title="ลากเพื่อสลับลำดับ"
              >
                <GripVertical className="h-4 w-4" />
              </span>
            )}
            <div className="flex gap-1">
              <Button
                variant={group.checkStatus === "pass" ? "default" : "outline"}
                size="sm"
                onClick={onCheckPass}
                className="h-8 w-8 p-0"
                title="ผ่าน"
              >
                ✓
              </Button>
              <Button
                variant={group.checkStatus === "fail" ? "destructive" : "outline"}
                size="sm"
                onClick={onCheckFail}
                className="h-8 w-8 p-0"
                title="ไม่ผ่าน"
              >
                ✗
              </Button>
            </div>
            <CardTitle className="text-base">กลุ่ม {group.number}</CardTitle>
          </div>
          {isTeacher && (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={onAddMember} disabled={busy} title="เพิ่มนักเรียน">
                <UserPlus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onEdit} disabled={busy}>
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={handleDelete} disabled={busy} title="ลบกลุ่ม">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-destructive" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          {group.members.length} คน
        </div>
        {group.note && <p className="text-xs text-muted-foreground">{group.note}</p>}
        <div className="flex flex-wrap gap-1">
          {group.members.map((m) => (
            <span key={m.uid} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {m.nickname || m.fullName}
            </span>
          ))}
        </div>
        {group.checkStatus && group.checkedByName && (
          <p className={`text-xs ${group.checkStatus === "pass" ? "text-green-700" : "text-red-700"}`}>
            {group.checkStatus === "pass" ? "✓" : "✗"} {group.checkStatus === "pass" ? "ผ่าน" : "ไม่ผ่าน"} · โดย {group.checkedByName}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function GroupEditModal({
  group, students, callerUid, year, onClose,
}: {
  group: GroupDoc | null;
  students: UserDoc[];
  callerUid: string;
  year: number;
  onClose: () => void;
}) {
  const [number, setNumber] = useState(group?.number ?? 1);
  const [note, setNote] = useState(group?.note ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(group?.memberUids ?? []),
  );
  const [busy, setBusy] = useState(false);

  const toggleMember = (uid: string) => {
    const next = new Set(selectedIds);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    setSelectedIds(next);
  };

  const save = async () => {
    if (!Number.isInteger(number) || number < 1) return toast.warning("เลขกลุ่มต้อง >= 1");
    setBusy(true);
    try {
      if (!group) {
        const gid = await createGroup(callerUid, { number, year, note });
        for (const uid of selectedIds) {
          await addGroupMember(callerUid, gid, uid);
        }
        toast.success("สร้างกลุ่มแล้ว");
      } else {
        await renameGroup(callerUid, group.id, number, year, note);
        const oldSet = new Set(group.memberUids);
        const toAdd = [...selectedIds].filter((u) => !oldSet.has(u));
        const toRemove = [...oldSet].filter((u) => !selectedIds.has(u));
        for (const uid of toAdd) await addGroupMember(callerUid, group.id, uid);
        for (const uid of toRemove) await removeGroupMember(callerUid, group.id, uid);
        toast.success("แก้ไขกลุ่มแล้ว");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? "แก้ไขกลุ่ม" : "สร้างกลุ่มใหม่"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>เลขกลุ่ม</Label>
            <Input
              type="number"
              min="1"
              value={number}
              onChange={(e) => setNumber(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>หมายเหตุ (ไม่บังคับ)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>สมาชิก ({selectedIds.size} คน)</Label>
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border p-2">
              {students.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  ไม่มีนักเรียนในชั้นปี
                </p>
              ) : (
                students.map((s) => (
                  <label
                    key={s.uid}
                    className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.uid)}
                      onChange={() => toggleMember(s.uid)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-sm">
                      {s.fullName} ({s.nickname}) · {s.classroom}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "บันทึก"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddMemberModal({
  group, students, callerUid, onClose,
}: {
  group: GroupDoc;
  students: UserDoc[];
  callerUid: string;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // กรองนักเรียนที่ยังไม่อยู่ในกลุ่ม
  const availableStudents = students
    .filter((s) => !group.memberUids.includes(s.uid))
    .filter((s) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        s.fullName.toLowerCase().includes(term) ||
        s.nickname.toLowerCase().includes(term) ||
        s.classroom.toLowerCase().includes(term)
      );
    });

  const toggleMember = (uid: string) => {
    const next = new Set(selectedIds);
    next.has(uid) ? next.delete(uid) : next.add(uid);
    setSelectedIds(next);
  };

  const addMembers = async () => {
    if (selectedIds.size === 0) return toast.warning("เลือกนักเรียนอย่างน้อย 1 คน");
    setBusy(true);
    try {
      for (const uid of selectedIds) {
        await addGroupMember(callerUid, group.id, uid);
      }
      toast.success(`เพิ่ม ${selectedIds.size} คนแล้ว`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>เพิ่มนักเรียนเข้ากลุ่ม {group.number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>ค้นหานักเรียน</Label>
            <Input
              placeholder="ชื่อ, ชื่อเล่น, หรือห้อง"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            เลือกนักเรียนที่จะเพิ่ม ({selectedIds.size} คน)
          </p>
          {students.filter((s) => !group.memberUids.includes(s.uid)).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              ไม่มีนักเรียนที่สามารถเพิ่มได้ (ทุกคนอยู่ในกลุ่มแล้ว)
            </p>
          ) : (
            <>
              <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg border p-2">
                {availableStudents.map((s) => (
                  <label
                    key={s.uid}
                    className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.uid)}
                      onChange={() => toggleMember(s.uid)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-sm">
                      {s.fullName} ({s.nickname}) · {s.classroom}
                    </span>
                  </label>
                ))}
              </div>
              <Button className="w-full" onClick={addMembers} disabled={busy || selectedIds.size === 0}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `เพิ่ม ${selectedIds.size} คน`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkTextModal({
  students, callerUid, year, onClose,
}: {
  students: UserDoc[];
  callerUid: string;
  year: number;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parseAndCreate = async () => {
    if (!text.trim()) return toast.warning("กรุณาวาง text");
    setBusy(true);
    try {
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
      const blocks: { groupNum: number; names: string[] }[] = [];
      let current: { groupNum: number; names: string[] } | null = null;

      for (const line of lines) {
        const match = line.match(/^(\d+)\./);
        if (match) {
          if (current) blocks.push(current);
          current = { groupNum: parseInt(match[1]), names: [] };
          const rest = line.substring(match[0].length).trim();
          if (rest) current.names.push(rest);
        } else if (current) {
          current.names.push(line);
        }
      }
      if (current) blocks.push(current);

      if (blocks.length === 0) return toast.error("ไม่พบกลุ่ม (ต้องขึ้นต้นด้วย เลข.)");

      let created = 0, added = 0;
      for (const block of blocks) {
        const gid = await createGroup(callerUid, { number: block.groupNum, year, note: "" });
        created++;
        for (const name of block.names) {
          const namePart = name.replace(/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*/i, "").trim();
          const found = students.find((s) =>
            s.fullName.includes(namePart.split(/\s+/)[0]) ||
            s.nickname.includes(namePart.split(/\s+/)[0])
          );
          if (found) {
            await addGroupMember(callerUid, gid, found.uid);
            added++;
          }
        }
      }
      toast.success(`สร้าง ${created} กลุ่ม เพิ่ม ${added} คน`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่มกลุ่มจาก Text</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            ตัวอย่าง:<br />
            4.นายภาคภูมิ แสงสว่าง ม.6/2<br />
            &nbsp;&nbsp;นายนํ้าพุ บุญเทพ ม.6/2<br /><br />
            5. นาย ธัญชนิต บุตรศรีด้วง 6/5<br />
            &nbsp;&nbsp;นาย เมธาวิน ทองไพรวรรณ6/5
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="วาง text ที่นี่..."
            className="h-64 w-full rounded border bg-background p-2 text-sm font-mono"
          />
          <Button className="w-full" onClick={parseAndCreate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "สร้างกลุ่ม"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
