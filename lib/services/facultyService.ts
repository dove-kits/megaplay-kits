// lib/services/facultyService.ts
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
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

// Get all faculties for a given year
export const getFacultiesByYear = async (year: string): Promise<Faculty[]> => {
  const colName = getYearCollectionName('faculties', year);
  const snap = await getDocs(collection(db, colName));
  const result: Faculty[] = [];
  snap.forEach((d) => {
    if (d.id === 'metadata') return;
    result.push(d.data() as Faculty);
  });
  return result;
};

// Add or update a faculty for year
export const upsertFaculty = async (
  year: string,
  email: string,
  committees: string[],
  addedBy: string
): Promise<void> => {
  const colName = getYearCollectionName('faculties', year);
  const ref = doc(db, colName, email.toLowerCase());

  const now = new Date();
  await setDoc(
    ref,
    {
      email: email.toLowerCase(),
      year,
      committees,
      addedBy,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
};

// Delete a faculty from year
export const deleteFaculty = async (year: string, email: string): Promise<void> => {
  const colName = getYearCollectionName('faculties', year);
  const ref = doc(db, colName, email.toLowerCase());
  await deleteDoc(ref);
};
