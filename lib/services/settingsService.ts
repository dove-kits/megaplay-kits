// lib/services/settingsService.ts
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * App-wide settings interface
 */
export interface AppSettings {
  // Year management
  currentYear: string;
  availableYears: string[];

  // Registration control
  registrationOpen: boolean;

  // Committee and organizational data
  activeCommittees: string[];
  departments: string[];
  hostels: string[];

  // Metadata
  isInitialized: boolean;
  lastModifiedBy?: string;
  lastModifiedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
}

// Constants
export const SETTINGS_DOC_PATH = 'settings/app';
const DEFAULT_DEPARTMENTS = ['CSE', 'ECE', 'MECH', 'EEE', 'CIVIL', 'IT'];
const DEFAULT_HOSTELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Ladies'];

/**
 * Remove undefined values from an object (Firestore rejects undefined)
 */
const removeUndefined = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const cleaned: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) cleaned[key] = obj[key];
  });
  return cleaned;
};

const withModifier = (
  data: Partial<AppSettings>,
  modifiedBy?: string
): Partial<AppSettings> => (modifiedBy ? { ...data, lastModifiedBy: modifiedBy } : data);

const sortYearsDesc = (years: string[]) => [...years].sort((a, b) => b.localeCompare(a));

// ===========================
// CACHE (biggest read saver)
// ===========================
// Settings are read on every page / every login. They change rarely, so we
// keep them in memory for a few minutes and share one in-flight request
// between callers (this also neutralises React Strict Mode double effects).
const SETTINGS_TTL_MS = 5 * 60 * 1000;
let settingsCache: { data: AppSettings | null; at: number } | null = null;
let settingsInFlight: Promise<AppSettings | null> | null = null;

export const clearSettingsCache = () => {
  settingsCache = null;
  settingsInFlight = null;
};

/**
 * Get app settings (cached for 5 minutes).
 * @param force - bypass the cache (use for admin read-modify-write operations)
 */
export const getAppSettings = async (force = false): Promise<AppSettings | null> => {
  if (!force) {
    if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
      return settingsCache.data;
    }
    if (settingsInFlight) return settingsInFlight;
  }

  const request = (async () => {
    try {
      const snap = await getDoc(doc(db, SETTINGS_DOC_PATH));
      const data = snap.exists() ? (snap.data() as AppSettings) : null;
      if (!data) console.warn('⚠️ App settings document does not exist');
      settingsCache = { data, at: Date.now() };
      return data;
    } catch (error) {
      console.error('❌ Error getting app settings:', error);
      throw new Error('Failed to retrieve app settings');
    } finally {
      settingsInFlight = null;
    }
  })();

  settingsInFlight = request;
  return request;
};

const buildDefaultSettings = (updates: Partial<AppSettings>) => {
  const fallbackYear = updates.currentYear || new Date().getFullYear().toString();
  const defaults: any = {
    currentYear: fallbackYear,
    availableYears: updates.availableYears || [fallbackYear],
    registrationOpen: updates.registrationOpen ?? false,
    activeCommittees: updates.activeCommittees || [],
    departments: updates.departments || DEFAULT_DEPARTMENTS,
    hostels: updates.hostels || DEFAULT_HOSTELS,
    isInitialized: updates.isInitialized ?? true,
  };
  if (updates.lastModifiedBy) defaults.lastModifiedBy = updates.lastModifiedBy;
  return defaults;
};

/**
 * Create initial app settings (ONLY for first-time setup)
 */
export const createAppSettings = async (
  year: string,
  modifiedBy?: string
): Promise<AppSettings> => {
  try {
    const existing = await getAppSettings(true);

    if (existing && existing.isInitialized) {
      const availableYears = existing.availableYears || [];
      const updatedYears = availableYears.includes(year)
        ? availableYears
        : sortYearsDesc([...availableYears, year]);

      await updateAppSettings(
        withModifier(
          { currentYear: year, availableYears: updatedYears, isInitialized: true },
          modifiedBy
        )
      );

      return {
        ...existing,
        currentYear: year,
        availableYears: updatedYears,
        isInitialized: true,
        ...(modifiedBy && { lastModifiedBy: modifiedBy }),
      };
    }

    const newSettings: any = {
      ...buildDefaultSettings({ currentYear: year, availableYears: [year], lastModifiedBy: modifiedBy }),
      registrationOpen: false,
      createdAt: Timestamp.now(),
      lastModifiedAt: Timestamp.now(),
    };

    await setDoc(doc(db, SETTINGS_DOC_PATH), {
      ...newSettings,
      createdAt: serverTimestamp(),
      lastModifiedAt: serverTimestamp(),
    });

    clearSettingsCache();
    console.log('✅ Created new app settings for year:', year);
    return newSettings as AppSettings;
  } catch (error) {
    console.error('❌ Error creating app settings:', error);
    throw new Error('Failed to create app settings');
  }
};

/**
 * Update app settings.
 * Previously this did a getDoc + write (2 operations). Now it is a single
 * write; it only creates the document with defaults if it doesn't exist.
 */
export const updateAppSettings = async (
  updates: Partial<AppSettings>
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settingsRef = doc(db, SETTINGS_DOC_PATH);
    const cleanedUpdates = removeUndefined({
      ...updates,
      lastModifiedAt: serverTimestamp(),
    });

    try {
      await updateDoc(settingsRef, cleanedUpdates);
    } catch (err: any) {
      if (err?.code !== 'not-found') throw err;

      await setDoc(settingsRef, {
        ...buildDefaultSettings(updates),
        createdAt: serverTimestamp(),
        lastModifiedAt: serverTimestamp(),
      });
      console.log('✅ Created new settings document with updates');
    }

    // Invalidate so this tab immediately sees the new values.
    // (Other devices pick the change up within the 5 minute TTL.)
    clearSettingsCache();
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating app settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings',
    };
  }
};

/**
 * Update only the current year
 */
export const updateCurrentYear = async (
  year: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings(true);
    const existingYears = settings?.availableYears || [];
    const availableYears = existingYears.includes(year)
      ? existingYears
      : sortYearsDesc([...existingYears, year]);

    return await updateAppSettings(
      withModifier({ currentYear: year, availableYears, isInitialized: true }, modifiedBy)
    );
  } catch (error) {
    console.error('❌ Error updating current year:', error);
    return { success: false, error: 'Failed to update current year' };
  }
};

/**
 * Toggle registration status
 */
export const toggleRegistration = async (
  isOpen: boolean,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> =>
  updateAppSettings(withModifier({ registrationOpen: isOpen }, modifiedBy));

/**
 * Activate/update committees
 */
export const activateCommittees = async (
  committees: string[],
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> =>
  updateAppSettings(
    withModifier({ activeCommittees: committees, isInitialized: true }, modifiedBy)
  );

/**
 * Add a new year to available years
 */
export const addAvailableYear = async (
  year: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings(true);
    if (!settings) return { success: false, error: 'Settings not initialized' };

    const existingYears = settings.availableYears || [];
    if (existingYears.includes(year)) return { success: true };

    return await updateAppSettings(
      withModifier({ availableYears: sortYearsDesc([...existingYears, year]) }, modifiedBy)
    );
  } catch (error) {
    console.error('❌ Error adding available year:', error);
    return { success: false, error: 'Failed to add year' };
  }
};

// ===========================
// LIST HELPERS (departments / hostels / committees)
// ===========================
type ListKey = 'departments' | 'hostels' | 'activeCommittees';

/**
 * Read-modify-write for a list field. `mutate` returns the new list,
 * or a string which is treated as a validation error.
 * Always reads fresh data (force) to avoid overwriting with stale cache.
 */
const updateList = async (
  key: ListKey,
  mutate: (current: string[]) => string[] | string,
  failureMessage: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings(true);
    if (!settings) return { success: false, error: 'Settings not initialized' };

    const result = mutate(settings[key] || []);
    if (typeof result === 'string') return { success: false, error: result };

    return await updateAppSettings(
      withModifier({ [key]: result } as Partial<AppSettings>, modifiedBy)
    );
  } catch (error) {
    console.error(`❌ ${failureMessage}:`, error);
    return { success: false, error: failureMessage };
  }
};

// ===========================
// DEPARTMENT CRUD
// ===========================
export const addDepartment = async (department: string, modifiedBy?: string) => {
  const name = department.trim();
  return updateList(
    'departments',
    (list) => {
      if (!name) return 'Department name cannot be empty';
      if (list.includes(name)) return 'Department already exists';
      return [...list, name].sort();
    },
    'Failed to add department',
    modifiedBy
  );
};

export const removeDepartment = async (department: string, modifiedBy?: string) =>
  updateList(
    'departments',
    (list) => list.filter((d) => d !== department),
    'Failed to remove department',
    modifiedBy
  );

export const updateDepartments = async (
  departments: string[],
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> =>
  updateAppSettings(withModifier({ departments: [...departments].sort() }, modifiedBy));

// ===========================
// HOSTEL CRUD
// ===========================
export const addHostel = async (hostel: string, modifiedBy?: string) => {
  const name = hostel.trim();
  return updateList(
    'hostels',
    (list) => {
      if (!name) return 'Hostel name cannot be empty';
      if (list.includes(name)) return 'Hostel already exists';
      return [...list, name].sort();
    },
    'Failed to add hostel',
    modifiedBy
  );
};

export const removeHostel = async (hostel: string, modifiedBy?: string) =>
  updateList(
    'hostels',
    (list) => list.filter((h) => h !== hostel),
    'Failed to remove hostel',
    modifiedBy
  );

export const updateHostels = async (
  hostels: string[],
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> =>
  updateAppSettings(withModifier({ hostels: [...hostels].sort() }, modifiedBy));

/**
 * Remove a committee from active committees
 */
export const removeActiveCommittee = async (committeeKey: string, modifiedBy?: string) =>
  updateList(
    'activeCommittees',
    (list) => list.filter((k) => k !== committeeKey),
    'Failed to remove active committee',
    modifiedBy
  );

/**
 * Get year-specific collection name
 */
export const getYearCollectionName = (baseName: string, year: string): string =>
  `years/${year}/${baseName}`;

/**
 * Initialize app settings if they don't exist
 */
export const initializeSettingsIfNeeded = async (
  year?: string,
  modifiedBy?: string
): Promise<AppSettings> => {
  const settings = await getAppSettings();
  if (settings && settings.isInitialized) return settings;

  const initialYear = year || new Date().getFullYear().toString();
  return await createAppSettings(initialYear, modifiedBy);
};
