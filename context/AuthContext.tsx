'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  User, 
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase/config';
import { isKarunyaEmail } from '@/lib/validators/emailValidator';
import { createOrUpdateUserDocument, UserData } from '@/lib/services/userService';
import { isSuperAdmin } from '@/lib/utils/roleCheck';
import { getAppSettings } from '../lib/services/settingsService';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user?.email);
      
      if (user && user.email) {
        if (!isKarunyaEmail(user.email)) {
          console.log('Invalid email domain, signing out');
          await firebaseSignOut(auth);
          setUser(null);
          setUserData(null);
        } else {
          console.log('Valid user, setting state');
          setUser(user);
          
          // ✅ Get current year from settings
          const settings = await getAppSettings();
          console.log('Current year:', settings?.currentYear);
          
          try {
            const firestoreUserData = await createOrUpdateUserDocument(user);
            setUserData(firestoreUserData);
            console.log('User data synced with Firestore for year:', firestoreUserData.year);
          } catch (error) {
            console.error('Failed to sync user data:', error);
          }
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('Sign in successful:', result.user.email);
      
      if (!result.user.email || !isKarunyaEmail(result.user.email)) {
        await firebaseSignOut(auth);
        throw new Error('Only Karunya emails are allowed (@karunya.edu, @karunya.edu.in, @kate.academy, @kate.education)');
      }
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in popup was closed. Please try again.');
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUserData(null);
      console.log('User signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    userData,
    loading,
    signInWithGoogle,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
