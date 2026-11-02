import type { UserDoc, UserStatus } from "./types";

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  student: "นักเรียน",
  leader: "หัวหน้า",
  teacher: "ครู",
};

/** สถานะของผู้ใช้ — แยกออกจากสิทธิ์ (role) อย่างเด็ดขาด
 *  ใช้ค่า status ที่ Top Admin ตั้งไว้ ถ้ายังไม่เคยตั้งให้เดาค่าเริ่มต้นจาก role */
export function getUserStatus(user: Pick<UserDoc, "role" | "status">): UserStatus {
  if (user.status === "student" || user.status === "leader" || user.status === "teacher") {
    return user.status;
  }
  return user.role === "student" || user.role === "admin_student" ? "student" : "teacher";
}

/** ตรวจว่ามีสถานะเป็น "นักเรียน" */
export function isStudentStatus(user: Pick<UserDoc, "role" | "status">): boolean {
  return getUserStatus(user) === "student";
}

/** ตรวจว่ามีสถานะเป็น "นักเรียน" หรือ "หัวหน้า" */
export function isStudentOrLeaderStatus(user: Pick<UserDoc, "role" | "status">): boolean {
  const st = getUserStatus(user);
  return st === "student" || st === "leader";
}

export function isValidStudentYear(year: unknown): year is number {
  return typeof year === "number" && Number.isInteger(year) && year >= 1 && year <= 5;
}

export function isProfileComplete(user: Pick<UserDoc, "fullName" | "studentId" | "year"> | null | undefined): boolean {
  if (!user) return false;
  return (
    typeof user.fullName === "string" &&
    user.fullName.trim().length > 0 &&
    typeof user.studentId === "string" &&
    user.studentId.trim().length > 0 &&
    isValidStudentYear(user.year)
  );
}
