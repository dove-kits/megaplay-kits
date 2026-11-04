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

// Firestore allows 500 operations per batch; stay safely below.
const BATCH_LIMIT = 450;

/**
 * Today's date as YYYY-MM-DD in the user's LOCAL timezone.
 * FIX: `new Date().toISOString()` is UTC, so in India (UTC+5:30) "today"
 * was still yesterday between 12:00 AM and 5:30 AM.
 */
export const getLocalDateString = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Create multiple sessions for a date
export const createSessions = async (
  year: string,
  date: string,
  sessionNames: string[],
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
    const snap = await getDocs(query(collection(db, colName), where('date', '==', date)));

    const sessions: Session[] = [];
    snap.forEach((d) => {
      const data = d.data() as Session;
      if (data && data.sessionId && data.date) sessions.push(data);
    });

    sessions.sort((a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0));
    return sessions;
  } catch (error) {
    console.error('Error getting sessions by date:', error);
    return [];
  }
};

// Get all sessions for a year (1 read per session)
export const getAllSessions = async (year: string): Promise<Session[]> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const snap = await getDocs(collection(db, colName));

    const sessions: Session[] = [];
    snap.forEach((d) => {
      if (d.id === 'metadata' || d.id === '_init') return;

      const data = d.data() as Session;
      if (data && data.sessionId && data.date && typeof data.date === 'string') {
        sessions.push(data);
      } else {
        console.warn(`Invalid session data found for document ${d.id}:`, data);
      }
    });

    sessions.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';

      if (dateA === dateB) return (a.sessionNumber || 0) - (b.sessionNumber || 0);
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA); // newest date first
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
    const snap = await getDoc(doc(db, colName, sessionId));

    if (!snap.exists()) return null;

    const data = snap.data() as Session;
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
    await updateDoc(doc(db, colName, sessionId), { name: newName.trim() });
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
    const snap = await getDocs(
      query(collection(db, colName), where('sessionId', '==', sessionId))
    );

    return { hasAttendance: !snap.empty, count: snap.size };
  } catch (error) {
    console.error('Error checking session attendance:', error);
    return { hasAttendance: false, count: 0 };
  }
};

/**
 * Delete session (and optionally its attendance).
 * FIX: a single batch is limited to 500 operations. A session with ~500
 * attendance records + the session doc exceeded that and failed. Attendance
 * is now deleted in chunks, and the session doc is removed last so a failed
 * run can simply be retried.
 */
export const deleteSession = async (
  year: string,
  sessionId: string,
  deleteAttendance: boolean = false
): Promise<void> => {
  try {
    const sessionColName = getYearCollectionName('sessions', year);
    const attendanceColName = getYearCollectionName('attendance', year);

    if (deleteAttendance) {
      const snap = await getDocs(
        query(collection(db, attendanceColName), where('sessionId', '==', sessionId))
      );

      for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      await deleteDoc(doc(db, sessionColName, sessionId));
      console.log(`✅ Session ${sessionId} and ${snap.size} attendance records deleted`);
    } else {
      await deleteDoc(doc(db, sessionColName, sessionId));
      console.log('✅ Session deleted:', sessionId);
    }
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
};

/**
 * Auto-complete sessions whose date has passed.
 *
 * This reads ALL active sessions, so it is throttled to once per local day
 * per browser. Pass `force = true` to run it immediately.
 */
export const updateSessionStatus = async (
  year: string,
  force: boolean = false
): Promise<void> => {
  const today = getLocalDateString();
  const throttleKey = `sessionStatusSync:${year}`;

  if (!force && typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem(throttleKey) === today) return;
    } catch {
      /* storage unavailable: just run */
    }
  }

  try {
    const colName = getYearCollectionName('sessions', year);
    const snap = await getDocs(
      query(collection(db, colName), where('status', '==', 'active'))
    );

    const sessionsToUpdate = snap.docs.filter((d) => {
      const data = d.data();
      return data && data.date && typeof data.date === 'string' && data.date < today;
    });

    for (let i = 0; i < sessionsToUpdate.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      sessionsToUpdate.slice(i, i + BATCH_LIMIT).forEach((d) => {
        batch.update(d.ref, { status: 'completed' });
      });
      await batch.commit();
    }

    if (sessionsToUpdate.length > 0) {
      console.log(`✅ Updated ${sessionsToUpdate.length} sessions to completed`);
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(throttleKey, today);
      } catch {
        /* ignore */
      }
    }
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
      if (d.id === 'metadata' || d.id === '_init') return;

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

// Get sessions for today (local timezone)
export const getTodaySessions = async (year: string): Promise<Session[]> => {
  try {
    return await getSessionsByDate(year, getLocalDateString());
  } catch (error) {
    console.error('Error getting today sessions:', error);
    return [];
  }
};

// Cancel a session
export const cancelSession = async (year: string, sessionId: string): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    await updateDoc(doc(db, colName, sessionId), { status: 'cancelled' });
  } catch (error) {
    console.error('Error cancelling session:', error);
    throw error;
  }
};

// Reactivate a session
export const reactivateSession = async (year: string, sessionId: string): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    await updateDoc(doc(db, colName, sessionId), { status: 'active' });
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
    await updateDoc(doc(db, colName, sessionId), { attendanceCount: count });
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

  // Unique ID using timestamp to avoid conflicts
  const sessionId = `session_${date.replace(/-/g, '')}_${sessionNumber}_${Date.now()}`;
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
