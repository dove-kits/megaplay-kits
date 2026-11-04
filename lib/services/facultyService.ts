//// lib/services/facultyService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';

export interface Faculty {
  email: string;
  year: string;
  committees: string[]; // committee keys
  createdAt: any;
  updatedAt: any;
  addedBy: string; // HOD email
}

const NON_DATA_DOC_IDS = new Set(['metadata', '_init']);

// Get all faculties for a given year (1 read per faculty: admin/HOD screens only)
export const getFacultiesByYear = async (year: string): Promise<Faculty[]> => {
  const colName = getYearCollectionName('faculties', year);
  const snap = await getDocs(collection(db, colName));

  const result: Faculty[] = [];
  snap.forEach((d) => {
    if (NON_DATA_DOC_IDS.has(d.id)) return;
    const data = d.data() as Faculty;
    result.push({ ...data, committees: Array.isArray(data.committees) ? data.committees : [] });
  });
  return result;
};

/**
 * Get ONE faculty by email (1 read).
 * Use this for "is this logged-in user a faculty / which committees do they
 * have" instead of getFacultiesByYear() + find(), which reads every faculty.
 */
export const getFacultyByEmail = async (
  year: string,
  email: string
): Promise<Faculty | null> => {
  const colName = getYearCollectionName('faculties', year);
  const snap = await getDoc(doc(db, colName, email.toLowerCase()));
  if (!snap.exists()) return null;

  const data = snap.data() as Faculty;
  return { ...data, committees: Array.isArray(data.committees) ? data.committees : [] };
};

/**
 * Add or update a faculty for a year.
 * FIX: the old merge-set overwrote `createdAt` on every update. Now an
 * existing faculty only gets committees/addedBy/updatedAt changed, and
 * `createdAt` is written only when the document is first created.
 * Cost: 1 write (no read).
 */
export const upsertFaculty = async (
  year: string,
  email: string,
  committees: string[],
  addedBy: string
): Promise<void> => {
  const colName = getYearCollectionName('faculties', year);
  const emailLower = email.toLowerCase();
  const ref = doc(db, colName, emailLower);
  const now = new Date();

  try {
    await updateDoc(ref, { email: emailLower, year, committees, addedBy, updatedAt: now });
  } catch (error: any) {
    if (error?.code !== 'not-found') throw error;

    await setDoc(ref, {
      email: emailLower,
      year,
      committees,
      addedBy,
      createdAt: now,
      updatedAt: now,
    });
  }
};

// Delete a faculty from year
export const deleteFaculty = async (year: string, email: string): Promise<void> => {
  const colName = getYearCollectionName('faculties', year);
  await deleteDoc(doc(db, colName, email.toLowerCase()));
};
