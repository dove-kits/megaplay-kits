import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAor06npcNNLn7SU-y1CckxiliHFVzcsN8",
  authDomain: "megaplay-kits.firebaseapp.com",
  projectId: "megaplay-kits",
  storageBucket: "megaplay-kits.firebasestorage.app",
  messagingSenderId: "385865651960",
  appId: "1:385865651960:web:b1f0a3e28ae19d70a50d0d"
};

// Initialize Firebase (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Force account selection on every sign-in
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
