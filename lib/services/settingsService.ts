// lib/services/settingsService.ts
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * App-wide settings interface
 * Manages global configuration across the application
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
 * Remove undefined values from an object
 * Firestore doesn't accept undefined values
 */
const removeUndefined = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  });
  return cleaned;
};

/**
 * Get app settings from Firestore
 * @returns AppSettings or null if document doesn't exist
 */
export const getAppSettings = async (): Promise<AppSettings | null> => {
  try {
    const settingsRef = doc(db, SETTINGS_DOC_PATH);
    const settingsSnap = await getDoc(settingsRef);

    if (settingsSnap.exists()) {
      return settingsSnap.data() as AppSettings;
    }

    console.warn('⚠️ App settings document does not exist');
    return null;
  } catch (error) {
    console.error('❌ Error getting app settings:', error);
    throw new Error('Failed to retrieve app settings');
  }
};

/**
 * Create initial app settings (ONLY for first-time setup)
 * @param year - Initial year to set
 * @param modifiedBy - User ID of the person creating settings (optional)
 * @returns Created AppSettings object
 */
export const createAppSettings = async (
  year: string,
  modifiedBy?: string
): Promise<AppSettings> => {
  try {
    // Check if settings already exist
    const existingSettings = await getAppSettings();
    
    if (existingSettings && existingSettings.isInitialized) {
      console.log('⚠️ Settings already exist, updating current year only');
      
      // Safely check if year exists in availableYears
      const availableYears = existingSettings.availableYears || [];
      const updatedAvailableYears = availableYears.includes(year)
        ? availableYears
        : [...availableYears, year].sort((a, b) => b.localeCompare(a));
      
      const updateData: Partial<AppSettings> = {
        currentYear: year,
        availableYears: updatedAvailableYears,
        isInitialized: true,
      };
      
      if (modifiedBy) {
        updateData.lastModifiedBy = modifiedBy;
      }
      
      await updateAppSettings(updateData);
      
      return { 
        ...existingSettings, 
        currentYear: year, 
        availableYears: updatedAvailableYears,
        isInitialized: true,
        ...(modifiedBy && { lastModifiedBy: modifiedBy }),
      };
    }

    // Create new settings if they don't exist
    const newSettings: any = {
      currentYear: year,
      availableYears: [year],
      registrationOpen: false,
      activeCommittees: [],
      departments: DEFAULT_DEPARTMENTS,
      hostels: DEFAULT_HOSTELS,
      isInitialized: true,
      createdAt: Timestamp.now(),
      lastModifiedAt: Timestamp.now(),
    };
    
    if (modifiedBy) {
      newSettings.lastModifiedBy = modifiedBy;
    }

    const settingsRef = doc(db, SETTINGS_DOC_PATH);
    await setDoc(settingsRef, {
      ...newSettings,
      createdAt: serverTimestamp(),
      lastModifiedAt: serverTimestamp(),
    });

    console.log('✅ Created new app settings for year:', year);
    return newSettings as AppSettings;
  } catch (error) {
    console.error('❌ Error creating app settings:', error);
    throw new Error('Failed to create app settings');
  }
};

/**
 * Update app settings (use for all updates after creation)
 * @param updates - Partial AppSettings to update
 * @returns Success status and optional error message
 */
export const updateAppSettings = async (
  updates: Partial<AppSettings>
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settingsRef = doc(db, SETTINGS_DOC_PATH);
    const settingsSnap = await getDoc(settingsRef);

    // Remove undefined values to prevent Firestore errors
    const cleanedUpdates = removeUndefined({
      ...updates,
      lastModifiedAt: serverTimestamp(),
    });

    if (settingsSnap.exists()) {
      // Update existing settings
      await updateDoc(settingsRef, cleanedUpdates);
      console.log('✅ App settings updated:', Object.keys(updates));
    } else {
      // Create new settings if document doesn't exist
      const defaultSettings: any = {
        currentYear: updates.currentYear || new Date().getFullYear().toString(),
        availableYears: updates.availableYears || [updates.currentYear || new Date().getFullYear().toString()],
        registrationOpen: updates.registrationOpen ?? false,
        activeCommittees: updates.activeCommittees || [],
        departments: updates.departments || DEFAULT_DEPARTMENTS,
        hostels: updates.hostels || DEFAULT_HOSTELS,
        isInitialized: updates.isInitialized ?? true,
        createdAt: Timestamp.now(),
        lastModifiedAt: Timestamp.now(),
      };
      
      if (updates.lastModifiedBy) {
        defaultSettings.lastModifiedBy = updates.lastModifiedBy;
      }

      await setDoc(settingsRef, {
        ...defaultSettings,
        createdAt: serverTimestamp(),
        lastModifiedAt: serverTimestamp(),
      });
      console.log('✅ Created new settings document with updates');
    }

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
 * @param year - Year to set as current
 * @param modifiedBy - User ID (optional)
 */
export const updateCurrentYear = async (
  year: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings();
    
    const existingYears = settings?.availableYears || [];
    const availableYears = existingYears.includes(year)
      ? existingYears
      : [...existingYears, year].sort((a, b) => b.localeCompare(a));

    const updateData: Partial<AppSettings> = {
      currentYear: year, 
      availableYears,
      isInitialized: true,
    };
    
    if (modifiedBy) {
      updateData.lastModifiedBy = modifiedBy;
    }

    return await updateAppSettings(updateData);
  } catch (error) {
    console.error('❌ Error updating current year:', error);
    return {
      success: false,
      error: 'Failed to update current year',
    };
  }
};

/**
 * Toggle registration status
 * @param isOpen - Registration open status
 * @param modifiedBy - User ID (optional)
 */
export const toggleRegistration = async (
  isOpen: boolean,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  const updateData: Partial<AppSettings> = {
    registrationOpen: isOpen,
  };
  
  if (modifiedBy) {
    updateData.lastModifiedBy = modifiedBy;
  }
  
  return await updateAppSettings(updateData);
};

/**
 * Activate/update committees
 * @param committees - Array of committee keys
 * @param modifiedBy - User ID (optional)
 */
export const activateCommittees = async (
  committees: string[],
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  const updateData: Partial<AppSettings> = {
    activeCommittees: committees,
    isInitialized: true,
  };
  
  if (modifiedBy) {
    updateData.lastModifiedBy = modifiedBy;
  }
  
  return await updateAppSettings(updateData);
};

/**
 * Add a new year to available years
 * @param year - Year to add
 * @param modifiedBy - User ID (optional)
 */
export const addAvailableYear = async (
  year: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings();
    
    if (!settings) {
      return { success: false, error: 'Settings not initialized' };
    }

    const existingYears = settings.availableYears || [];
    
    if (existingYears.includes(year)) {
      return { success: true }; // Already exists
    }

    const updateData: Partial<AppSettings> = {
      availableYears: [...existingYears, year].sort((a, b) => b.localeCompare(a)),
    };
    
    if (modifiedBy) {
      updateData.lastModifiedBy = modifiedBy;
    }

    return await updateAppSettings(updateData);
  } catch (error) {
    console.error('❌ Error adding available year:', error);
    return {
      success: false,
      error: 'Failed to add year',
    };
  }
};

// ===========================
// DEPARTMENT CRUD OPERATIONS
// ===========================

/**
 * Add a new department
 * @param department - Department name
 * @param modifiedBy - User ID (optional)
 */
export const addDepartment = async (
  department: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings();
    
    if (!settings) {
      return { success: false, error: 'Settings not initialized' };
    }

    const trimmedDept = department.trim();
    
    if (!trimmedDept) {
      return { success: false, error: 'Department name cannot be empty' };
    }

    const existingDepts = settings.departments || [];
    
    if (existingDepts.includes(trimmedDept)) {
      return { success: false, error: 'Department already exists' };
    }

    const updateData: Partial<AppSettings> = {
      departments: [...existingDepts, trimmedDept].sort(),
    };
    
    if (modifiedBy) {
      updateData.lastModifiedBy = modifiedBy;
    }

    return await updateAppSettings(updateData);
  } catch (error) {
    console.error('❌ Error adding department:', error);
    return {
      success: false,
      error: 'Failed to add department',
    };
  }
};

/**
 * Remove a department
 * @param department - Department name to remove
 * @param modifiedBy - User ID (optional)
 */
export const removeDepartment = async (
  department: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings();
    
    if (!settings) {
      return { success: false, error: 'Settings not initialized' };
    }

    const existingDepts = settings.departments || [];

    const updateData: Partial<AppSettings> = {
      departments: existingDepts.filter(d => d !== department),
    };
    
    if (modifiedBy) {
      updateData.lastModifiedBy = modifiedBy;
    }

    return await updateAppSettings(updateData);
  } catch (error) {
    console.error('❌ Error removing department:', error);
    return {
      success: false,
      error: 'Failed to remove department',
    };
  }
};

/**
 * Update entire departments list
 * @param departments - Array of department names
 * @param modifiedBy - User ID (optional)
 */
export const updateDepartments = async (
  departments: string[],
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  const updateData: Partial<AppSettings> = {
    departments: departments.sort(),
  };
  
  if (modifiedBy) {
    updateData.lastModifiedBy = modifiedBy;
  }
  
  return await updateAppSettings(updateData);
};

// ===========================
// HOSTEL CRUD OPERATIONS
// ===========================

/**
 * Add a new hostel
 * @param hostel - Hostel name
 * @param modifiedBy - User ID (optional)
 */
export const addHostel = async (
  hostel: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings();
    
    if (!settings) {
      return { success: false, error: 'Settings not initialized' };
    }

    const trimmedHostel = hostel.trim();
    
    if (!trimmedHostel) {
      return { success: false, error: 'Hostel name cannot be empty' };
    }

    const existingHostels = settings.hostels || [];
    
    if (existingHostels.includes(trimmedHostel)) {
      return { success: false, error: 'Hostel already exists' };
    }

    const updateData: Partial<AppSettings> = {
      hostels: [...existingHostels, trimmedHostel].sort(),
    };
    
    if (modifiedBy) {
      updateData.lastModifiedBy = modifiedBy;
    }

    return await updateAppSettings(updateData);
  } catch (error) {
    console.error('❌ Error adding hostel:', error);
    return {
      success: false,
      error: 'Failed to add hostel',
    };
  }
};

/**
 * Remove a hostel
 * @param hostel - Hostel name to remove
 * @param modifiedBy - User ID (optional)
 */
export const removeHostel = async (
  hostel: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings();
    
    if (!settings) {
      return { success: false, error: 'Settings not initialized' };
    }

    const existingHostels = settings.hostels || [];

    const updateData: Partial<AppSettings> = {
      hostels: existingHostels.filter(h => h !== hostel),
    };
    
    if (modifiedBy) {
      updateData.lastModifiedBy = modifiedBy;
    }

    return await updateAppSettings(updateData);
  } catch (error) {
    console.error('❌ Error removing hostel:', error);
    return {
      success: false,
      error: 'Failed to remove hostel',
    };
  }
};

/**
 * Update entire hostels list
 * @param hostels - Array of hostel names
 * @param modifiedBy - User ID (optional)
 */
export const updateHostels = async (
  hostels: string[],
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  const updateData: Partial<AppSettings> = {
    hostels: hostels.sort(),
  };
  
  if (modifiedBy) {
    updateData.lastModifiedBy = modifiedBy;
  }
  
  return await updateAppSettings(updateData);
};

/**
 * Get year-specific collection name
 * @param baseName - Base collection name
 * @param year - Year to append
 * @returns Formatted collection name
 */
export const getYearCollectionName = (
  baseName: string,
  year: string
): string => {
  return `years/${year}/${baseName}`;
};

/**
 * Initialize app settings if they don't exist
 * @param year - Initial year
 * @param modifiedBy - User ID (optional)
 */
export const initializeSettingsIfNeeded = async (
  year?: string,
  modifiedBy?: string
): Promise<AppSettings> => {
  const settings = await getAppSettings();
  
  if (settings && settings.isInitialized) {
    return settings;
  }

  const initialYear = year || new Date().getFullYear().toString();
  return await createAppSettings(initialYear, modifiedBy);
};
/**
 * Remove a committee from active committees
 * @param committeeKey - Committee key to remove
 * @param modifiedBy - User ID (optional)
 */
export const removeActiveCommittee = async (
  committeeKey: string,
  modifiedBy?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const settings = await getAppSettings();
    
    if (!settings) {
      return { success: false, error: 'Settings not initialized' };
    }

    const existingCommittees = settings.activeCommittees || [];

    const updateData: Partial<AppSettings> = {
      activeCommittees: existingCommittees.filter(k => k !== committeeKey),
    };
    
    if (modifiedBy) {
      updateData.lastModifiedBy = modifiedBy;
    }

    return await updateAppSettings(updateData);
  } catch (error) {
    console.error('❌ Error removing active committee:', error);
    return {
      success: false,
      error: 'Failed to remove active committee',
    };
  }
};
