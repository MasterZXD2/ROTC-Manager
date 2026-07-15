export type Role =
  | "student"
  | "admin_student"
  | "admin_teacher"
  | "admin" // legacy — treated as admin_teacher
  | "top_admin";

export interface UserDoc {
  uid: string;
  email: string;
  role: Role;
  fullName: string;
  nickname: string;
  classroom: string;
  studentId: string;
  year: number;
  isTester?: boolean;
  isTrafficRepair?: boolean;
  createdAt: number;
  updatedAt: number;
  photoURL?: string;
}

export interface TimeSlot {
  id: string;
  start: string;
  end: string;
  label?: string;
}

export interface CheckinLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface GlobalConfig {
  timeSlots: TimeSlot[];
  locations: CheckinLocation[];
  allowedRadiusMeters: number;
  maxAccuracyMeters: number;
  historyRetentionDays: number;
  /** เปิด/ปิดระบบรหัสเชิญ — ถ้าปิดนักเรียนสมัครได้เลย ไม่ต้องขอรหัส */
  requireInviteCode?: boolean;
}

export interface CheckinDoc {
  id: string;
  userId: string;
  fullName: string;
  nickname: string;
  classroom: string;
  year: number;
  studentId: string;
  timestamp: number;
  location: { lat: number; lng: number };
  accuracy: number;
  distanceMeters: number;
  mapLink: string;
  slotId: string;
  locationId: string;
  method: "gps" | "emergency_code" | "tester";
  /** รอบเช็คอิน: in = เริ่ม, out = จบ */
  phase?: "in" | "out";
  trafficRepair?: boolean;
  groupId?: string | null;
  groupName?: string | null;
  sessionId?: string | null;
}

export interface EmergencyCodeDoc {
  code: string;
  createdBy: string;
  createdByName: string;
  year: number;
  classroom?: string;
  expiresAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
}

/** รหัส login กันคนนอกเข้า — ตอน register เด็กต้องกรอก
 *  ใช้ซ้ำได้ไม่จำกัดจนกว่า expiresAt จะหมด
 *  year=null = รหัสจาก top admin ใช้ได้ทุกชั้นปี */
export interface InviteCodeDoc {
  code: string;
  createdBy: string;
  createdByName: string;
  year: number | null;
  expiresAt: number;
  createdAt: number;
}

export const DEFAULT_CONFIG: GlobalConfig = {
  timeSlots: [],
  locations: [],
  allowedRadiusMeters: 30,
  maxAccuracyMeters: 50,
  historyRetentionDays: 90,
};

/** งานนักศึกษาวิชาทหาร — แยกตามชั้นปี
 *  admin_student เพิ่ม/ลบ, ทุก admin ติ๊กได้ */
export interface TaskDoc {
  id: string;
  name: string;
  year: number;
  order: number;
  createdBy: string;
  createdByName: string;
  createdAt: number;
}

/** การติ๊กว่านักเรียนคนนี้ทำงานนี้แล้ว
 *  docId = `${taskId}_${studentUid}` — กัน duplicate */
export interface TaskCompletionDoc {
  id: string;
  taskId: string;
  taskName: string;
  studentUid: string;
  year: number;
  done: boolean;
  checkedBy: string;
  checkedByName: string;
  checkedAt: number;
}

/** เกณฑ์ผ่าน % ต่อชั้นปี — admin_teacher ตั้งค่าได้
 *  docId = `year{1-5}` */
export interface YearConfigDoc {
  year: number;
  passingPercent: number;
  updatedBy: string;
  updatedAt: number;
}

export const DEFAULT_PASSING_PERCENT = 80;

/** ข้อมูลนักเรียนที่ admin pre-create ไว้ก่อน (รอนักเรียนมา login)
 *  docId = studentId — ตอน register กรอก studentId ระบบจะ auto-fill ฟอร์ม */
export interface PendingStudentDoc {
  studentId: string;
  fullName: string;
  nickname?: string;
  classroom?: string;
  year: number;
  createdBy: string;
  createdByName: string;
  createdAt: number;
}

/** กลุ่มจราจร — ข้ามชั้นปีได้ */
export interface GroupDoc {
  id: string;
  number: number; // เลขกลุ่ม (ป้ายชื่อถาวร — ไม่เปลี่ยนเวลาสลับลำดับ)
  /** ลำดับการแสดง/เวร — เปลี่ยนได้เวลาลากสลับ (ไม่กระทบ number) */
  order?: number;
  /** member uids — denormalize ไว้ที่ doc เพื่อ query เร็ว (cap ~30 คน/กลุ่ม) */
  memberUids: string[];
  /** snapshot ชื่อสมาชิก ณ ตอนเพิ่ม — ใช้แสดงในตารางโดยไม่ต้อง join */
  members: Array<{
    uid: string;
    fullName: string;
    nickname: string;
    studentId: string;
    classroom: string;
    year: number;
  }>;
  year: number;
  note?: string;
  /** สถานะการเช็ค: null = ยังไม่เช็ค, "pass" = ผ่าน, "fail" = ไม่ผ่าน */
  checkStatus?: "pass" | "fail" | null;
  checkedBy?: string;
  checkedByName?: string;
  checkedAt?: number;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

/** บันทึกว่าวันไหนกลุ่มไหนเข้าเวร — สร้างตอน admin ติ๊กกลุ่ม
 *  doc id = `${dayKey}_${groupId}` */
export interface DutyLogDoc {
  id: string;
  groupId: string;
  groupNumber: number;
  year: number;
  dayKey: string; // YYYY-MM-DD (Asia/Bangkok)
  checkStatus: "pass" | "fail";
  /** snapshot สมาชิก ณ วันเข้าเวร */
  members: Array<{
    uid: string;
    fullName: string;
    nickname: string;
    classroom: string;
  }>;
  checkedBy: string;
  checkedByName: string;
  checkedAt: number;
}

/** ยกเว้นการขาด — admin กดให้คนที่ขาดนับเป็น "มา" แทน (รายวัน) */
export interface AttendanceExemptionDoc {
  id: string; // `${dayKey}_${studentUid}`
  studentUid: string;
  year: number;
  dayKey: string; // YYYY-MM-DD (Asia/Bangkok)
  reason?: string;
  exemptedBy: string;
  exemptedByName: string;
  exemptedAt: number;
}

/** คำขอสลับเวร — ส่งโดยนักเรียน อนุมัติโดย admin */
export interface SwapRequestDoc {
  id: string;
  fromSessionId: string;
  fromGroupId: string;
  fromGroupName: string;
  fromDate: number;
  /** เวรปลายทางที่อยากย้ายไป (optional — ถ้าไม่กำหนด = ขอลาเฉยๆ) */
  toSessionId?: string | null;
  toDate?: number | null;
  /** uid + ชื่อของคนที่ขอ */
  requestedBy: string;
  requestedByName: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: number;
  decisionNote?: string;
  createdAt: number;
}

/* ========== Activity Check-in System ========== */

/** กิจกรรม — admin สร้าง เปิด/ปิด ให้นักเรียนเช็คอิน */
export interface ActivityDoc {
  id: string;
  name: string;                    // ชื่อกิจกรรม
  year: number;                    // ชั้นปี
  type: "normal" | "external";     // ประเภท: ทั่วไป | ข้างนอก
  locations: Array<{               // จุดเช็คอิน (หลายจุดได้)
    id: string;
    name: string;
    lat: number;
    lng: number;
  }>;
  radiusMeters: number;            // ระยะเช็คอินต่อกิจกรรม
  isOpen: boolean;                 // สวิตช์ เปิด/ปิด
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

/** การเช็คอินกิจกรรม — นักเรียนเช็คอินได้ 1 ครั้งต่อกิจกรรม */
export interface ActivityCheckinDoc {
  id: string;
  activityId: string;
  activityName: string;
  userId: string;
  fullName: string;
  nickname: string;
  classroom: string;
  year: number;
  studentId: string;
  timestamp: number;
  location: { lat: number; lng: number };
  accuracy: number;
  distanceMeters: number;
  mapLink: string;
  locationId: string;              // จุดไหนที่เช็คอิน
  method: "gps" | "emergency_code";
}

/** รหัสฉุกเฉินสำหรับกิจกรรม — admin สร้างได้หลายรหัส */
export interface ActivityEmergencyCodeDoc {
  code: string;
  activityId: string;
  activityName: string;
  createdBy: string;
  createdByName: string;
  year: number;
  expiresAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
}

/** ยกเว้นการเช็คอินกิจกรรม — admin กดให้นับว่ามา */
export interface ActivityExemptionDoc {
  id: string;                      // `${activityId}_${studentUid}`
  activityId: string;
  studentUid: string;
  year: number;
  reason?: string;
  exemptedBy: string;
  exemptedByName: string;
  exemptedAt: number;
}

export interface CharacterEvaluationDoc {
  id: string; // `${year}_${studentUid}`
  studentUid: string;
  year: number;
  evaluated: boolean;
  evaluatedBy: string;
  evaluatedByName: string;
  evaluatedAt: number;
}
