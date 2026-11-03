// lib/services/sessionService.ts
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';

export interface Session {
  sessionId: string;
  date: string; // YYYY-MM-DD format
  sessionNumber: number;
  name: string;
  createdBy: string;
  createdAt: any;
  status: 'active' | 'completed' | 'cancelled';
  attendanceCount: number;
  year: string;
}

// Create multiple sessions for a date
export const createSessions = async (
  year: string,
  date: string,
  sessionNames: string[], // Array of names like ["Morning Practice", "Afternoon", ...]
  createdBy: string
): Promise<void> => {
  const colName = getYearCollectionName('sessions', year);
  const batch = writeBatch(db);

  sessionNames.forEach((name, index) => {
    const sessionId = `session_${date.replace(/-/g, '')}_${index + 1}`;
    const ref = doc(db, colName, sessionId);

    const sessionData: Session = {
      sessionId,
      date,
      sessionNumber: index + 1,
      name: name.trim() || `Session ${index + 1}`,
      createdBy,
      createdAt: serverTimestamp(),
      status: 'active',
      attendanceCount: 0,
      year,
    };

    batch.set(ref, sessionData);
  });

  await batch.commit();
  console.log(`✅ Created ${sessionNames.length} sessions for ${date}`);
};

// Get sessions by date
export const getSessionsByDate = async (
  year: string,
  date: string
): Promise<Session[]> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    
    // Simple query without orderBy to avoid index requirement
    const q = query(
      collection(db, colName),
      where('date', '==', date)
    );
    const snap = await getDocs(q);

    const sessions: Session[] = [];
    snap.forEach((d) => {
      const data = d.data() as Session;
      // Validate data before adding
      if (data && data.sessionId && data.date) {
        sessions.push(data);
      }
    });

    // Sort in memory by sessionNumber
    sessions.sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0));

    return sessions;
  } catch (error) {
    console.error('Error getting sessions by date:', error);
    return [];
  }
};

// Get all sessions for a year (grouped by date)
export const getAllSessions = async (year: string): Promise<Session[]> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    
    // Simple query without orderBy
    const snap = await getDocs(collection(db, colName));

    const sessions: Session[] = [];
    snap.forEach((d) => {
      if (d.id === 'metadata') return;
      
      const data = d.data() as Session;
      
      // Validate that essential fields exist
      if (data && data.sessionId && data.date && typeof data.date === 'string') {
        sessions.push(data);
      } else {
        console.warn(`Invalid session data found for document ${d.id}:`, data);
      }
    });

    // Sort in memory by date (descending) and sessionNumber with null safety
    sessions.sort((a, b) => {
      // Ensure both dates exist and are strings
      const dateA = a.date || '';
      const dateB = b.date || '';
      
      if (dateA === dateB) {
        return (a.sessionNumber || 0) - (b.sessionNumber || 0);
      }
      
      // Handle empty dates
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      return dateB.localeCompare(dateA); // Descending date order
    });

    return sessions;
  } catch (error) {
    console.error('Error getting all sessions:', error);
    return [];
  }
};

// Get single session by ID
export const getSessionById = async (
  year: string,
  sessionId: string
): Promise<Session | null> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const ref = doc(db, colName, sessionId);
    const snap = await getDoc(ref);
    
    if (!snap.exists()) {
      return null;
    }
    
    const data = snap.data() as Session;
    
    // Validate data
    if (!data.sessionId || !data.date) {
      console.error('Invalid session data:', data);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting session by ID:', error);
    return null;
  }
};

// Update session name
export const updateSessionName = async (
  year: string,
  sessionId: string,
  newName: string
): Promise<void> => {
  try {
    if (!newName || !newName.trim()) {
      throw new Error('Session name cannot be empty');
    }
    
    const colName = getYearCollectionName('sessions', year);
    const ref = doc(db, colName, sessionId);
    
    await updateDoc(ref, { name: newName.trim() });
    console.log('✅ Session name updated:', sessionId);
  } catch (error) {
    console.error('Error updating session name:', error);
    throw error;
  }
};

// Check if session has attendance records
export const checkSessionAttendance = async (
  year: string,
  sessionId: string
): Promise<{ hasAttendance: boolean; count: number }> => {
  try {
    const colName = getYearCollectionName('attendance', year);
    const q = query(collection(db, colName), where('sessionId', '==', sessionId));
    const snap = await getDocs(q);

    return {
      hasAttendance: !snap.empty,
      count: snap.size,
    };
  } catch (error) {
    console.error('Error checking session attendance:', error);
    return { hasAttendance: false, count: 0 };
  }
};

// Delete session (and optionally attendance)
export const deleteSession = async (
  year: string,
  sessionId: string,
  deleteAttendance: boolean = false
): Promise<void> => {
  try {
    const sessionColName = getYearCollectionName('sessions', year);
    const attendanceColName = getYearCollectionName('attendance', year);

    if (deleteAttendance) {
      // Delete session and all attendance records
      const batch = writeBatch(db);

      // Delete session
      batch.delete(doc(db, sessionColName, sessionId));

      // Get and delete all attendance records
      const q = query(
        collection(db, attendanceColName),
        where('sessionId', '==', sessionId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => {
        batch.delete(d.ref);
      });

      await batch.commit();
      console.log(`✅ Session ${sessionId} and ${snap.size} attendance records deleted`);
    } else {
      // Delete session only
      await deleteDoc(doc(db, sessionColName, sessionId));
      console.log('✅ Session deleted:', sessionId);
    }
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
};

// Auto-update session status based on date
export const updateSessionStatus = async (year: string): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const colName = getYearCollectionName('sessions', year);
    
    // Query only by status (simpler, no index needed)
    const q = query(
      collection(db, colName),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);

    // Filter in memory for date < today with null safety
    const sessionsToUpdate = snap.docs.filter(doc => {
      const data = doc.data();
      // Ensure date exists and is a valid string
      return data && data.date && typeof data.date === 'string' && data.date < today;
    });

    if (sessionsToUpdate.length === 0) {
      console.log('No sessions to update');
      return;
    }

    const batch = writeBatch(db);
    sessionsToUpdate.forEach((doc) => {
      batch.update(doc.ref, { status: 'completed' });
    });

    await batch.commit();
    console.log(`✅ Updated ${sessionsToUpdate.length} sessions to completed`);
  } catch (error) {
    console.error('Error updating session status:', error);
  }
};

// Get sessions count by status
export const getSessionsCountByStatus = async (
  year: string
): Promise<{ active: number; completed: number; cancelled: number; total: number }> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const snap = await getDocs(collection(db, colName));

    let active = 0;
    let completed = 0;
    let cancelled = 0;
    let total = 0;

    snap.forEach((d) => {
      if (d.id === 'metadata') return;
      
      const data = d.data();
      if (!data.sessionId) return;
      
      total++;
      
      switch (data.status) {
        case 'active':
          active++;
          break;
        case 'completed':
          completed++;
          break;
        case 'cancelled':
          cancelled++;
          break;
      }
    });

    return { active, completed, cancelled, total };
  } catch (error) {
    console.error('Error getting sessions count:', error);
    return { active: 0, completed: 0, cancelled: 0, total: 0 };
  }
};

// Get sessions for today
export const getTodaySessions = async (year: string): Promise<Session[]> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    return await getSessionsByDate(year, today);
  } catch (error) {
    console.error('Error getting today sessions:', error);
    return [];
  }
};

// Cancel a session
export const cancelSession = async (
  year: string,
  sessionId: string
): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const ref = doc(db, colName, sessionId);
    
    await updateDoc(ref, { status: 'cancelled' });
    console.log('✅ Session cancelled:', sessionId);
  } catch (error) {
    console.error('Error cancelling session:', error);
    throw error;
  }
};

// Reactivate a session
export const reactivateSession = async (
  year: string,
  sessionId: string
): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const ref = doc(db, colName, sessionId);
    
    await updateDoc(ref, { status: 'active' });
    console.log('✅ Session reactivated:', sessionId);
  } catch (error) {
    console.error('Error reactivating session:', error);
    throw error;
  }
};

// Update attendance count for a session
export const updateSessionAttendanceCount = async (
  year: string,
  sessionId: string,
  count: number
): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const ref = doc(db, colName, sessionId);
    
    await updateDoc(ref, { attendanceCount: count });
  } catch (error) {
    console.error('Error updating attendance count:', error);
    throw error;
  }
};
// Create a single session for a date (for adding to existing dates)
export const createSingleSession = async (
  year: string,
  date: string,
  sessionNumber: number,
  sessionName: string,
  createdBy: string
): Promise<void> => {
  const colName = getYearCollectionName('sessions', year);
  
  // Generate unique session ID using timestamp to avoid conflicts
  const timestamp = Date.now();
  const sessionId = `session_${date.replace(/-/g, '')}_${sessionNumber}_${timestamp}`;
  const ref = doc(db, colName, sessionId);

  const sessionData: Session = {
    sessionId,
    date,
    sessionNumber,
    name: sessionName.trim() || `New Session ${sessionNumber}`,
    createdBy,
    createdAt: serverTimestamp(),
    status: 'active',
    attendanceCount: 0,
    year,
  };

  await setDoc(ref, sessionData);
  console.log(`✅ Created session ${sessionNumber} for ${date}`);
};
