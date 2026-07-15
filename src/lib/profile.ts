import type { UserDoc } from "./types";

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
