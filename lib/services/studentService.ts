// lib/services/studentService.ts
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getAppSettings, getYearCollectionName } from './settingsService';

export interface Student {
  regno: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  hostel?: string;
  roomNumber?: string;
  committee?: string;
  category?: 'scholarship' | 'normal';
  status?: 'pending' | 'approved' | 'rejected';
  year?: string;
  appliedAt?: Timestamp | any;
  reviewedBy?: string | null;
  reviewedAt?: Timestamp | any | null;
  rejectionReason?: string;
  categories?: Record<string, boolean>; // For bulk upload with multiple categories
}

export interface ColumnMapping {
  regNo: string;
  name: string;
  committee?: string;
  hostel?: string;
  roomNumber?: string;
  phoneNumber?: string;
  department?: string;
  email?: string;
}

type Progress = { current: number; total: number; percent: number };
type BulkResult = { success: number; failed: number; errors: string[] };

// Firestore allows 500 operations per batch; stay safely below.
const BATCH_LIMIT = 450;

const getCurrentYear = async (): Promise<string | null> => {
  const settings = await getAppSettings(); // cached, usually 0 reads
  return settings?.currentYear || null;
};

/**
 * Parse CSV helper function
 */
export const parseCSV = (text: string): { headers: string[]; rows: any[] } => {
  const lines = text.split('\n').filter((line) => line.trim());
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
  return { headers, rows };
};

/**
 * Register a new student for a committee (normal registration flow)
 */
export const registerStudent = async (
  year: string,
  studentData: Omit<Student, 'appliedAt' | 'reviewedBy' | 'reviewedAt' | 'year' | 'rejectionReason'> & {
    status?: 'pending' | 'approved' | 'rejected';
  }
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!year || !studentData.regno || !studentData.email || !studentData.committee) {
      return { success: false, error: 'Missing required fields' };
    }

    const colName = getYearCollectionName('students', year);
    const regnoUpper = studentData.regno.trim().toUpperCase();
    const emailLower = studentData.email.trim().toLowerCase();

    const ref = doc(db, colName, regnoUpper);

    const existing = await getDoc(ref);
    if (existing.exists()) {
      return { success: false, error: 'Student already registered for this year' };
    }

    const isReviewed = studentData.status === 'approved' || studentData.status === 'rejected';

    const student: Student = {
      ...studentData,
      regno: regnoUpper,
      email: emailLower,
      name: studentData.name.trim(),
      phone: studentData.phone?.trim(),
      department: studentData.department?.trim(),
      hostel: studentData.hostel?.trim(),
      roomNumber: studentData.roomNumber?.trim(),
      committee: studentData.committee?.trim(),
      category: studentData.category,
      year,
      status: studentData.status || 'pending',
      appliedAt: serverTimestamp(),
      reviewedBy: isReviewed ? studentData.email : null,
      reviewedAt: isReviewed ? serverTimestamp() : null,
      rejectionReason: '',
    };

    await setDoc(ref, student);
    return { success: true };
  } catch (error) {
    console.error('❌ Error registering student:', error);
    return { success: false, error: 'Failed to register student' };
  }
};

/**
 * Build the Firestore document for a student added by an admin.
 */
const normalizeStudent = (
  input: Student,
  year: string,
  adminUid: string,
  existingAppliedAt: any
): Student => ({
  regno: input.regno.trim().toUpperCase(),
  name: input.name.trim(),
  email: input.email?.trim().toLowerCase() || '',
  phone: input.phone?.trim() || '',
  department: input.department?.trim() || '',
  hostel: input.hostel?.trim() || '',
  roomNumber: input.roomNumber?.trim() || '',
  committee: input.committee?.trim() || '',
  category: input.category || 'normal',
  categories: input.categories || {},
  year,
  status: input.status || 'approved', // superadmin entries default to approved
  appliedAt: existingAppliedAt ?? serverTimestamp(),
  reviewedBy: adminUid,
  reviewedAt: serverTimestamp(),
  rejectionReason: '',
});

/**
 * Add or update ONE student (superadmin).
 * Pass `yearOverride` if the caller already knows the year.
 *
 * FIX: previously read doc 'settings/appSettings' (wrong path) on every call.
 * Now uses the cached getAppSettings().
 */
export const addOrUpdateStudent = async (
  studentData: Student,
  adminUid: string,
  yearOverride?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!studentData.regno || !studentData.name) {
      return { success: false, error: 'Registration Number and Name are required' };
    }

    const currentYear = yearOverride || (await getCurrentYear());
    if (!currentYear) {
      return { success: false, error: 'No active year configured' };
    }

    const colName = getYearCollectionName('students', currentYear);
    const ref = doc(db, colName, studentData.regno.trim().toUpperCase());

    const existing = await getDoc(ref);
    const student = normalizeStudent(
      studentData,
      currentYear,
      adminUid,
      existing.exists() ? existing.data()?.appliedAt : undefined
    );

    await setDoc(ref, student, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding/updating student:', error);
    return { success: false, error: 'Failed to add/update student' };
  }
};

/**
 * Bulk upload (shared implementation).
 *
 * Before: per row = 1 settings read + 1 student read + 1 write, sequential.
 * Now:    settings read once (cached), ONE collection read to preserve
 *         `appliedAt` of existing students (a fresh year has ~0 docs),
 *         then writes in batches of up to 450.
 */
const runBulkUpload = async (
  rows: any[],
  mapping: ColumnMapping,
  categoryType: 'od' | 'scholarship',
  adminUid: string,
  onProgress?: (progress: Progress) => void
): Promise<BulkResult> => {
  const total = rows.length;
  const errors: string[] = [];
  let success = 0;
  let failed = 0;

  const report = (current: number) => {
    if (onProgress) {
      onProgress({
        current,
        total,
        percent: total === 0 ? 100 : Math.round((current / total) * 100),
      });
    }
  };

  const year = await getCurrentYear();
  if (!year) {
    return { success: 0, failed: total, errors: ['No active year configured'] };
  }

  const colName = getYearCollectionName('students', year);

  // One read of the collection instead of one read per row.
  const existingApplied = new Map<string, any>();
  const existingSnap = await getDocs(collection(db, colName));
  existingSnap.forEach((d) => existingApplied.set(d.id, d.data()?.appliedAt ?? null));

  // Validate + prepare
  const prepared: { regno: string; data: Student }[] = [];
  rows.forEach((row, i) => {
    const input: Student = {
      regno: row[mapping.regNo] || '',
      name: row[mapping.name] || '',
      committee: mapping.committee ? row[mapping.committee] : '',
      hostel: mapping.hostel ? row[mapping.hostel] : '',
      roomNumber: mapping.roomNumber ? row[mapping.roomNumber] : '',
      phone: mapping.phoneNumber ? row[mapping.phoneNumber] : '',
      department: mapping.department ? row[mapping.department] : '',
      email: mapping.email ? row[mapping.email] : '',
      category: categoryType === 'od' ? 'normal' : 'scholarship',
      categories: { [categoryType]: true },
    };

    if (!input.regno.trim() || !input.name.trim()) {
      failed++;
      errors.push(`Row ${i + 1}: Registration Number and Name are required`);
      return;
    }

    const regno = input.regno.trim().toUpperCase();
    prepared.push({
      regno,
      data: normalizeStudent(input, year, adminUid, existingApplied.get(regno)),
    });
  });

  let processed = failed;
  report(processed);

  for (let i = 0; i < prepared.length; i += BATCH_LIMIT) {
    const chunk = prepared.slice(i, i + BATCH_LIMIT);
    try {
      const batch = writeBatch(db);
      chunk.forEach(({ regno, data }) => {
        batch.set(doc(db, colName, regno), data, { merge: true });
      });
      await batch.commit();
      success += chunk.length;
    } catch (error: any) {
      failed += chunk.length;
      errors.push(`Rows in batch ${Math.floor(i / BATCH_LIMIT) + 1}: ${error?.message || 'Batch failed'}`);
    }
    processed += chunk.length;
    report(processed);
  }

  return { success, failed, errors };
};

/** Bulk upload students (kept for backwards compatibility). */
export const bulkUploadStudents = runBulkUpload;

/** Parallel version is no longer needed: batching is already fast. */
export const bulkUploadStudentsParallel = runBulkUpload;

/**
 * Get student by registration number (1 read)
 */
export const getStudentByRegno = async (
  year: string,
  regno: string
): Promise<Student | null> => {
  try {
    if (!year || !regno) {
      console.error('Missing year or regno');
      return null;
    }

    const colName = getYearCollectionName('students', year);
    const snap = await getDoc(doc(db, colName, regno.toUpperCase()));
    return snap.exists() ? (snap.data() as Student) : null;
  } catch (error) {
    console.error('Error getting student by regno:', error);
    return null;
  }
};

/**
 * Get student by email address
 */
export const getStudentByEmail = async (
  year: string,
  email: string
): Promise<Student | null> => {
  try {
    if (!year || !email) {
      console.error('Missing year or email');
      return null;
    }

    const colName = getYearCollectionName('students', year);
    const q = query(collection(db, colName), where('email', '==', email.toLowerCase()));
    const snap = await getDocs(q);

    return snap.empty ? null : (snap.docs[0].data() as Student);
  } catch (error) {
    console.error('Error getting student by email:', error);
    return null;
  }
};

/**
 * Get all students for a specific committee
 */
export const getStudentsByCommittee = async (
  year: string,
  committeeKey: string,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<Student[]> => {
  try {
    if (!year || !committeeKey) {
      console.error('Missing year or committee key');
      return [];
    }

    const colName = getYearCollectionName('students', year);
    const studentsRef = collection(db, colName);

    const q = status
      ? query(studentsRef, where('committee', '==', committeeKey), where('status', '==', status))
      : query(studentsRef, where('committee', '==', committeeKey));

    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Student);
  } catch (error) {
    console.error('Error getting students by committee:', error);
    return [];
  }
};

/**
 * Get count of pending students for a committee
 */
export const getPendingCountByCommittee = async (
  year: string,
  committeeKey: string
): Promise<number> => {
  try {
    if (!year || !committeeKey) return 0;

    const colName = getYearCollectionName('students', year);
    const q = query(
      collection(db, colName),
      where('committee', '==', committeeKey),
      where('status', '==', 'pending')
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting pending count:', error);
    return 0;
  }
};

/**
 * Update student status (approve/reject)
 */
export const updateStudentStatus = async (
  year: string,
  regno: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!year || !regno || !status || !reviewedBy) {
      return { success: false, error: 'Missing required fields' };
    }

    const colName = getYearCollectionName('students', year);
    const ref = doc(db, colName, regno.toUpperCase());

    const updateData: any = {
      status,
      reviewedBy,
      reviewedAt: serverTimestamp(),
    };

    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    await setDoc(ref, updateData, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('Error updating student status:', error);
    return { success: false, error: 'Failed to update student status' };
  }
};

/**
 * Get all students for a year (ADMIN ONLY: costs 1 read per student).
 * Never call this from student-facing pages.
 */
export const getAllStudents = async (year: string): Promise<Student[]> => {
  try {
    if (!year) {
      console.error('Missing year');
      return [];
    }

    const colName = getYearCollectionName('students', year);
    const snapshot = await getDocs(collection(db, colName));
    // Skip placeholder docs (older years contain an "_init" doc)
    return snapshot.docs
      .filter((d) => d.id !== '_init' && d.id !== 'metadata')
      .map((d) => d.data() as Student);
  } catch (error) {
    console.error('Error getting all students:', error);
    return [];
  }
};

/**
 * Delete a student registration
 */
export const deleteStudent = async (
  year: string,
  regno: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!year || !regno) {
      return { success: false, error: 'Missing required fields' };
    }

    const colName = getYearCollectionName('students', year);
    await deleteDoc(doc(db, colName, regno.toUpperCase()));
    return { success: true };
  } catch (error) {
    console.error('Error deleting student:', error);
    return { success: false, error: 'Failed to delete student' };
  }
};

/**
 * Bulk delete students in batches (much faster than one-by-one)
 */
export const bulkDeleteStudents = async (
  year: string,
  regnos: string[],
  onProgress?: (progress: Progress) => void
): Promise<BulkResult> => {
  const total = regnos.length;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  if (!year) {
    return { success: 0, failed: total, errors: ['Missing year'] };
  }

  const colName = getYearCollectionName('students', year);

  for (let i = 0; i < regnos.length; i += BATCH_LIMIT) {
    const chunk = regnos.slice(i, i + BATCH_LIMIT);
    try {
      const batch = writeBatch(db);
      chunk.forEach((regno) => batch.delete(doc(db, colName, regno.toUpperCase())));
      await batch.commit();
      success += chunk.length;
    } catch (error: any) {
      failed += chunk.length;
      errors.push(`${chunk[0]}…${chunk[chunk.length - 1]}: ${error?.message || 'Batch failed'}`);
    }

    if (onProgress) {
      const current = Math.min(i + chunk.length, total);
      onProgress({ current, total, percent: Math.round((current / total) * 100) });
    }
  }

  return { success, failed, errors };
};
