// lib/services/attendanceService.ts
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  getDoc,
  addDoc,
  deleteDoc,
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

// ---------- helpers ----------

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
 * FIX: previously used the wrong path `students_${year}`; the app stores
 * students at years/{year}/students.
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
 * Check if student already marked in session
 */
export const checkDuplicateAttendance = async (
  year: string,
  sessionId: string,
  regno: string
): Promise<boolean> => {
  try {
    const colName = getYearCollectionName('attendance', year);
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
 * Mark attendance. Cost: 2 reads (duplicate check + student) and 1 write.
 */
export async function markAttendance(
  year: string,
  sessionId: string,
  sessionName: string,
  sessionDate: string,
  sessionNumber: number,
  regno: string,
  markedCategory: 'od' | 'scholarship' | 'lab',
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

    const regnoUpper = regno.toUpperCase();
    const attendanceCol = getYearCollectionName('attendance', year);

    // 1. Already marked in THIS session (any category)?
    const existingSnap = await getDocs(
      query(
        collection(db, attendanceCol),
        where('sessionId', '==', sessionId),
        where('regno', '==', regnoUpper)
      )
    );

    if (!existingSnap.empty) {
      const existingCategory = (existingSnap.docs[0].data() as AttendanceRecord).markedCategory;

      if (existingCategory === markedCategory) {
        return {
          success: false,
          error: `Student already marked in ${markedCategory.toUpperCase()} for this session`,
        };
      }

      return {
        success: false,
        error: `Student already marked in ${existingCategory.toUpperCase()} for this session. Cannot mark in ${markedCategory.toUpperCase()}. Delete the existing entry first.`,
      };
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

    // 3. Save
    const attendanceData = {
      sessionId,
      sessionName,
      date: sessionDate,
      sessionNumber,
      regno: regnoUpper,
      studentName: student.name,
      email: student.email,
      department: student.department || '',
      hostel: student.hostel || '',
      roomNumber: student.roomNumber || '',
      registeredCommittee: student.committee,
      registeredCategory: student.category,
      markedCategory,
      markedBy,
      markedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, attendanceCol), attendanceData);

    return {
      success: true,
      record: {
        ...attendanceData,
        attendanceId: docRef.id,
        markedAt: Timestamp.now(),
      } as AttendanceRecord,
    };
  } catch (error) {
    console.error('❌ Error marking attendance:', error);
    return { success: false, error: 'Failed to mark attendance' };
  }
}

/**
 * Get attendance for a session (1 read per record in that session)
 */
export const getSessionAttendance = async (
  year: string,
  sessionId: string
): Promise<AttendanceRecord[]> => {
  try {
    const colName = getYearCollectionName('attendance', year);
    const snap = await getDocs(
      query(collection(db, colName), where('sessionId', '==', sessionId))
    );

    const records = snap.docs.map(mapAttendanceDoc);

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
 * Get ALL attendance records for a year.
 * ⚠️ EXPENSIVE: 1 read per record (students × sessions). Use only for
 * full exports / reports, never for per-student or per-session views.
 */
export async function getAllAttendance(year: string): Promise<AttendanceRecord[]> {
  const attendanceCol = getYearCollectionName('attendance', year);
  const snapshot = await getDocs(collection(db, attendanceCol));

  const records = snapshot.docs.map(mapAttendanceDoc);

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
