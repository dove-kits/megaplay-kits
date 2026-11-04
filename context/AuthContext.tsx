'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase/config';
import { isKarunyaEmail } from '@/lib/validators/emailValidator';
import { createOrUpdateUserDocument, UserData } from '@/lib/services/userService';

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

  // Remembers the in-flight / finished Firestore sync per uid so that
  // React Strict Mode (dev) or repeated auth callbacks never sync twice.
  const syncRef = useRef<{ uid: string; promise: Promise<UserData> } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        if (!isKarunyaEmail(firebaseUser.email)) {
          console.log('Invalid email domain, signing out');
          syncRef.current = null;
          await firebaseSignOut(auth);
          setUser(null);
          setUserData(null);
        } else {
          setUser(firebaseUser);

          try {
            if (!syncRef.current || syncRef.current.uid !== firebaseUser.uid) {
              syncRef.current = {
                uid: firebaseUser.uid,
                promise: createOrUpdateUserDocument(firebaseUser),
              };
            }
            const firestoreUserData = await syncRef.current.promise;
            setUserData(firestoreUserData);
          } catch (error) {
            console.error('Failed to sync user data:', error);
            syncRef.current = null; // allow retry on next auth event
          }
        }
      } else {
        syncRef.current = null;
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

      if (!result.user.email || !isKarunyaEmail(result.user.email)) {
        await firebaseSignOut(auth);
        throw new Error(
          'Only Karunya emails are allowed (@karunya.edu, @karunya.edu.in, @kate.academy, @kate.education)'
        );
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
      syncRef.current = null;
      await firebaseSignOut(auth);
      setUserData(null);
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
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
