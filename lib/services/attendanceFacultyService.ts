// lib/services/attendanceFacultyService.ts
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';
import { TTLCache } from '../utils/ttlCache';

export interface AttendanceFaculty {
  email: string;
  role: 'attendance_admin';
  assignedBy: string;
  assignedAt: any;
  isActive: boolean;
  year: string;
}

const COLLECTION = 'attendance_faculty';
const NON_DATA_DOC_IDS = new Set(['metadata', '_init']);

// Cached briefly (3 min). UX optimisation only: enforce real access control
// with Firestore security rules.
const roleCache = new TTLCache<boolean>(3 * 60 * 1000);
const cacheKey = (year: string, email: string) => `${year}:${email.toLowerCase()}`;

// Check if user is attendance faculty (1 read, then cached)
export const isAttendanceFaculty = async (
  email: string,
  year: string
): Promise<boolean> => {
  const key = cacheKey(year, email);
  const cached = roleCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const colName = getYearCollectionName(COLLECTION, year);
    const snap = await getDoc(doc(db, colName, email.toLowerCase()));
    const result = snap.exists() && snap.data().isActive === true;

    roleCache.set(key, result); // only cache successful lookups
    return result;
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
    const colName = getYearCollectionName(COLLECTION, year);
    const snap = await getDocs(collection(db, colName));

    const result: AttendanceFaculty[] = [];
    snap.forEach((d) => {
      if (NON_DATA_DOC_IDS.has(d.id)) return;
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
  const colName = getYearCollectionName(COLLECTION, year);
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
  roleCache.delete(cacheKey(year, email));
};

// Remove attendance faculty
export const removeAttendanceFaculty = async (
  year: string,
  email: string
): Promise<void> => {
  const colName = getYearCollectionName(COLLECTION, year);
  await deleteDoc(doc(db, colName, email.toLowerCase()));
  roleCache.delete(cacheKey(year, email));
};
