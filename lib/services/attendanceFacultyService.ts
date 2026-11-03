// lib/services/attendanceFacultyService.ts
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';

export interface AttendanceFaculty {
  email: string;
  role: 'attendance_admin';
  assignedBy: string;
  assignedAt: any;
  isActive: boolean;
  year: string;
}

// Check if user is attendance faculty
export const isAttendanceFaculty = async (
  email: string,
  year: string
): Promise<boolean> => {
  try {
    const colName = getYearCollectionName('attendance_faculty', year);
    const ref = doc(db, colName, email.toLowerCase());
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      return data.isActive === true;
    }
    return false;
  } catch (error) {
    console.error('Error checking attendance faculty:', error);
    return false;
  }
};

// Get all attendance faculty for a year
export const getAttendanceFacultyByYear = async (
  year: string
): Promise<AttendanceFaculty[]> => {
  try {
    const colName = getYearCollectionName('attendance_faculty', year);
    const snap = await getDocs(collection(db, colName));

    const result: AttendanceFaculty[] = [];
    snap.forEach((d) => {
      if (d.id === 'metadata') return;
      result.push(d.data() as AttendanceFaculty);
    });

    return result;
  } catch (error) {
    console.error('Error getting attendance faculty:', error);
    return [];
  }
};

// Assign attendance faculty
export const assignAttendanceFaculty = async (
  year: string,
  email: string,
  assignedBy: string
): Promise<void> => {
  const colName = getYearCollectionName('attendance_faculty', year);
  const ref = doc(db, colName, email.toLowerCase());

  const data: AttendanceFaculty = {
    email: email.toLowerCase(),
    role: 'attendance_admin',
    assignedBy,
    assignedAt: serverTimestamp(),
    isActive: true,
    year,
  };

  await setDoc(ref, data);
  console.log('✅ Attendance faculty assigned:', email);
};

// Remove attendance faculty
export const removeAttendanceFaculty = async (
  year: string,
  email: string
): Promise<void> => {
  const colName = getYearCollectionName('attendance_faculty', year);
  const ref = doc(db, colName, email.toLowerCase());
  await deleteDoc(ref);
  console.log('✅ Attendance faculty removed:', email);
};
