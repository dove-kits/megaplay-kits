// lib/services/attendanceService.ts
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  orderBy,
  getDoc,
  addDoc,
  deleteDoc,
  Timestamp,
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

// Validate student (check if approved)
export const validateStudent = async (
  regno: string,
  year: string
): Promise<StudentValidationResult> => {
  try {
    const studentRef = doc(db, `students_${year}`, regno.toUpperCase());
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      return {
        valid: false,
        error: 'Student not found in database',
      };
    }

    const student = studentSnap.data();

    if (student.status !== 'approved') {
      return {
        valid: false,
        error: 'Student not approved yet',
      };
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
    return {
      valid: false,
      error: 'Error validating student',
    };
  }
};

// Check if student already marked in session
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

// Mark attendance
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
    // Validate date parameter
    if (!sessionDate || sessionDate.trim() === '') {
      console.error('⚠️ sessionDate is empty or undefined');
      return {
        success: false,
        error: 'Session date is required',
      };
    }

    console.log('📅 Marking attendance with date:', sessionDate);

    // 1. Check if student already marked in THIS session (any category)
    const attendanceCol = getYearCollectionName('attendance', year);
    const q = query(
      collection(db, attendanceCol),
      where('sessionId', '==', sessionId),
      where('regno', '==', regno.toUpperCase())
    );

    const existingSnap = await getDocs(q);

    if (!existingSnap.empty) {
      const existingRecord = existingSnap.docs[0].data() as AttendanceRecord;
      const existingCategory = existingRecord.markedCategory;

      // If trying to mark in same category, show already marked
      if (existingCategory === markedCategory) {
        return {
          success: false,
          error: `Student already marked in ${markedCategory.toUpperCase()} for this session`,
        };
      }

      // If different category, show conflict error
      return {
        success: false,
        error: `Student already marked in ${existingCategory.toUpperCase()} for this session. Cannot mark in ${markedCategory.toUpperCase()}. Delete the existing entry first.`,
      };
    }

    // 2. Get student details from students collection
    const studentsCol = getYearCollectionName('students', year);
    const studentRef = doc(db, studentsCol, regno.toUpperCase());
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      return {
        success: false,
        error: 'Student not found in database',
      };
    }

    const student = studentSnap.data();

    if (student.status !== 'approved') {
      return {
        success: false,
        error: 'Student registration is not approved',
      };
    }

    // 3. Mark attendance with proper field mapping
    const attendanceData = {
      sessionId,
      sessionName,
      date: sessionDate,
      sessionNumber,
      regno: regno.toUpperCase(),
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

    console.log('💾 Saving attendance data:', attendanceData);

    const docRef = await addDoc(collection(db, attendanceCol), attendanceData);

    console.log('✅ Attendance saved with ID:', docRef.id);

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
    return {
      success: false,
      error: 'Failed to mark attendance',
    };
  }
}

// Get attendance for a session
export const getSessionAttendance = async (
  year: string,
  sessionId: string
): Promise<AttendanceRecord[]> => {
  try {
    const colName = getYearCollectionName('attendance', year);
    const q = query(collection(db, colName), where('sessionId', '==', sessionId));
    const snap = await getDocs(q);

    const records: AttendanceRecord[] = [];
    snap.forEach((d) => {
      const data = d.data();
      records.push({
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
      });
    });

    // Sort by marked time (most recent first)
    records.sort((a, b) => {
      if (!a.markedAt && !b.markedAt) return 0;
      if (!a.markedAt) return 1;
      if (!b.markedAt) return -1;

      const aTime = a.markedAt?.toMillis?.() || a.markedAt?.toDate?.().getTime() || 0;
      const bTime = b.markedAt?.toMillis?.() || b.markedAt?.toDate?.().getTime() || 0;
      return bTime - aTime;
    });

    return records;
  } catch (error) {
    console.error('Error getting session attendance:', error);
    return [];
  }
};

// Get student attendance history
export const getStudentAttendance = async (
  year: string,
  regno: string,
  startDate?: string,
  endDate?: string
): Promise<AttendanceRecord[]> => {
  try {
    const colName = getYearCollectionName('attendance', year);
    const q = query(collection(db, colName), where('regno', '==', regno.toUpperCase()));

    const snap = await getDocs(q);

    let records: AttendanceRecord[] = [];
    snap.forEach((d) => {
      const data = d.data();
      records.push({
        attendanceId: d.id,
        sessionId: data.sessionId || '',
        sessionName: data.sessionName || '',
        date: data.date || '',
        sessionNumber: data.sessionNumber || 0,
        regno: data.regno || '',
        studentName: data.studentName || '',
        registeredCommittee: data.registeredCommittee || '',
        registeredCategory: data.registeredCategory || 'normal',
        markedCategory: data.markedCategory || 'od',
        markedBy: data.markedBy || '',
        markedAt: data.markedAt || null,
      });
    });

    // Filter by date range if provided
    if (startDate) {
      records = records.filter((r) => r.date && r.date >= startDate);
    }
    if (endDate) {
      records = records.filter((r) => r.date && r.date <= endDate);
    }

    // Sort by date (most recent first)
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

// Delete attendance record
export async function deleteAttendance(year: string, attendanceId: string): Promise<void> {
  if (!attendanceId || attendanceId.trim() === '') {
    throw new Error('Attendance ID is required');
  }

  const attendanceCol = getYearCollectionName('attendance', year);
  const attendanceRef = doc(db, attendanceCol, attendanceId);

  await deleteDoc(attendanceRef);
}

// Get all attendance records for a year
export async function getAllAttendance(year: string): Promise<AttendanceRecord[]> {
  const attendanceCol = getYearCollectionName('attendance', year);
  const attendanceRef = collection(db, attendanceCol);

  const snapshot = await getDocs(attendanceRef);

  const records: AttendanceRecord[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      attendanceId: doc.id,
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
  });

  // Sort by date (newest first), then by markedAt time
  records.sort((a, b) => {
    // Handle undefined or empty dates - push them to the end
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;

    // Compare dates
    const dateComparison = b.date.localeCompare(a.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    // If dates are equal, sort by markedAt timestamp
    if (a.markedAt && b.markedAt) {
      const aTime = a.markedAt.toDate ? a.markedAt.toDate().getTime() : 0;
      const bTime = b.markedAt.toDate ? b.markedAt.toDate().getTime() : 0;
      return bTime - aTime;
    }

    return 0;
  });

  return records;
}
