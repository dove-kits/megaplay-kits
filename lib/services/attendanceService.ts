// lib/services/attendanceService.ts
import {
  collection,
  doc,
  getDocs,
  getCountFromServer,
  query,
  where,
  serverTimestamp,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';

import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';

export interface AttendanceRecord {
  attendanceId?: string;
  sessionId: string;
  sessionName: string;
  date: string;
  sessionNumber: number;
  regno: string;
  studentName: string;
  studentEmail?: string;
  email?: string;
  department?: string;
  hostel?: string;
  roomNumber?: string;
  registeredCommittee: string;
  registeredCategory: 'normal' | 'scholarship';
  markedCategory: 'od' | 'scholarship' | 'lab';
  markedBy: string;
  markedAt: any;
  year?: string;
}

export interface StudentValidationResult {
  valid: boolean;
  student?: {
    regno: string;
    name: string;
    email: string;
    committee: string;
    category: 'normal' | 'scholarship';
  };
  error?: string;
}

const BATCH_LIMIT = 450;

/**
 * Duplicate protection when marking attendance.
 *
 * Attendance docs now use a DETERMINISTIC id: `${sessionId}_${REGNO}`.
 * That makes "one mark per student per session" enforceable without a query.
 *
 *  true  (default, safe): read the doc by id before writing.
 *        Cost per mark = 2 reads (existing-check + student) + 1 write.
 *        Works with ANY Firestore rules.
 *
 *  false (cheapest):      skip the existing-check and just write.
 *        Cost per mark = 1 read (student) + 1 write.
 *        ONLY set this to false after your Firestore rules make the
 *        attendance collection create-only (no `update`), otherwise a repeat
 *        scan would silently OVERWRITE the earlier record.
 *        Example rule:
 *          match /years/{y}/attendance/{id} {
 *            allow create: if <isCoordinatorOrFaculty>;
 *            allow delete: if <isCoordinatorOrFaculty>;
 *            allow read:   if <staff> || resource.data.regno == <own regno>;
 *          }
 *        A repeat mark then fails with `permission-denied`, handled below.
 *
 * Note: records created BEFORE this change have auto-generated ids, so a
 * duplicate against those old records is not detected. Deploy between days.
 */
const CHECK_EXISTING_BEFORE_WRITE = true;

// ---------- helpers ----------

/** Deterministic attendance doc id: one doc per student per session. */
export const attendanceDocId = (sessionId: string, regno: string): string =>
  `${sessionId}_${regno.trim().toUpperCase()}`;

const mapAttendanceDoc = (d: QueryDocumentSnapshot<DocumentData>): AttendanceRecord => {
  const data = d.data();
  return {
    attendanceId: d.id,
    sessionId: data.sessionId || '',
    sessionName: data.sessionName || '',
    date: data.date || '',
    sessionNumber: data.sessionNumber || 0,
    regno: data.regno || '',
    studentName: data.studentName || '',
    studentEmail: data.email || '',
    email: data.email || '',
    department: data.department || '',
    hostel: data.hostel || '',
    roomNumber: data.roomNumber || '',
    registeredCommittee: data.registeredCommittee || '',
    registeredCategory: data.registeredCategory || 'normal',
    markedCategory: data.markedCategory || 'od',
    markedBy: data.markedBy || '',
    markedAt: data.markedAt || null,
  };
};

const toMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  return 0;
};

// ---------- API ----------

/**
 * Validate student (must exist and be approved) - 1 read.
 */
export const validateStudent = async (
  regno: string,
  year: string
): Promise<StudentValidationResult> => {
  try {
    const studentsCol = getYearCollectionName('students', year);
    const studentSnap = await getDoc(doc(db, studentsCol, regno.toUpperCase()));

    if (!studentSnap.exists()) {
      return { valid: false, error: 'Student not found in database' };
    }

    const student = studentSnap.data();

    if (student.status !== 'approved') {
      return { valid: false, error: 'Student not approved yet' };
    }

    return {
      valid: true,
      student: {
        regno: student.regno,
        name: student.name,
        email: student.email,
        committee: student.committee,
        category: student.category,
      },
    };
  } catch (error) {
    console.error('Error validating student:', error);
    return { valid: false, error: 'Error validating student' };
  }
};

/**
 * Check if student already marked in session (1 read).
 * Looks up the deterministic id first; falls back to the old query so
 * records created before the id change are still found.
 */
export const checkDuplicateAttendance = async (
  year: string,
  sessionId: string,
  regno: string
): Promise<boolean> => {
  try {
    const colName = getYearCollectionName('attendance', year);

    const byId = await getDoc(doc(db, colName, attendanceDocId(sessionId, regno)));
    if (byId.exists()) return true;

    const q = query(
      collection(db, colName),
      where('sessionId', '==', sessionId),
      where('regno', '==', regno.toUpperCase())
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return false;
  }
};

/**
 * Mark attendance.
 *
 * Cost: 1 write, plus
 *   - CHECK_EXISTING_BEFORE_WRITE = true : 2 reads (existing-check + student)
 *   - CHECK_EXISTING_BEFORE_WRITE = false: 1 read  (student)
 *
 * Pass 'auto' to use the student's registered category (scholarship ->
 * scholarship, otherwise od), so the calling page does not need to read the
 * student itself.
 */
export async function markAttendance(
  year: string,
  sessionId: string,
  sessionName: string,
  sessionDate: string,
  sessionNumber: number,
  regno: string,
  markedCategory: 'od' | 'scholarship' | 'lab' | 'auto',
  markedBy: string
): Promise<{
  success: boolean;
  record?: AttendanceRecord;
  error?: string;
}> {
  try {
    if (!sessionDate || sessionDate.trim() === '') {
      return { success: false, error: 'Session date is required' };
    }

    const regnoUpper = regno.trim().toUpperCase();
    const attendanceCol = getYearCollectionName('attendance', year);
    const attendanceId = attendanceDocId(sessionId, regnoUpper);
    const attendanceRef = doc(db, attendanceCol, attendanceId);

    // 1. Already marked in THIS session (any category)?
    if (CHECK_EXISTING_BEFORE_WRITE) {
      const existingSnap = await getDoc(attendanceRef);

      if (existingSnap.exists()) {
        const existingCategory =
          (existingSnap.data() as AttendanceRecord).markedCategory || 'od';

        if (markedCategory === 'auto' || existingCategory === markedCategory) {
          return {
            success: false,
            error: `Student already marked in ${existingCategory.toUpperCase()} for this session`,
          };
        }

        return {
          success: false,
          error: `Student already marked in ${existingCategory.toUpperCase()} for this session. Cannot mark in ${markedCategory.toUpperCase()}. Delete the existing entry first.`,
        };
      }
    }

    // 2. Student must exist and be approved
    const studentsCol = getYearCollectionName('students', year);
    const studentSnap = await getDoc(doc(db, studentsCol, regnoUpper));

    if (!studentSnap.exists()) {
      return { success: false, error: 'Student not found in database' };
    }

    const student = studentSnap.data();

    if (student.status !== 'approved') {
      return { success: false, error: 'Student registration is not approved' };
    }

    // Resolve the category
    const finalCategory: 'od' | 'scholarship' | 'lab' =
      markedCategory === 'auto'
        ? student.category === 'scholarship'
          ? 'scholarship'
          : 'od'
        : markedCategory;

    // 3. Save (fallbacks because Firestore rejects undefined values)
    const attendanceData = {
      sessionId,
      sessionName,
      date: sessionDate,
      sessionNumber,
      regno: regnoUpper,
      studentName: student.name || '',
      email: student.email || '',
      department: student.department || '',
      hostel: student.hostel || '',
      roomNumber: student.roomNumber || '',
      registeredCommittee: student.committee || '',
      registeredCategory: student.category || 'normal',
      markedCategory: finalCategory,
      markedBy,
      markedAt: serverTimestamp(),
    };

    await setDoc(attendanceRef, attendanceData);

    return {
      success: true,
      record: {
        ...attendanceData,
        attendanceId,
        markedAt: Timestamp.now(),
      } as AttendanceRecord,
    };
  } catch (error: any) {
    // With create-only rules, a repeat mark is rejected by Firestore.
    if (!CHECK_EXISTING_BEFORE_WRITE && error?.code === 'permission-denied') {
      return { success: false, error: 'Student already marked for this session' };
    }
    console.error('❌ Error marking attendance:', error);
    return { success: false, error: 'Failed to mark attendance' };
  }
}

/**
 * Get attendance for a session (1 read per returned record).
 * With `categories`, only those records are read (one query per category)
 * instead of reading every record of the session and filtering in JS.
 */
export const getSessionAttendance = async (
  year: string,
  sessionId: string,
  categories?: Array<'od' | 'scholarship' | 'lab'>
): Promise<AttendanceRecord[]> => {
  try {
    const colName = getYearCollectionName('attendance', year);
    const base = collection(db, colName);

    const queries =
      categories && categories.length > 0
        ? categories.map((c) =>
            query(base, where('sessionId', '==', sessionId), where('markedCategory', '==', c))
          )
        : [query(base, where('sessionId', '==', sessionId))];

    const snaps = await Promise.all(queries.map((q) => getDocs(q)));
    const records = ([] as AttendanceRecord[]).concat(
      ...snaps.map((s) => s.docs.map(mapAttendanceDoc))
    );

    // Most recently marked first
    records.sort((a, b) => toMillis(b.markedAt) - toMillis(a.markedAt));
    return records;
  } catch (error) {
    console.error('Error getting session attendance:', error);
    return [];
  }
};

/**
 * Get ONE student's attendance history (1 read per record of that student).
 * Use this instead of getAllAttendance() + filter.
 */
export const getStudentAttendance = async (
  year: string,
  regno: string,
  startDate?: string,
  endDate?: string
): Promise<AttendanceRecord[]> => {
  try {
    const colName = getYearCollectionName('attendance', year);
    const snap = await getDocs(
      query(collection(db, colName), where('regno', '==', regno.toUpperCase()))
    );

    let records = snap.docs.map(mapAttendanceDoc);

    if (startDate) records = records.filter((r) => r.date && r.date >= startDate);
    if (endDate) records = records.filter((r) => r.date && r.date <= endDate);

    // Most recent date first
    records.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return records;
  } catch (error) {
    console.error('Error getting student attendance:', error);
    return [];
  }
};

/**
 * ONE student's attendance for specific dates only
 * (1 read per matching record, NOT per record of the whole year).
 * Use this for the student attendance page ("latest 2 days" + dropdown).
 *
 * Needs a composite index on the attendance collection:
 *   regno (Ascending) + date (Ascending)
 * The first run prints a console link that creates it.
 *
 * Firestore's `in` operator allows 30 values, so longer lists are chunked.
 */
export const getStudentAttendanceByDates = async (
  year: string,
  regno: string,
  dates: string[]
): Promise<AttendanceRecord[]> => {
  const uniqueDates = Array.from(new Set(dates.filter(Boolean)));
  if (uniqueDates.length === 0) return [];

  try {
    const colName = getYearCollectionName('attendance', year);
    const regnoUpper = regno.toUpperCase();

    const chunks: string[][] = [];
    for (let i = 0; i < uniqueDates.length; i += 30) {
      chunks.push(uniqueDates.slice(i, i + 30));
    }

    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, colName),
            where('regno', '==', regnoUpper),
            where('date', 'in', chunk)
          )
        )
      )
    );

    const records = ([] as AttendanceRecord[]).concat(
      ...snaps.map((s) => s.docs.map(mapAttendanceDoc))
    );

    records.sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      return byDate !== 0 ? byDate : a.sessionNumber - b.sessionNumber;
    });
    return records;
  } catch (error) {
    console.error('Error getting student attendance by dates:', error);
    return [];
  }
};

/**
 * Delete attendance record
 */
export async function deleteAttendance(year: string, attendanceId: string): Promise<void> {
  if (!attendanceId || attendanceId.trim() === '') {
    throw new Error('Attendance ID is required');
  }

  const attendanceCol = getYearCollectionName('attendance', year);
  await deleteDoc(doc(db, attendanceCol, attendanceId));
}

/**
 * Delete ALL attendance records of one student, in batches.
 * Returns how many records were deleted.
 */
export async function deleteStudentAttendance(year: string, regno: string): Promise<number> {
  const col = getYearCollectionName('attendance', year);
  const snap = await getDocs(
    query(collection(db, col), where('regno', '==', regno.toUpperCase()))
  );

  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return snap.size;
}

/**
 * Get ALL attendance records for a year.
 * ⚠️ VERY EXPENSIVE: 1 read per record (students × sessions, hundreds of
 * thousands late in the term). Use ONLY for deliberate full-year exports by
 * an admin. NEVER call it from student or coordinator pages, and never from
 * a page that loads automatically.
 */
export async function getAllAttendance(year: string): Promise<AttendanceRecord[]> {
  const attendanceCol = getYearCollectionName('attendance', year);
  const snapshot = await getDocs(collection(db, attendanceCol));

  // Skip placeholder docs (older years contain an "_init" doc)
  const records = snapshot.docs
    .filter((d) => d.id !== '_init' && d.id !== 'metadata')
    .map(mapAttendanceDoc);

  // Newest date first, then newest marked time
  records.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;

    const dateComparison = b.date.localeCompare(a.date);
    if (dateComparison !== 0) return dateComparison;

    return toMillis(b.markedAt) - toMillis(a.markedAt);
  });

  return records;
}

/**
 * How many sessions a student attended: COUNT aggregation, ~1 read total
 * (instead of 1 read per record).
 */
export async function getStudentAttendanceCount(year: string, regno: string): Promise<number> {
  const attendanceCol = getYearCollectionName('attendance', year);
  const snap = await getCountFromServer(
    query(collection(db, attendanceCol), where('regno', '==', regno.toUpperCase()))
  );
  return snap.data().count;
}

/**
 * All attendance records for ONE date (1 read per record of that date).
 * Use for reports instead of loading the whole year.
 */
export async function getAttendanceByDate(year: string, date: string): Promise<AttendanceRecord[]> {
  const attendanceCol = getYearCollectionName('attendance', year);
  const snap = await getDocs(query(collection(db, attendanceCol), where('date', '==', date)));

  const records = snap.docs.map(mapAttendanceDoc);
  records.sort((a, b) => toMillis(b.markedAt) - toMillis(a.markedAt));
  return records;
}
