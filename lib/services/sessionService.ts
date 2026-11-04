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
  getCountFromServer,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getYearCollectionName } from './settingsService';
import { TTLCache } from '../utils/ttlCache';

// Session lists change rarely: cache per year for 5 minutes.
// Every write in this file clears the cache for that year.
const sessionsCache = new TTLCache<Session[]>(5 * 60 * 1000);

// Summary doc cache (2 min). Cleared by every write below.
const summaryCache = new TTLCache<SessionsSummary>(2 * 60 * 1000);

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

/**
 * Sessions summary: { "2026-11-04": [1,2,3], "2026-11-03": [1,2] }
 * Only NON-cancelled sessions are listed.
 * Lives in ONE doc: years/{year}/meta/sessionsSummary
 * so student pages can learn "which dates / sessions exist" with 1 read
 * instead of reading every session document.
 */
export type SessionsSummary = Record<string, number[]>;

// Firestore allows 500 operations per batch; stay safely below.
const BATCH_LIMIT = 450;

// ---------- summary helpers ----------

const summaryRef = (year: string) =>
  doc(db, getYearCollectionName('meta', year), 'sessionsSummary');

const invalidate = (year: string) => {
  sessionsCache.delete(year);
  summaryCache.delete(year);
};

/**
 * Today's date as YYYY-MM-DD in the user's LOCAL timezone.
 * `new Date().toISOString()` is UTC, so in India (UTC+5:30) "today"
 * would still be yesterday between 12:00 AM and 5:30 AM.
 */
export const getLocalDateString = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Sessions summary (1 read, cached 2 min).
 * Returns {} if the doc does not exist yet (run rebuildSessionsSummary once
 * for years created before this change).
 */
export const getSessionsSummary = async (
  year: string,
  force = false
): Promise<SessionsSummary> => {
  if (!force) {
    const cached = summaryCache.get(year);
    if (cached) return cached;
  }

  try {
    const snap = await getDoc(summaryRef(year));
    const data = snap.exists() ? ((snap.data().dates || {}) as SessionsSummary) : {};
    summaryCache.set(year, data);
    return data;
  } catch (error) {
    console.error('Error getting sessions summary:', error);
    return {};
  }
};

/** Total non-cancelled sessions, computed from a summary (0 reads). */
export const getTotalSessionsFromSummary = (summary: SessionsSummary): number =>
  Object.values(summary).reduce((n, list) => n + (list?.length || 0), 0);

/** Dates that have at least one session, newest first (0 reads). */
export const getSummaryDates = (summary: SessionsSummary): string[] =>
  Object.keys(summary)
    .filter((d) => (summary[d] || []).length > 0)
    .sort((a, b) => b.localeCompare(a));

/**
 * ONE-TIME (per year) rebuild of the summary from the session documents.
 * Cost: 1 read per session + 1 write. Run it from an admin button for
 * years whose sessions were created before the summary existed.
 */
export const rebuildSessionsSummary = async (year: string): Promise<SessionsSummary> => {
  const sessions = await getAllSessions(year, true);

  const dates: SessionsSummary = {};
  sessions
    .filter((s) => s.status !== 'cancelled')
    .forEach((s) => {
      (dates[s.date] ||= []).push(s.sessionNumber);
    });
  Object.values(dates).forEach((list) => list.sort((a, b) => a - b));

  // Full replace (no merge) so stale dates disappear.
  await setDoc(summaryRef(year), { dates });
  summaryCache.delete(year);
  console.log(`✅ Rebuilt sessions summary for ${year} (${sessions.length} sessions)`);
  return dates;
};

/**
 * Find a session's date + number without a read when possible:
 *  1. the caller's hint,
 *  2. the cached session list,
 *  3. one getDoc (1 read) as a last resort.
 */
const resolveSession = async (
  year: string,
  sessionId: string,
  hint?: Pick<Session, 'date' | 'sessionNumber'>
): Promise<Pick<Session, 'date' | 'sessionNumber'> | null> => {
  if (hint?.date && hint.sessionNumber) return hint;

  const cached = sessionsCache.get(year)?.find((s) => s.sessionId === sessionId);
  if (cached) return { date: cached.date, sessionNumber: cached.sessionNumber };

  const snap = await getDoc(doc(db, getYearCollectionName('sessions', year), sessionId));
  if (!snap.exists()) return null;
  const data = snap.data() as Session;
  return { date: data.date, sessionNumber: data.sessionNumber };
};

// ---------- sessions ----------

// Create multiple sessions for a date (sessions + summary in ONE batch)
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

  // Summary: replace this date's list (merge keeps the other dates)
  batch.set(
    summaryRef(year),
    { dates: { [date]: sessionNames.map((_, i) => i + 1) } },
    { merge: true }
  );

  await batch.commit();
  invalidate(year);
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

// Get all sessions for a year (1 read per session, then cached 5 min)
export const getAllSessions = async (year: string, force = false): Promise<Session[]> => {
  if (!force) {
    const cached = sessionsCache.get(year);
    if (cached) return [...cached];
  }

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

    sessionsCache.set(year, sessions);
    return [...sessions];
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

// Update session name (summary only stores numbers, so no summary change)
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
    invalidate(year);
  } catch (error) {
    console.error('Error updating session name:', error);
    throw error;
  }
};

/**
 * Check if a session has attendance records.
 * Uses a COUNT aggregation: ~1 read in total instead of 1 read per record.
 */
export const checkSessionAttendance = async (
  year: string,
  sessionId: string
): Promise<{ hasAttendance: boolean; count: number }> => {
  try {
    const colName = getYearCollectionName('attendance', year);
    const snap = await getCountFromServer(
      query(collection(db, colName), where('sessionId', '==', sessionId))
    );
    const count = snap.data().count;

    return { hasAttendance: count > 0, count };
  } catch (error) {
    console.error('Error checking session attendance:', error);
    return { hasAttendance: false, count: 0 };
  }
};

/**
 * Delete session (and optionally its attendance).
 * A single batch is limited to 500 operations, so attendance is deleted in
 * chunks. The session doc + summary entry are removed last (in one batch)
 * so a failed run can be retried.
 *
 * `sessionHint` (date + sessionNumber) avoids an extra read; the manage page
 * can pass the Session object it already has.
 */
export const deleteSession = async (
  year: string,
  sessionId: string,
  deleteAttendance: boolean = false,
  sessionHint?: Pick<Session, 'date' | 'sessionNumber'>
): Promise<void> => {
  try {
    const sessionColName = getYearCollectionName('sessions', year);
    const attendanceColName = getYearCollectionName('attendance', year);

    const info = await resolveSession(year, sessionId, sessionHint);

    let removedAttendance = 0;
    if (deleteAttendance) {
      const snap = await getDocs(
        query(collection(db, attendanceColName), where('sessionId', '==', sessionId))
      );

      for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      removedAttendance = snap.size;
    }

    const finalBatch = writeBatch(db);
    finalBatch.delete(doc(db, sessionColName, sessionId));
    if (info) {
      finalBatch.set(
        summaryRef(year),
        { dates: { [info.date]: arrayRemove(info.sessionNumber) } },
        { merge: true }
      );
    }
    await finalBatch.commit();

    invalidate(year);
    console.log(
      deleteAttendance
        ? `✅ Session ${sessionId} and ${removedAttendance} attendance records deleted`
        : `✅ Session deleted: ${sessionId}`
    );
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
 * (Completed sessions stay in the summary: only cancelled ones are removed.)
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
      invalidate(year);
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

/**
 * Sessions count by status.
 * Uses the cached session list instead of re-reading the whole collection.
 */
export const getSessionsCountByStatus = async (
  year: string
): Promise<{ active: number; completed: number; cancelled: number; total: number }> => {
  try {
    const sessions = await getAllSessions(year);

    const counts = { active: 0, completed: 0, cancelled: 0, total: sessions.length };
    sessions.forEach((s) => {
      if (s.status === 'active') counts.active++;
      else if (s.status === 'completed') counts.completed++;
      else if (s.status === 'cancelled') counts.cancelled++;
    });

    return counts;
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

/**
 * Cancel a session: status + summary entry in one batch.
 * `sessionHint` is optional (saves a read if the session is not cached).
 */
export const cancelSession = async (
  year: string,
  sessionId: string,
  sessionHint?: Pick<Session, 'date' | 'sessionNumber'>
): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const info = await resolveSession(year, sessionId, sessionHint);

    const batch = writeBatch(db);
    batch.update(doc(db, colName, sessionId), { status: 'cancelled' });
    if (info) {
      batch.set(
        summaryRef(year),
        { dates: { [info.date]: arrayRemove(info.sessionNumber) } },
        { merge: true }
      );
    }
    await batch.commit();

    invalidate(year);
  } catch (error) {
    console.error('Error cancelling session:', error);
    throw error;
  }
};

/**
 * Reactivate a session: status + summary entry in one batch.
 * `sessionHint` is optional (saves a read if the session is not cached).
 */
export const reactivateSession = async (
  year: string,
  sessionId: string,
  sessionHint?: Pick<Session, 'date' | 'sessionNumber'>
): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const info = await resolveSession(year, sessionId, sessionHint);

    const batch = writeBatch(db);
    batch.update(doc(db, colName, sessionId), { status: 'active' });
    if (info) {
      batch.set(
        summaryRef(year),
        { dates: { [info.date]: arrayUnion(info.sessionNumber) } },
        { merge: true }
      );
    }
    await batch.commit();

    invalidate(year);
  } catch (error) {
    console.error('Error reactivating session:', error);
    throw error;
  }
};

// Update attendance count for a session
// NOTE: avoid calling this on every mark (hot document). Prefer
// checkSessionAttendance() (COUNT query) when a count is needed.
export const updateSessionAttendanceCount = async (
  year: string,
  sessionId: string,
  count: number
): Promise<void> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    await updateDoc(doc(db, colName, sessionId), { attendanceCount: count });
    invalidate(year);
  } catch (error) {
    console.error('Error updating attendance count:', error);
    throw error;
  }
};

/**
 * Create a single session for a date (for adding to existing dates).
 * Session doc + summary entry are written in one batch.
 * Returns the created session so the UI can append it without re-reading.
 */
export const createSingleSession = async (
  year: string,
  date: string,
  sessionNumber: number,
  sessionName: string,
  createdBy: string
): Promise<Session> => {
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

  const batch = writeBatch(db);
  batch.set(ref, sessionData);
  batch.set(
    summaryRef(year),
    { dates: { [date]: arrayUnion(sessionNumber) } },
    { merge: true }
  );
  await batch.commit();

  invalidate(year);
  console.log(`✅ Created session ${sessionNumber} for ${date}`);

  return sessionData;
};

/**
 * Number of sessions in a year using a COUNT aggregation:
 * costs ~1 read in total instead of 1 read per session.
 * `date >= '0'` skips placeholder docs (e.g. "_init") that have no date.
 *
 * NOTE: this counts cancelled sessions too. For student-facing percentages
 * prefer getTotalSessionsFromSummary(await getSessionsSummary(year)),
 * which excludes cancelled sessions and needs no aggregation query.
 */
export const getSessionCount = async (year: string): Promise<number> => {
  try {
    const colName = getYearCollectionName('sessions', year);
    const snap = await getCountFromServer(
      query(collection(db, colName), where('date', '>=', '0'))
    );
    return snap.data().count;
  } catch (error) {
    console.error('Error counting sessions:', error);
    return 0;
  }
};
