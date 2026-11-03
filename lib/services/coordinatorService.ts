// lib/services/coordinatorService.ts
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

export interface Coordinator {
  email: string;
  assignedBy: string;
  assignedAt: any;
  isActive: boolean;
  year: string;
  isDeleting?: boolean; // Optional: for UI loading state
}

// Check if user is coordinator
export const isCoordinator = async (
  email: string,
  year: string
): Promise<boolean> => {
  try {
    const colName = getYearCollectionName('attendance_coordinators', year);
    const ref = doc(db, colName, email.toLowerCase());
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      return data.isActive === true;
    }
    return false;
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
    const colName = getYearCollectionName('attendance_coordinators', year);
    const snap = await getDocs(collection(db, colName));

    const result: Coordinator[] = [];
    snap.forEach((d) => {
      if (d.id === 'metadata') return;
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
    const colName = getYearCollectionName('attendance_coordinators', year);
    const ref = doc(db, colName, email.toLowerCase());

    const data: Coordinator = {
      email: email.toLowerCase(),
      assignedBy,
      assignedAt: serverTimestamp(),
      isActive: true,
      year,
    };

    await setDoc(ref, data);
    console.log('✅ Coordinator assigned:', email);
  } catch (error) {
    console.error('❌ Error assigning coordinator:', error);
    throw error;
  }
};

// Remove coordinator and all associated data
export const removeCoordinator = async (
  year: string,
  email: string
): Promise<void> => {
  try {
    const emailLower = email.toLowerCase();
    
    console.log('🗑️  Starting coordinator removal for:', email);
    
    // Step 1: Remove from attendance_coordinators collection
    const coordinatorColName = getYearCollectionName('attendance_coordinators', year);
    const coordinatorRef = doc(db, coordinatorColName, emailLower);
    await deleteDoc(coordinatorRef);
    console.log('✅ [1/4] Coordinator removed from attendance_coordinators');

    // Step 2: Find and remove student profile(s) by querying email
    // Student docs use regno as ID, so we must query by email field
    const studentsColName = getYearCollectionName('students', year);
    const studentsRef = collection(db, studentsColName);
    const studentQuery = query(studentsRef, where('email', '==', emailLower));
    const studentSnapshot = await getDocs(studentQuery);

    if (!studentSnapshot.empty) {
      const deletePromises = studentSnapshot.docs.map((docSnap) => {
        console.log(`   → Deleting student profile: ${docSnap.id}`);
        return deleteDoc(docSnap.ref);
      });
      await Promise.all(deletePromises);
      console.log(`✅ [2/4] Student profile(s) deleted (${studentSnapshot.size} found)`);
    } else {
      console.log('⚠️  [2/4] No student profile found for:', email);
    }

    // Step 3: Update year-specific users collection
    const yearUsersColName = getYearCollectionName('users', year);
    const yearUserQuery = query(
      collection(db, yearUsersColName),
      where('email', '==', emailLower)
    );
    const yearUserSnapshot = await getDocs(yearUserQuery);

    if (!yearUserSnapshot.empty) {
      const updatePromises = yearUserSnapshot.docs.map((docSnap) => {
        console.log(`   → Updating year user: ${docSnap.id}`);
        return setDoc(
          docSnap.ref,
          {
            role: 'student',
            lastLogin: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await Promise.all(updatePromises);
      console.log(`✅ [3/4] Year-specific user role(s) updated (${yearUserSnapshot.size} found)`);
    } else {
      console.log('⚠️  [3/4] No year-specific user found for:', email);
    }

    // Step 4: Update global users collection
    const globalUserQuery = query(
      collection(db, 'users'),
      where('email', '==', emailLower)
    );
    const globalUserSnapshot = await getDocs(globalUserQuery);

    if (!globalUserSnapshot.empty) {
      const globalUpdatePromises = globalUserSnapshot.docs.map((docSnap) => {
        console.log(`   → Updating global user: ${docSnap.id}`);
        return setDoc(
          docSnap.ref,
          {
            role: 'student',
            lastLogin: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await Promise.all(globalUpdatePromises);
      console.log(`✅ [4/4] Global user role(s) updated (${globalUserSnapshot.size} found)`);
    } else {
      console.log('⚠️  [4/4] No global user found for:', email);
    }

    console.log('✨ Coordinator removal completed successfully for:', email);
  } catch (error) {
    console.error('❌ Error removing coordinator:', error);
    throw error;
  }
};

// Optional: Soft delete (deactivate instead of delete)
export const deactivateCoordinator = async (
  year: string,
  email: string
): Promise<void> => {
  try {
    const colName = getYearCollectionName('attendance_coordinators', year);
    const ref = doc(db, colName, email.toLowerCase());
    
    await setDoc(
      ref,
      {
        isActive: false,
        deactivatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    
    console.log('✅ Coordinator deactivated (soft delete):', email);
  } catch (error) {
    console.error('❌ Error deactivating coordinator:', error);
    throw error;
  }
};

// Optional: Reactivate a deactivated coordinator
export const reactivateCoordinator = async (
  year: string,
  email: string
): Promise<void> => {
  try {
    const colName = getYearCollectionName('attendance_coordinators', year);
    const ref = doc(db, colName, email.toLowerCase());
    
    await setDoc(
      ref,
      {
        isActive: true,
        reactivatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    
    console.log('✅ Coordinator reactivated:', email);
  } catch (error) {
    console.error('❌ Error reactivating coordinator:', error);
    throw error;
  }
};
