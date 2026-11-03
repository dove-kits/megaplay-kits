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
  year: string; // ✅ NEW: Year assignment
}

export const createOrUpdateUserDocument = async (user: User): Promise<UserData> => {
  const settings = await getAppSettings();
  const currentYear = settings?.currentYear || new Date().getFullYear().toString();
  
  // Main users collection (global)
  const userRef = doc(db, 'users', user.uid);
  
  try {
    const userDoc = await getDoc(userRef);
    
    const isSuperAdminUser = isSuperAdmin(user.email);
    const role = isSuperAdminUser ? 'superadmin' : 'student';
    
    const userData: UserData = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: userDoc.exists() ? userDoc.data()?.createdAt : serverTimestamp(),
      lastLogin: serverTimestamp(),
      role,
      isActive: true,
      year: currentYear, // ✅ Assign to current year
    };
    
    await setDoc(userRef, userData);
    
    // Also save to year-specific users collection
    const yearUserRef = doc(db, getYearCollectionName('users', currentYear), user.uid);
    await setDoc(yearUserRef, userData);
    
    console.log(`✅ User ${user.email} assigned to year ${currentYear}`);
    return userData;
  } catch (error) {
    console.error('❌ Error creating/updating user document:', error);
    throw error;
  }
};
