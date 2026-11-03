// lib/services/yearService.ts
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc,
  writeBatch,
  WriteBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export interface YearData {
  year: string;
  isActive: boolean;
  createdAt: Date;
  studentCount: number;
  facultyCount: number;
  isInitialized: boolean;
}

/**
 * Initialize all year-specific subcollections
 */
const initializeYearCollections = async (year: string): Promise<void> => {
  const collections = [
    'students',
    'events',
    'committees',
    'attendance',
    'coordinators',
    'attendanceFaculty',
    'faculties',
    'users',
    'sessions'
  ];

  const batch = writeBatch(db);
  
  collections.forEach(collectionName => {
    // ✅ Correct path: years/{year}/{collection}/_init
    const initRef = doc(db, 'years', year, collectionName, '_init');
    batch.set(initRef, { 
      initialized: true, 
      createdAt: new Date(),
      recordCount: 0
    });
  });

  await batch.commit();
  console.log(`✅ Initialized collections for year ${year}`);
};

/**
 * Create a new academic year with all necessary subcollections
 */
export const createNewYear = async (year: string): Promise<YearData> => {
  // ✅ First initialize the subcollections
  await initializeYearCollections(year);
  
  // ✅ Then create the main year document
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
    snapshot.forEach(docSnap => {
      // ✅ Only add if it has the year field (not subcollections)
      const data = docSnap.data();
      if (data && docSnap.id && !docSnap.id.startsWith('_')) {
        years.push({
          year: docSnap.id,
          ...data
        } as YearData);
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
 * Delete all documents in a collection using batched deletes
 */
const deleteCollection = async (year: string, collectionName: string): Promise<number> => {
  // ✅ Correct path construction
  const collectionRef = collection(db, 'years', year, collectionName);
  const snapshot = await getDocs(collectionRef);
  
  if (snapshot.empty) {
    console.log(`Collection years/${year}/${collectionName} is already empty`);
    return 0;
  }

  const batchSize = 500; // Firestore batch limit
  const batches: WriteBatch[] = [];
  let currentBatch = writeBatch(db);
  let operationCount = 0;
  let totalDeleted = 0;

  snapshot.docs.forEach((document) => {
    currentBatch.delete(document.ref);
    operationCount++;
    totalDeleted++;

    if (operationCount === batchSize) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      operationCount = 0;
    }
  });

  // Add the last batch if it has operations
  if (operationCount > 0) {
    batches.push(currentBatch);
  }

  // Commit all batches
  console.log(`Deleting ${totalDeleted} documents from years/${year}/${collectionName} in ${batches.length} batch(es)...`);
  await Promise.all(batches.map(batch => batch.commit()));
  
  return totalDeleted;
};

/**
 * Delete an academic year and ALL its collections
 */
export const deleteYear = async (year: string): Promise<void> => {
  try {
    console.log(`🗑️ Starting deletion of year ${year}...`);
    
    const collections = [
      'students',
      'events',
      'committees',
      'attendance',
      'coordinators',
      'attendanceFaculty',
      'faculties',
      'users',
      'sessions'
    ];

    let totalDocumentsDeleted = 0;

    // Delete all documents in each collection
    for (const collectionName of collections) {
      console.log(`📂 Processing collection: years/${year}/${collectionName}`);
      
      // ✅ Pass year and collection name separately
      const deletedCount = await deleteCollection(year, collectionName);
      totalDocumentsDeleted += deletedCount;
      
      console.log(`✅ Deleted ${deletedCount} documents from ${collectionName}`);
    }

    // Finally delete the year document itself
    const yearDocRef = doc(db, 'years', year);
    await deleteDoc(yearDocRef);
    console.log(`✅ Deleted year document: years/${year}`);

    console.log(`🎉 Successfully deleted year ${year} with ${totalDocumentsDeleted} total documents`);
  } catch (error) {
    console.error('❌ Error deleting year:', error);
    throw new Error(`Failed to delete year ${year}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  const yearRef = doc(db, 'years', year);
  const updateData: Partial<YearData> = {};
  
  if (studentCount !== undefined) updateData.studentCount = studentCount;
  if (facultyCount !== undefined) updateData.facultyCount = facultyCount;
  
  await setDoc(yearRef, updateData, { merge: true });
};

/**
 * Set active status for a year
 */
export const setActiveYear = async (year: string, isActive: boolean): Promise<void> => {
  const yearRef = doc(db, 'years', year);
  await setDoc(yearRef, { isActive }, { merge: true });
};
