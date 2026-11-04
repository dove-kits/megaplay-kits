// lib/services/yearService.ts
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { clearStudentsCache } from './studentService';

export interface YearData {
  year: string;
  isActive: boolean;
  createdAt: Date;
  studentCount: number;
  facultyCount: number;
  isInitialized: boolean;
}

/**
 * Sub-collections the app ACTUALLY uses under years/{year}/.
 * 'attendance_coordinators' and 'attendance_faculty' are the real names.
 * 'meta' holds the sessionsSummary doc, so deleting a year removes it too.
 */
const YEAR_COLLECTIONS = [
  'students',
  'events',
  'committees',
  'attendance',
  'attendance_coordinators',
  'attendance_faculty',
  'faculties',
  'users',
  'sessions',
  'meta',
];

// Old names, cleaned up on delete for years created before the rename.
const LEGACY_COLLECTIONS = ['coordinators', 'attendanceFaculty'];

const BATCH_LIMIT = 450;

/**
 * Create a new academic year.
 * No "_init" placeholder docs are written into sub-collections: Firestore
 * doesn't need collections to be "initialised", and those docs were being
 * returned by getDocs() as fake students, committees, faculties, etc.
 */
export const createNewYear = async (year: string): Promise<YearData> => {
  const yearRef = doc(db, 'years', year);
  const yearData: YearData = {
    year,
    isActive: true,
    createdAt: new Date(),
    studentCount: 0,
    facultyCount: 0,
    isInitialized: true,
  };

  await setDoc(yearRef, yearData);
  console.log(`✅ Created new year: ${year}`);

  return yearData;
};

/**
 * Get all academic years from the database
 */
export const getAllYears = async (): Promise<YearData[]> => {
  const years: YearData[] = [];

  try {
    const snapshot = await getDocs(collection(db, 'years'));
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && docSnap.id && !docSnap.id.startsWith('_')) {
        years.push({ year: docSnap.id, ...data } as YearData);
      }
    });

    years.sort((a, b) => b.year.localeCompare(a.year));
  } catch (error) {
    console.error('Error getting years:', error);
    throw new Error('Failed to fetch years');
  }

  return years;
};

/**
 * Delete all documents in one sub-collection using batched deletes
 */
const deleteCollection = async (year: string, collectionName: string): Promise<number> => {
  const snapshot = await getDocs(collection(db, 'years', year, collectionName));
  if (snapshot.empty) return 0;

  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    snapshot.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return snapshot.size;
};

/**
 * Delete an academic year and ALL its collections
 */
export const deleteYear = async (year: string): Promise<void> => {
  try {
    let totalDocumentsDeleted = 0;

    for (const collectionName of [...YEAR_COLLECTIONS, ...LEGACY_COLLECTIONS]) {
      const deletedCount = await deleteCollection(year, collectionName);
      totalDocumentsDeleted += deletedCount;
      if (deletedCount > 0) {
        console.log(`✅ Deleted ${deletedCount} documents from ${collectionName}`);
      }
    }

    await deleteDoc(doc(db, 'years', year));
    clearStudentsCache(year); // don't serve a deleted year's student list from cache
    console.log(`🎉 Deleted year ${year} (${totalDocumentsDeleted} documents)`);
  } catch (error) {
    console.error('❌ Error deleting year:', error);
    throw new Error(
      `Failed to delete year ${year}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Update year statistics (student and faculty counts)
 */
export const updateYearStats = async (
  year: string,
  studentCount?: number,
  facultyCount?: number
): Promise<void> => {
  const updateData: Partial<YearData> = {};

  if (studentCount !== undefined) updateData.studentCount = studentCount;
  if (facultyCount !== undefined) updateData.facultyCount = facultyCount;

  await setDoc(doc(db, 'years', year), updateData, { merge: true });
};

/**
 * Set active status for a year
 */
export const setActiveYear = async (year: string, isActive: boolean): Promise<void> => {
  await setDoc(doc(db, 'years', year), { isActive }, { merge: true });
};
