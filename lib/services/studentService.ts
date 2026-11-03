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
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';

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

/**
 * Parse CSV helper function
 */
export const parseCSV = (text: string): { headers: string[]; rows: any[] } => {
  const lines = text.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
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
 * Works with both predefined and dynamically added committees
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
    
    // Use regno as document ID for easy lookups
    const ref = doc(db, colName, regnoUpper);

    // Check if student already registered
    const existing = await getDoc(ref);
    if (existing.exists()) {
      return { success: false, error: 'Student already registered for this year' };
    }

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
      status: studentData.status || 'pending', // Use provided status or default to 'pending'
      appliedAt: serverTimestamp(),
      reviewedBy: studentData.status === 'approved' || studentData.status === 'rejected' 
        ? studentData.email // Set reviewedBy if status is already set (for superadmin)
        : null,
      reviewedAt: studentData.status === 'approved' || studentData.status === 'rejected'
        ? serverTimestamp() // Set reviewedAt if status is already set
        : null,
      rejectionReason: '',
    };

    await setDoc(ref, student);
    console.log('✅ Student registered:', student.regno, 'for committee:', student.committee, 'with status:', student.status);
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error registering student:', error);
    return { success: false, error: 'Failed to register student' };
  }
};


/**
 * Add or update student (for superadmin - bypasses registration checks)
 * Used for bulk uploads and direct admin additions
 */
export const addOrUpdateStudent = async (
  studentData: Student,
  adminUid: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!studentData.regno || !studentData.name) {
      return { success: false, error: 'Registration Number and Name are required' };
    }

    // Get current year from settings
    const settingsRef = doc(db, 'settings', 'appSettings');
    const settingsSnap = await getDoc(settingsRef);
    const currentYear = settingsSnap.data()?.currentYear;

    if (!currentYear) {
      return { success: false, error: 'No active year configured' };
    }

    const colName = getYearCollectionName('students', currentYear);
    const regnoUpper = studentData.regno.trim().toUpperCase();
    const ref = doc(db, colName, regnoUpper);

    // Check if student exists
    const existing = await getDoc(ref);

    const student: Student = {
      regno: regnoUpper,
      name: studentData.name.trim(),
      email: studentData.email?.trim().toLowerCase() || '',
      phone: studentData.phone?.trim() || '',
      department: studentData.department?.trim() || '',
      hostel: studentData.hostel?.trim() || '',
      roomNumber: studentData.roomNumber?.trim() || '',
      committee: studentData.committee?.trim() || '',
      category: studentData.category || 'normal',
      categories: studentData.categories || {},
      year: currentYear,
      status: studentData.status || 'approved', // Default to approved for superadmin entries
      appliedAt: existing.exists() ? existing.data()?.appliedAt : serverTimestamp(),
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp(),
      rejectionReason: '',
    };

    await setDoc(ref, student, { merge: true });
    console.log(`✅ Student ${regnoUpper} ${existing.exists() ? 'updated' : 'added'} successfully`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding/updating student:', error);
    return { success: false, error: 'Failed to add/update student' };
  }
};

/**
 * Bulk upload students (sequential)
 * Processes uploads one at a time for better error tracking
 */
export const bulkUploadStudents = async (
  rows: any[],
  mapping: ColumnMapping,
  categoryType: 'od' | 'scholarship',
  adminUid: string,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const total = rows.length;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      const studentData: Student = {
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

      const result = await addOrUpdateStudent(studentData, adminUid);
      if (result.success) {
        success++;
      } else {
        failed++;
        errors.push(`${studentData.regno}: ${result.error}`);
      }
    } catch (error: any) {
      failed++;
      errors.push(`Row ${i + 1}: ${error.message}`);
    }

    // Report progress
    if (onProgress) {
      const current = i + 1;
      const percent = Math.round((current / total) * 100);
      onProgress({ current, total, percent });
    }
  }

  return { success, failed, errors };
};

/**
 * Bulk upload students (parallel)
 * Processes all uploads concurrently for faster performance
 */
export const bulkUploadStudentsParallel = async (
  rows: any[],
  mapping: ColumnMapping,
  categoryType: 'od' | 'scholarship',
  adminUid: string,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const total = rows.length;
  let completed = 0;
  const errors: string[] = [];

  const uploadPromises = rows.map(async (row, index) => {
    try {
      const studentData: Student = {
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

      const result = await addOrUpdateStudent(studentData, adminUid);
      
      completed++;
      if (onProgress) {
        const percent = Math.round((completed / total) * 100);
        onProgress({ current: completed, total, percent });
      }

      return { success: result.success, error: result.error, regno: studentData.regno };
    } catch (error: any) {
      completed++;
      if (onProgress) {
        const percent = Math.round((completed / total) * 100);
        onProgress({ current: completed, total, percent });
      }
      return { success: false, error: error.message, regno: `Row ${index + 1}` };
    }
  });

  const results = await Promise.all(uploadPromises);
  
  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(r => {
    if (!r.success && r.error) {
      errors.push(`${r.regno}: ${r.error}`);
    }
  });

  return { success, failed, errors };
};

/**
 * Get student by registration number
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
    const ref = doc(db, colName, regno.toUpperCase());
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data() as Student;
    }
    return null;
  } catch (error) {
    console.error('Error getting student by regno:', error);
    return null;
  }
};

/**
 * Get student by email address
 * Used to check if a user has already registered
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
    const studentsRef = collection(db, colName);
    const q = query(studentsRef, where('email', '==', email.toLowerCase()));
    const snap = await getDocs(q);

    if (!snap.empty) {
      return snap.docs[0].data() as Student;
    }
    return null;
  } catch (error) {
    console.error('Error getting student by email:', error);
    return null;
  }
};

/**
 * Get all students for a specific committee
 * Works with both predefined and dynamic committees
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
    
    // Build query based on parameters
    let q;
    if (status) {
      q = query(
        studentsRef, 
        where('committee', '==', committeeKey),
        where('status', '==', status)
      );
    } else {
      q = query(studentsRef, where('committee', '==', committeeKey));
    }
    
    const snapshot = await getDocs(q);
    
    const students: Student[] = [];
    snapshot.forEach((doc) => {
      students.push(doc.data() as Student);
    });

    return students;
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
    const studentsRef = collection(db, colName);
    const q = query(
      studentsRef,
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
    
    console.log(`✅ Student ${regno} ${status} by ${reviewedBy}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating student status:', error);
    return { success: false, error: 'Failed to update student status' };
  }
};

/**
 * Get all students for a year (admin function)
 */
export const getAllStudents = async (year: string): Promise<Student[]> => {
  try {
    if (!year) {
      console.error('Missing year');
      return [];
    }

    const colName = getYearCollectionName('students', year);
    const studentsRef = collection(db, colName);
    const snapshot = await getDocs(studentsRef);
    
    const students: Student[] = [];
    snapshot.forEach((doc) => {
      students.push(doc.data() as Student);
    });

    return students;
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
    const ref = doc(db, colName, regno.toUpperCase());
    
    // Actually delete the document
    await deleteDoc(ref);
    
    console.log(`✅ Student ${regno} deleted successfully`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting student:', error);
    return { success: false, error: 'Failed to delete student' };
  }
};

/**
 * Bulk delete students with progress tracking
 */
export const bulkDeleteStudents = async (
  year: string,
  regnos: string[],
  onProgress?: (progress: { current: number; total: number; percent: number }) => void
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const total = regnos.length;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < regnos.length; i++) {
    try {
      const result = await deleteStudent(year, regnos[i]);
      if (result.success) {
        success++;
      } else {
        failed++;
        errors.push(`${regnos[i]}: ${result.error}`);
      }
    } catch (error: any) {
      failed++;
      errors.push(`${regnos[i]}: ${error.message}`);
    }

    // Report progress
    if (onProgress) {
      const current = i + 1;
      const percent = Math.round((current / total) * 100);
      onProgress({ current, total, percent });
    }
  }

  return { success, failed, errors };
};
