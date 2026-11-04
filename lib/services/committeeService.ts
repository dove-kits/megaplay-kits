// lib/services/committeeService.ts
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';
import { getAllYears } from './yearService';
import { getFacultiesByYear } from './facultyService';
import { TTLCache } from '../utils/ttlCache';

export type CommitteeKey = string;

export interface Committee {
  key: string;
  name: string;
  description?: string;
  isActive: boolean;
  year: string;
  facultyEmails: string[];
  createdAt?: any;
  lastModifiedAt?: any;
}

export interface BaseCommittee {
  key: string;
  name: string;
  description?: string;
  createdAt?: any;
  lastModifiedAt?: any;
  createdBy?: string;
}

const NON_DATA_DOC_IDS = new Set(['metadata', '_init']);
const BATCH_LIMIT = 450;

// ---------- cache ----------
// Committee lists are read on registration / admin pages by every user but
// change rarely, so keep them for 5 minutes. Every write below invalidates.
const CACHE_TTL_MS = 5 * 60 * 1000;
const baseCache = new TTLCache<BaseCommittee[]>(CACHE_TTL_MS);
const yearCache = new TTLCache<Committee[]>(CACHE_TTL_MS);
const BASE_KEY = 'all';

// ========== BASE COMMITTEE MANAGEMENT (Admin Only) ==========

/**
 * Get all base committees (cached 5 min)
 * @param force - bypass the cache
 */
export const getBaseCommittees = async (force = false): Promise<BaseCommittee[]> => {
  if (!force) {
    const cached = baseCache.get(BASE_KEY);
    if (cached) return [...cached];
  }

  try {
    const q = query(collection(db, 'baseCommittees'), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((d) => d.data() as BaseCommittee);
    baseCache.set(BASE_KEY, list);
    return [...list];
  } catch (error) {
    console.error('❌ Error getting base committees:', error);
    return [];
  }
};

/**
 * Add a new base committee template
 */
export const addBaseCommittee = async (
  key: string,
  name: string,
  description?: string,
  createdBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const trimmedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    const trimmedName = name.trim();

    if (!trimmedKey || !trimmedName) {
      return { success: false, error: 'Committee key and name are required' };
    }

    const docRef = doc(db, 'baseCommittees', trimmedKey);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { success: false, error: 'Committee with this key already exists' };
    }

    const baseCommittee: BaseCommittee = {
      key: trimmedKey,
      name: trimmedName,
      description: description || '',
      createdAt: serverTimestamp(),
      lastModifiedAt: serverTimestamp(),
      createdBy,
    };

    await setDoc(docRef, baseCommittee);
    baseCache.clear();
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding base committee:', error);
    return { success: false, error: 'Failed to add base committee' };
  }
};

/**
 * Update a base committee template.
 * Single write: updateDoc fails with "not-found" if it doesn't exist
 * (before: 1 read + 1 write).
 */
export const updateBaseCommittee = async (
  key: string,
  updates: Partial<BaseCommittee>
): Promise<{ success: boolean; error?: string }> => {
  try {
    await updateDoc(doc(db, 'baseCommittees', key), {
      ...updates,
      lastModifiedAt: serverTimestamp(),
    });

    baseCache.clear();
    return { success: true };
  } catch (error: any) {
    if (error?.code === 'not-found') {
      return { success: false, error: 'Committee not found' };
    }
    console.error('❌ Error updating base committee:', error);
    return { success: false, error: 'Failed to update base committee' };
  }
};

/**
 * Delete a base committee template
 */
export const deleteBaseCommittee = async (
  key: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await deleteDoc(doc(db, 'baseCommittees', key));
    baseCache.clear();
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting base committee:', error);
    return { success: false, error: 'Failed to delete base committee' };
  }
};

// ========== YEAR-SPECIFIC COMMITTEE OPERATIONS ==========

/**
 * Get all committees for a year (cached 5 min)
 * FIX: now skips the "_init" placeholder doc, which was returned as a
 * bogus committee for years created by yearService.
 */
export const getCommitteesForYear = async (
  year: string,
  force = false
): Promise<Committee[]> => {
  if (!force) {
    const cached = yearCache.get(year);
    if (cached) return [...cached];
  }

  try {
    const collectionName = getYearCollectionName('committees', year);
    const snapshot = await getDocs(collection(db, collectionName));
    const list = snapshot.docs
      .filter((d) => !NON_DATA_DOC_IDS.has(d.id))
      .map((d) => d.data() as Committee);

    yearCache.set(year, list);
    return [...list];
  } catch (error) {
    console.error('❌ Error getting committees:', error);
    return [];
  }
};

/**
 * Create committee docs for selected keys for a given year (one batch)
 */
export const createYearCommittees = async (
  year: string,
  selectedKeys: string[]
): Promise<void> => {
  const collectionName = getYearCollectionName('committees', year);
  const baseCommittees = await getBaseCommittees();

  for (let i = 0; i < selectedKeys.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);

    selectedKeys.slice(i, i + BATCH_LIMIT).forEach((key) => {
      const base = baseCommittees.find((c) => c.key === key);
      const committeeDoc: Committee = {
        key,
        name: base?.name || key.charAt(0).toUpperCase() + key.slice(1),
        description: base?.description || '',
        year,
        isActive: true,
        facultyEmails: [],
        createdAt: serverTimestamp(),
        lastModifiedAt: serverTimestamp(),
      };
      batch.set(doc(db, collectionName, key), committeeDoc, { merge: true });
    });

    await batch.commit();
  }

  yearCache.delete(year);
};

/**
 * Update committee details for a specific year
 */
export const updateCommittee = async (
  key: string,
  updates: Partial<Committee>,
  year: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const collectionName = getYearCollectionName('committees', year);
    await setDoc(
      doc(db, collectionName, key),
      { ...updates, lastModifiedAt: serverTimestamp() },
      { merge: true }
    );

    yearCache.delete(year);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating committee:', error);
    return { success: false, error: 'Failed to update committee' };
  }
};

/**
 * Delete a year-specific committee (committee doc only)
 */
export const deleteYearCommittee = async (
  key: string,
  year: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const collectionName = getYearCollectionName('committees', year);
    await deleteDoc(doc(db, collectionName, key));

    yearCache.delete(year);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting committee:', error);
    return { success: false, error: 'Failed to delete committee' };
  }
};

// ========== CASCADE DELETES ==========

/**
 * Delete all student registrations for a committee in a year.
 * FIX: errors used to be swallowed (returned 0) so the committee was still
 * deleted and its students silently left behind. Errors now propagate.
 */
const deleteCommitteeStudents = async (
  year: string,
  committeeKey: string
): Promise<number> => {
  const colName = getYearCollectionName('students', year);
  const snapshot = await getDocs(
    query(collection(db, colName), where('committee', '==', committeeKey))
  );

  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    snapshot.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return snapshot.size;
};

/**
 * Remove a committee from faculty assignments in a year.
 * Faculty left with no committees are deleted (unchanged behaviour).
 * Errors now propagate instead of being swallowed.
 */
const removeCommitteeFromFaculties = async (
  year: string,
  committeeKey: string
): Promise<number> => {
  const faculties = await getFacultiesByYear(year);
  const affected = faculties.filter((f) => f.committees.includes(committeeKey));

  if (affected.length === 0) return 0;

  const colName = getYearCollectionName('faculties', year);

  for (let i = 0; i < affected.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);

    affected.slice(i, i + BATCH_LIMIT).forEach((faculty) => {
      const ref = doc(db, colName, faculty.email.toLowerCase());
      const remaining = faculty.committees.filter((c) => c !== committeeKey);

      if (remaining.length === 0) {
        batch.delete(ref);
      } else {
        batch.update(ref, { committees: remaining, updatedAt: new Date() });
      }
    });

    await batch.commit();
  }

  return affected.length;
};

/**
 * Delete a year-specific committee with ALL associated data:
 * committee doc, student registrations and faculty assignments.
 *
 * Note: attendance records of the deleted students are NOT removed here.
 */
export const deleteYearCommitteeWithData = async (
  key: string,
  year: string
): Promise<{
  success: boolean;
  error?: string;
  studentsDeleted?: number;
  facultiesAffected?: number;
}> => {
  try {
    const studentsDeleted = await deleteCommitteeStudents(year, key);
    const facultiesAffected = await removeCommitteeFromFaculties(year, key);

    const collectionName = getYearCollectionName('committees', year);
    await deleteDoc(doc(db, collectionName, key));
    yearCache.delete(year);

    console.log(
      `✅ Committee "${key}" deleted from ${year} (students: ${studentsDeleted}, faculties: ${facultiesAffected})`
    );

    return { success: true, studentsDeleted, facultiesAffected };
  } catch (error) {
    console.error('❌ Error deleting committee with data:', error);
    return {
      success: false,
      error: `Failed to delete committee: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Delete a base committee and ALL year-specific instances with their data.
 * CHANGE: if any year fails, the base template is kept (and the failed years
 * are reported) so the operation can be retried instead of leaving orphans.
 */
export const deleteBaseCommitteeWithAllData = async (
  key: string
): Promise<{
  success: boolean;
  error?: string;
  yearsAffected?: string[];
  yearsFailed?: string[];
  totalStudentsDeleted?: number;
  totalFacultiesAffected?: number;
}> => {
  try {
    const allYears = await getAllYears();

    const yearsAffected: string[] = [];
    const yearsFailed: string[] = [];
    let totalStudentsDeleted = 0;
    let totalFacultiesAffected = 0;

    for (const { year } of allYears) {
      try {
        const committeeSnap = await getDoc(
          doc(db, getYearCollectionName('committees', year), key)
        );
        if (!committeeSnap.exists()) continue;

        const result = await deleteYearCommitteeWithData(key, year);

        if (result.success) {
          yearsAffected.push(year);
          totalStudentsDeleted += result.studentsDeleted || 0;
          totalFacultiesAffected += result.facultiesAffected || 0;
        } else {
          yearsFailed.push(year);
        }
      } catch (yearError) {
        console.error(`⚠️ Error processing year ${year}:`, yearError);
        yearsFailed.push(year);
      }
    }

    if (yearsFailed.length > 0) {
      return {
        success: false,
        error: `Could not delete the committee from: ${yearsFailed.join(', ')}. The base template was kept; please retry.`,
        yearsAffected,
        yearsFailed,
        totalStudentsDeleted,
        totalFacultiesAffected,
      };
    }

    await deleteDoc(doc(db, 'baseCommittees', key));
    baseCache.clear();

    return { success: true, yearsAffected, totalStudentsDeleted, totalFacultiesAffected };
  } catch (error) {
    console.error('❌ Error in complete committee deletion:', error);
    return {
      success: false,
      error: `Failed to delete committee completely: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};
