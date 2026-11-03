// lib/services/committeeService.ts
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,            
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName, getAppSettings } from './settingsService';


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

// ========== BASE COMMITTEE MANAGEMENT (Admin Only) ==========

/**
 * Get all base committees (templates for year selection)
 */
export const getBaseCommittees = async (): Promise<BaseCommittee[]> => {
  try {
    const q = query(collection(db, 'baseCommittees'), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as BaseCommittee);
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

    // Check if already exists
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
    console.log(`✅ Base committee added: ${trimmedKey}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding base committee:', error);
    return { success: false, error: 'Failed to add base committee' };
  }
};

/**
 * Update a base committee template
 */
export const updateBaseCommittee = async (
  key: string,
  updates: Partial<BaseCommittee>
): Promise<{ success: boolean; error?: string }> => {
  try {
    const docRef = doc(db, 'baseCommittees', key);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return { success: false, error: 'Committee not found' };
    }

    await setDoc(docRef, {
      ...updates,
      lastModifiedAt: serverTimestamp(),
    }, { merge: true });

    console.log(`✅ Base committee updated: ${key}`);
    return { success: true };
  } catch (error) {
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
    const docRef = doc(db, 'baseCommittees', key);
    await deleteDoc(docRef);
    
    console.log(`✅ Base committee deleted: ${key}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting base committee:', error);
    return { success: false, error: 'Failed to delete base committee' };
  }
};

// ========== YEAR-SPECIFIC COMMITTEE OPERATIONS ==========

/**
 * Get all committees for a year
 */
export const getCommitteesForYear = async (year: string): Promise<Committee[]> => {
  try {
    const collectionName = getYearCollectionName('committees', year);
    const snapshot = await getDocs(collection(db, collectionName));
    return snapshot.docs.map(doc => doc.data() as Committee);
  } catch (error) {
    console.error('❌ Error getting committees:', error);
    return [];
  }
};

/**
 * Create committee docs for selected keys for a given year
 */
export const createYearCommittees = async (
  year: string,
  selectedKeys: string[]
): Promise<void> => {
  const collectionName = getYearCollectionName('committees', year);
  const baseCommittees = await getBaseCommittees();

  const tasks = selectedKeys.map(async (key) => {
    const base = baseCommittees.find((c) => c.key === key);
    
    const ref = doc(db, collectionName, key);
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

    await setDoc(ref, committeeDoc, { merge: true });
  });

  await Promise.all(tasks);
  console.log(`✅ Committees created for year ${year}:`, selectedKeys);
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
    const ref = doc(db, collectionName, key);
    
    await setDoc(ref, {
      ...updates,
      lastModifiedAt: serverTimestamp(),
    }, { merge: true });

    console.log(`✅ Committee updated: ${key}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating committee:', error);
    return { success: false, error: 'Failed to update committee' };
  }
};

/**
 * Delete a year-specific committee
 */
export const deleteYearCommittee = async (
  key: string,
  year: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const collectionName = getYearCollectionName('committees', year);
    await deleteDoc(doc(db, collectionName, key));
    
    console.log(`✅ Committee deleted for year ${year}: ${key}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting committee:', error);
    return { success: false, error: 'Failed to delete committee' };
  }
};


import { writeBatch, WriteBatch } from 'firebase/firestore'; // Add to imports
import { getAllYears } from './yearService'; // Add this import
import { getFacultiesByYear } from './facultyService'; // Add this import

/**
 * Delete all student registrations for a specific committee in a year
 */
const deleteCommitteeStudents = async (
  year: string,
  committeeKey: string
): Promise<number> => {
  try {
    const colName = getYearCollectionName('students', year);
    const studentsRef = collection(db, colName);
    const q = query(studentsRef, where('committee', '==', committeeKey));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`No students found for committee ${committeeKey} in year ${year}`);
      return 0;
    }

    // Batch delete students (max 500 per batch)
    const batchSize = 500;
    const batches: WriteBatch[] = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    let totalDeleted = 0;

    snapshot.docs.forEach((doc) => {
      currentBatch.delete(doc.ref);
      operationCount++;
      totalDeleted++;

      if (operationCount === batchSize) {
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
    });

    if (operationCount > 0) {
      batches.push(currentBatch);
    }

    await Promise.all(batches.map(batch => batch.commit()));
    console.log(`✅ Deleted ${totalDeleted} students from committee ${committeeKey} in year ${year}`);
    
    return totalDeleted;
  } catch (error) {
    console.error(`❌ Error deleting students for committee ${committeeKey}:`, error);
    return 0;
  }
};

/**
 * Remove committee from faculty assignments in a year
 */
/**
 * Remove committee from faculty assignments in a year
 */
const removeCommitteeFromFaculties = async (
  year: string,
  committeeKey: string
): Promise<number> => {
  try {
    const faculties = await getFacultiesByYear(year);
    
    // Add safety check for committees array
    const affectedFaculties = faculties.filter(f => 
      f.committees && Array.isArray(f.committees) && f.committees.includes(committeeKey)
    );

    if (affectedFaculties.length === 0) {
      console.log(`No faculties assigned to committee ${committeeKey} in year ${year}`);
      return 0;
    }

    const colName = getYearCollectionName('faculties', year);
    const batch = writeBatch(db);

    affectedFaculties.forEach((faculty) => {
      const ref = doc(db, colName, faculty.email.toLowerCase());
      const updatedCommittees = faculty.committees.filter(c => c !== committeeKey);
      
      // If faculty has no more committees, delete the faculty document
      if (updatedCommittees.length === 0) {
        batch.delete(ref);
      } else {
        // Otherwise, update the committees array
        batch.update(ref, { 
          committees: updatedCommittees,
          updatedAt: new Date()
        });
      }
    });

    await batch.commit();
    console.log(`✅ Removed committee ${committeeKey} from ${affectedFaculties.length} faculties in year ${year}`);
    
    return affectedFaculties.length;
  } catch (error) {
    console.error(`❌ Error removing committee from faculties:`, error);
    return 0;
  }
};


/**
 * Delete a year-specific committee with ALL associated data
 * This includes: committee doc, student registrations, and faculty assignments
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
    console.log(`🗑️ Starting deletion of committee "${key}" from year ${year}...`);
    
    // Step 1: Delete all student registrations for this committee
    const studentsDeleted = await deleteCommitteeStudents(year, key);
    
    // Step 2: Remove committee from faculty assignments
    const facultiesAffected = await removeCommitteeFromFaculties(year, key);
    
    // Step 3: Delete the committee document itself
    const collectionName = getYearCollectionName('committees', year);
    await deleteDoc(doc(db, collectionName, key));
    
    console.log(`🎉 Successfully deleted committee "${key}" from year ${year}`);
    console.log(`   - Students deleted: ${studentsDeleted}`);
    console.log(`   - Faculties affected: ${facultiesAffected}`);
    
    return { 
      success: true,
      studentsDeleted,
      facultiesAffected
    };
  } catch (error) {
    console.error('❌ Error deleting committee with data:', error);
    return { 
      success: false, 
      error: `Failed to delete committee: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Delete a base committee and ALL year-specific instances with associated data
 * This is the NUCLEAR option - deletes everything related to this committee
 */
export const deleteBaseCommitteeWithAllData = async (
  key: string
): Promise<{ 
  success: boolean; 
  error?: string;
  yearsAffected?: string[];
  totalStudentsDeleted?: number;
  totalFacultiesAffected?: number;
}> => {
  try {
    console.log(`🗑️ Starting COMPLETE deletion of committee: ${key}`);
    
    // Step 1: Get all available years
    const allYears = await getAllYears();
    console.log(`📅 Found ${allYears.length} year(s) to check`);
    
    const yearsAffected: string[] = [];
    let totalStudentsDeleted = 0;
    let totalFacultiesAffected = 0;
    
    // Step 2: Delete committee from each year with all associated data
    for (const yearData of allYears) {
      const year = yearData.year;
      
      try {
        // Check if committee exists in this year
        const collectionName = getYearCollectionName('committees', year);
        const committeeRef = doc(db, collectionName, key);
        const committeeSnap = await getDoc(committeeRef);
        
        if (committeeSnap.exists()) {
          const committeeData = committeeSnap.data() as Committee;
          console.log(`📌 Found committee in year ${year} - ${committeeData.facultyEmails?.length || 0} faculty assigned`);
          
          // Delete with all associated data
          const result = await deleteYearCommitteeWithData(key, year);
          
          if (result.success) {
            yearsAffected.push(year);
            totalStudentsDeleted += result.studentsDeleted || 0;
            totalFacultiesAffected += result.facultiesAffected || 0;
          }
        } else {
          console.log(`ℹ️ Committee "${key}" not found in year ${year}`);
        }
      } catch (yearError) {
        console.error(`⚠️ Error processing year ${year}:`, yearError);
        // Continue with other years even if one fails
      }
    }
    
    // Step 3: Delete the base committee template
    const baseDocRef = doc(db, 'baseCommittees', key);
    await deleteDoc(baseDocRef);
    console.log(`✅ Deleted base committee template: ${key}`);
    
    console.log(`\n🎉 COMPLETE DELETION SUMMARY for "${key}":`);
    console.log(`   ✅ Years affected: ${yearsAffected.length} (${yearsAffected.join(', ')})`);
    console.log(`   ✅ Total students deleted: ${totalStudentsDeleted}`);
    console.log(`   ✅ Total faculties affected: ${totalFacultiesAffected}`);
    console.log(`   ✅ Base template deleted`);
    
    return { 
      success: true,
      yearsAffected,
      totalStudentsDeleted,
      totalFacultiesAffected
    };
  } catch (error) {
    console.error('❌ Error in complete committee deletion:', error);
    return { 
      success: false, 
      error: `Failed to delete committee completely: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};
