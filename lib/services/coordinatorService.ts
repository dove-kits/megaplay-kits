// lib/services/coordinatorService.ts
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';
import { TTLCache } from '../utils/ttlCache';

export interface Coordinator {
  email: string;
  assignedBy: string;
  assignedAt: any;
  isActive: boolean;
  year: string;
  isDeleting?: boolean; // Optional: for UI loading state
}

const COLLECTION = 'attendance_coordinators';
const NON_DATA_DOC_IDS = new Set(['metadata', '_init']);

// Role checks run on many pages; cache them briefly (3 min).
// NOTE: this is a UX optimisation only. Real access control must be enforced
// by Firestore security rules.
const roleCache = new TTLCache<boolean>(3 * 60 * 1000);
const cacheKey = (year: string, email: string) => `${year}:${email.toLowerCase()}`;

// Check if user is coordinator (1 read, then cached)
export const isCoordinator = async (
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
    console.error('Error checking coordinator:', error);
    return false;
  }
};

// Get all coordinators for a year
export const getCoordinatorsByYear = async (
  year: string
): Promise<Coordinator[]> => {
  try {
    const colName = getYearCollectionName(COLLECTION, year);
    const snap = await getDocs(collection(db, colName));

    const result: Coordinator[] = [];
    snap.forEach((d) => {
      if (NON_DATA_DOC_IDS.has(d.id)) return;
      result.push(d.data() as Coordinator);
    });

    return result;
  } catch (error) {
    console.error('Error getting coordinators:', error);
    return [];
  }
};

// Assign coordinator
export const assignCoordinator = async (
  year: string,
  email: string,
  assignedBy: string
): Promise<void> => {
  try {
    const colName = getYearCollectionName(COLLECTION, year);
    const ref = doc(db, colName, email.toLowerCase());

    const data: Coordinator = {
      email: email.toLowerCase(),
      assignedBy,
      assignedAt: serverTimestamp(),
      isActive: true,
      year,
    };

    await setDoc(ref, data);
    roleCache.delete(cacheKey(year, email));
  } catch (error) {
    console.error('❌ Error assigning coordinator:', error);
    throw error;
  }
};

/**
 * Remove coordinator and associated data.
 * All three lookups run in parallel, then everything is applied in ONE
 * atomic batch (before: 4 sequential steps that could half-complete).
 */
export const removeCoordinator = async (
  year: string,
  email: string
): Promise<void> => {
  try {
    const emailLower = email.toLowerCase();

    const [studentSnap, yearUserSnap, globalUserSnap] = await Promise.all([
      // Student docs use regno as ID, so query by the email field
      getDocs(
        query(collection(db, getYearCollectionName('students', year)), where('email', '==', emailLower))
      ),
      getDocs(
        query(collection(db, getYearCollectionName('users', year)), where('email', '==', emailLower))
      ),
      getDocs(query(collection(db, 'users'), where('email', '==', emailLower))),
    ]);

    const batch = writeBatch(db);

    // 1. Coordinator document
    batch.delete(doc(db, getYearCollectionName(COLLECTION, year), emailLower));

    // 2. Student profile(s)
    studentSnap.docs.forEach((d) => batch.delete(d.ref));

    // 3 + 4. Reset role on year-specific and global user docs
    yearUserSnap.docs.forEach((d) => batch.set(d.ref, { role: 'student' }, { merge: true }));
    globalUserSnap.docs.forEach((d) => batch.set(d.ref, { role: 'student' }, { merge: true }));

    await batch.commit();
    roleCache.delete(cacheKey(year, email));

    console.log(
      `✅ Coordinator ${email} removed (students: ${studentSnap.size}, year users: ${yearUserSnap.size}, global users: ${globalUserSnap.size})`
    );
  } catch (error) {
    console.error('❌ Error removing coordinator:', error);
    throw error;
  }
};

// Soft delete (deactivate instead of delete)
export const deactivateCoordinator = async (
  year: string,
  email: string
): Promise<void> => {
  try {
    const colName = getYearCollectionName(COLLECTION, year);
    await setDoc(
      doc(db, colName, email.toLowerCase()),
      { isActive: false, deactivatedAt: serverTimestamp() },
      { merge: true }
    );
    roleCache.delete(cacheKey(year, email));
  } catch (error) {
    console.error('❌ Error deactivating coordinator:', error);
    throw error;
  }
};

// Reactivate a deactivated coordinator
export const reactivateCoordinator = async (
  year: string,
  email: string
): Promise<void> => {
  try {
    const colName = getYearCollectionName(COLLECTION, year);
    await setDoc(
      doc(db, colName, email.toLowerCase()),
      { isActive: true, reactivatedAt: serverTimestamp() },
      { merge: true }
    );
    roleCache.delete(cacheKey(year, email));
  } catch (error) {
    console.error('❌ Error reactivating coordinator:', error);
    throw error;
  }
};
