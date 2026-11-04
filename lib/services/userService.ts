// lib/services/userService.ts
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User } from 'firebase/auth';
import { isSuperAdmin } from '../utils/roleCheck';
import { getAppSettings, getYearCollectionName } from './settingsService';

export interface UserData {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: any;
  lastLogin: any;
  role: 'superadmin' | 'hod' | 'faculty' | 'coordinator' | 'student';
  isActive: boolean;
  year: string;
}

// Only refresh `lastLogin` (a write) if the last one is older than this.
const LOGIN_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

const toMillis = (ts: any): number =>
  ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;

/**
 * Create / refresh the user document.
 *
 * Cost per call:
 *  - normal app open:   1 read (settings come from cache), 0 writes
 *  - first open of day: 1 read, 1 write
 *  - new user / new year: 1 read, 2 writes
 *
 * (Before: 3 reads + 2 writes on EVERY app open.)
 */
export const createOrUpdateUserDocument = async (user: User): Promise<UserData> => {
  try {
    const settings = await getAppSettings(); // cached
    const currentYear = settings?.currentYear || new Date().getFullYear().toString();

    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? (snap.data() as UserData) : null;

    // Role: superadmin is decided by email; any other manually assigned role
    // (hod / faculty / coordinator) is preserved instead of reset to student.
    let role: UserData['role'];
    if (isSuperAdmin(user.email)) {
      role = 'superadmin';
    } else if (existing?.role && existing.role !== 'superadmin') {
      role = existing.role;
    } else {
      role = 'student';
    }

    const email = user.email || '';
    const upToDate =
      !!existing &&
      Date.now() - toMillis(existing.lastLogin) < LOGIN_SYNC_INTERVAL_MS &&
      existing.year === currentYear &&
      existing.role === role &&
      existing.email === email &&
      existing.displayName === user.displayName &&
      existing.photoURL === user.photoURL &&
      existing.isActive === true;

    if (upToDate && existing) return existing;

    const userData: UserData = {
      uid: user.uid,
      email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: existing?.createdAt ?? serverTimestamp(),
      lastLogin: serverTimestamp(),
      role,
      isActive: true,
      year: currentYear,
    };

    await setDoc(userRef, userData, { merge: true });

    // Year-specific copy: only when the user is new, or the year/role changed.
    if (!existing || existing.year !== currentYear || existing.role !== role) {
      const yearUserRef = doc(db, getYearCollectionName('users', currentYear), user.uid);
      await setDoc(yearUserRef, userData, { merge: true });
    }

    return userData;
  } catch (error) {
    console.error('❌ Error creating/updating user document:', error);
    throw error;
  }
};
