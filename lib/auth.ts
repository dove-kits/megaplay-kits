import { auth, db } from './firebase/config';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';

const ALLOWED_DOMAINS = ['karunya.edu', 'karunya.edu.in', 'kate.academy', 'kate.education'];
const ADMIN_EMAIL = '@karunya.edu.in';

export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Validate email domain
    const emailDomain = user.email?.split('@')[1];
    if (!emailDomain || !ALLOWED_DOMAINS.includes(emailDomain)) {
      await signOut(auth);
      throw new Error('Email domain not allowed. Only @karunya.edu, @karunya.edu.in, @kate.academy, @kate.education allowed.');
    }

    // Save user to Firestore
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      isAdmin: user.email === ADMIN_EMAIL,
      createdAt: new Date().toISOString(),
    }, { merge: true });

    return { user, isAdmin: user.email === ADMIN_EMAIL };
  } catch (error: any) {
    console.error('Auth error:', error);
    throw error;
  }
};

export const logout = () => signOut(auth);
