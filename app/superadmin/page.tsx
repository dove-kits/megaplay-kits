'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAuth, signOut } from 'firebase/auth';

import { isSuperAdmin } from '@/lib/utils/roleCheck';
import { 
  getAppSettings, 
  createAppSettings,
  updateAppSettings,
  activateCommittees 
} from '@/lib/services/settingsService';
import {
  createNewYear,
  getAllYears,
  deleteYear,
} from '@/lib/services/yearService';
import {
  getBaseCommittees,
  createYearCommittees,
  CommitteeKey,
  BaseCommittee
} from '@/lib/services/committeeService';
import {
  getAttendanceFacultyByYear,
  assignAttendanceFaculty,
  removeAttendanceFaculty,
  AttendanceFaculty,
} from '@/lib/services/attendanceFacultyService';

type TabType = 'overview' | 'year-management' | 'faculties' | 'attendance-team' | 'reports' | 'search' | 'settings';

interface ConfirmationModal {
  isOpen: boolean;
  type: 'delete' | 'switch' | null;
  year: string;
  title: string;
  message: string;
  warningMessage?: string;
}

export default function SuperAdminDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  // Core states
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Year Management States
  const [currentSettings, setCurrentSettings] = useState<any>(null);
  const [showYearModal, setShowYearModal] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSwitchingYear, setIsSwitchingYear] = useState(false);
  const [isDeletingYear, setIsDeletingYear] = useState(false);

  const [baseCommittees, setBaseCommittees] = useState<BaseCommittee[]>([]);

  // Confirmation Modal State
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModal>({
    isOpen: false,
    type: null,
    year: '',
    title: '',
    message: '',
    warningMessage: '',
  });

  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Attendance Team state
  const [attendanceFaculty, setAttendanceFaculty] = useState<AttendanceFaculty[]>([]);
  const [newAttendanceEmail, setNewAttendanceEmail] = useState('');
  const [addingAttendance, setAddingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');

  // Authentication and Authorization Check
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!isSuperAdmin(user.email)) {
      router.push('/login');
      return;
    }
    loadAllData();
  }, [user, authLoading]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await loadSettings();
      await loadYears();
      await loadBaseCommittees();
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    const settings = await getAppSettings();
    setCurrentSettings(settings);
    if (settings?.currentYear) {
      setCurrentYear(settings.currentYear);
      await loadAttendanceFaculty(settings.currentYear);
    }
  };

  const loadYears = async () => {
    const years = await getAllYears();
    setAvailableYears(years.map((y) => y.year));
  };

  const loadBaseCommittees = async () => {
    try {
      const committees = await getBaseCommittees();
      setBaseCommittees(committees);
    } catch (error) {
      console.error('Failed to load base committees:', error);
    }
  };

  const loadAttendanceFaculty = async (year: string) => {
    try {
      const faculty = await getAttendanceFacultyByYear(year);
      setAttendanceFaculty(faculty);
    } catch (error) {
      console.error('Failed to load attendance faculty:', error);
    }
  };

  const handleCreateYear = async () => {
    if (!newYear) return;
    if (selectedCommittees.length === 0) {
      alert('Please select at least one committee for this year.');
      return;
    }

    setIsInitializing(true);
    try {
      await createAppSettings(newYear);
      await activateCommittees(selectedCommittees as CommitteeKey[]);
      await createNewYear(newYear);
      await createYearCommittees(newYear, selectedCommittees as CommitteeKey[]);
      await loadAllData();
      
      setShowYearModal(false);
      setNewYear('');
      setSelectedCommittees([]);

      alert(`✅ Year ${newYear} created with committees: ${selectedCommittees.join(', ')}`);
    } catch (error) {
      console.error('Year creation failed:', error);
      alert('Failed to create year. Please try again.');
    } finally {
      setIsInitializing(false);
    }
  };

  const promptSwitchYear = (year: string) => {
    if (year === currentYear) {
      alert('This year is already active.');
      return;
    }

    setConfirmationModal({
      isOpen: true,
      type: 'switch',
      year,
      title: 'Switch Academic Year',
      message: `Are you sure you want to switch to year ${year}?`,
      warningMessage: 'This will change the active year for all users and operations.',
    });
  };

  const handleSwitchYear = async () => {
    const yearToSwitch = confirmationModal.year;
    setConfirmationModal({ ...confirmationModal, isOpen: false });

    setIsSwitchingYear(true);
    try {
      await updateAppSettings({ currentYear: yearToSwitch });
      await loadAllData();
      alert(`✅ Successfully switched to year ${yearToSwitch}`);
    } catch (error) {
      console.error('Failed to switch year:', error);
      alert('Failed to switch year. Please try again.');
    } finally {
      setIsSwitchingYear(false);
    }
  };

  const promptDeleteYear = (year: string) => {
    if (year === currentYear) {
      alert('Cannot delete the currently active year. Please switch to another year first.');
      return;
    }

    setConfirmationModal({
      isOpen: true,
      type: 'delete',
      year,
      title: '⚠️ Permanently Delete Year',
      message: `You are about to permanently delete year ${year} and ALL its data.`,
      warningMessage: `This will delete:\n• All student registrations\n• All event data\n• All committees\n• All attendance records\n• All faculty assignments\n• All coordinators\n\nThis action CANNOT be undone!`,
    });
    setDeleteConfirmText('');
  };

  const handleDeleteYear = async () => {
    const yearToDelete = confirmationModal.year;
    
    if (deleteConfirmText !== `DELETE ${yearToDelete}`) {
      alert('Please type the confirmation text correctly.');
      return;
    }

    setConfirmationModal({ ...confirmationModal, isOpen: false });
    setIsDeletingYear(true);

    try {
      await deleteYear(yearToDelete);
      await loadYears();
      setDeleteConfirmText('');
      alert(`✅ Year ${yearToDelete} and all its data have been permanently deleted.`);
    } catch (error) {
      console.error('Failed to delete year:', error);
      alert('Failed to delete year. Please try again or contact support.');
    } finally {
      setIsDeletingYear(false);
    }
  };

  const closeConfirmationModal = () => {
    setConfirmationModal({
      isOpen: false,
      type: null,
      year: '',
      title: '',
      message: '',
      warningMessage: '',
    });
    setDeleteConfirmText('');
  };

  const handleAddAttendanceFaculty = async () => {
    if (!currentYear || !user?.email) return;
    if (!newAttendanceEmail.trim()) {
      setAttendanceError('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newAttendanceEmail.trim())) {
      setAttendanceError('Please enter a valid email address');
      return;
    }

    setAddingAttendance(true);
    setAttendanceError('');

    try {
      await assignAttendanceFaculty(
        currentYear,
        newAttendanceEmail.trim(),
        user.email
      );
      await loadAttendanceFaculty(currentYear);
      setNewAttendanceEmail('');
      alert('Attendance faculty added successfully!');
    } catch (error) {
      console.error('Failed to add attendance faculty:', error);
      setAttendanceError('Failed to add attendance faculty. Please try again.');
    } finally {
      setAddingAttendance(false);
    }
  };

  const handleRemoveAttendanceFaculty = async (email: string) => {
    if (!currentYear) return;
    if (!confirm(`Remove ${email} from attendance team?`)) return;

    try {
      await removeAttendanceFaculty(currentYear, email);
      await loadAttendanceFaculty(currentYear);
      alert('Attendance faculty removed successfully!');
    } catch (error) {
      console.error('Failed to remove attendance faculty:', error);
      alert('Failed to remove attendance faculty. Please try again.');
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      await signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
      alert('Failed to logout. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/8 rounded-full blur-[90px]"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#000000]">
      {/* Background System */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
      
      {/* Animated Blobs */}
      <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/8 rounded-full blur-[90px]"></div>

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Left Section: Logo and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Logo */}
        <div className="flex items-center justify-center flex-shrink-0">
          <Image
            src="/klo2.svg"
            alt="MegaPlay"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px]"
          />
        </div>

        {/* Title Section */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            MegaPlay Admin
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">SuperAdmin Dashboard • </span>
            {currentYear || 'No Year'}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        {/* User Info Card - Hidden on mobile */}
        {user && (
          <div className="hidden lg:flex items-center gap-2 sm:gap-3 text-xs sm:text-sm bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-[10px] sm:text-xs shadow-lg flex-shrink-0">
              {user.displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'S'}
            </div>
            <span className="text-white/90 font-medium max-w-[120px] xl:max-w-[200px] truncate">
              {user.displayName || user.email}
            </span>
            <span className="px-2 py-0.5 sm:py-1 bg-purple-500/20 text-purple-300 text-[10px] sm:text-xs rounded-full font-medium border border-purple-400/30 whitespace-nowrap">
              SUPERADMIN
            </span>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 md:py-2.5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-medium text-xs sm:text-sm transition-all duration-300 flex items-center gap-1.5 sm:gap-2 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isLoggingOut ? (
            <>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="hidden sm:inline">Logging out...</span>
              <span className="sm:hidden">...</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
              </svg>
              <span className="hidden xs:inline">Logout</span>
            </>
          )}
        </button>
      </div>
    </div>
  </div>
</header>


        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 min-w-[120px] px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('year-management')}
              className={`flex-1 min-w-[120px] px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'year-management'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              Year Management
            </button>
            <button
              onClick={() => setActiveTab('faculties')}
              className={`flex-1 min-w-[120px] px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'faculties'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              Faculty
            </button>
            <button
              onClick={() => setActiveTab('attendance-team')}
              className={`flex-1 min-w-[120px] px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'attendance-team'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              Attendance
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {(isSwitchingYear || isDeletingYear) && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 text-center shadow-2xl">
              <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white text-lg font-medium">
                {isSwitchingYear ? 'Switching year...' : 'Deleting year and all data...'}
              </p>
              <p className="text-white/60 text-sm mt-2">Please wait, do not close this page.</p>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 pb-10 animate-[fadeInUp_0.7s_ease-out]">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                  <h3 className="text-white/60 text-sm font-medium mb-2">Available Years</h3>
                  <p className="text-3xl font-bold text-white">{availableYears.length}</p>
                </div>
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                  <h3 className="text-white/60 text-sm font-medium mb-2">Active Committees</h3>
                  <p className="text-3xl font-bold text-white">{currentSettings?.activeCommittees?.length || 0}</p>
                </div>
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                  <h3 className="text-white/60 text-sm font-medium mb-2">Attendance Faculty</h3>
                  <p className="text-3xl font-bold text-white">{attendanceFaculty.length}</p>
                </div>
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                  <h3 className="text-white/60 text-sm font-medium mb-2">System Status</h3>
                  <p className="text-lg font-semibold text-emerald-400">
                    {currentSettings?.isInitialized ? '✅ Active' : '⚠️ Setup Required'}
                  </p>
                </div>
              </div>

              {/* Quick Links */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button
                  onClick={() => setActiveTab('year-management')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left hover:bg-white/10 transition-all shadow-2xl group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center mb-4 group-hover:shadow-2xl group-hover:shadow-purple-500/30 transition-all duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-300 transition-colors">
                    Year Management
                  </h3>
                  <p className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                    Create, switch, and manage academic years
                  </p>
                </button>

                <button
                  onClick={() => router.push('/superadmin/faculty')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left hover:bg-white/10 transition-all shadow-2xl group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 flex items-center justify-center mb-4 group-hover:shadow-2xl group-hover:shadow-blue-500/30 transition-all duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-300 transition-colors">
                    Faculty Management
                  </h3>
                  <p className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                    Assign faculty to committees for student approval
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab('attendance-team')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left hover:bg-white/10 transition-all shadow-2xl group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center mb-4 group-hover:shadow-2xl group-hover:shadow-emerald-500/30 transition-all duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-emerald-300 transition-colors">
                    Attendance Team
                  </h3>
                  <p className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                    Manage attendance faculty and coordinators
                  </p>
                </button>

                <button
                  onClick={() => router.push('/superadmin/reports')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left hover:bg-white/10 transition-all shadow-2xl group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 flex items-center justify-center mb-4 group-hover:shadow-2xl group-hover:shadow-orange-500/30 transition-all duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-orange-300 transition-colors">
                    Reports
                  </h3>
                  <p className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                    View attendance reports
                  </p>
                </button>

                <button
                  onClick={() => router.push('/superadmin/search')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left hover:bg-white/10 transition-all shadow-2xl group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 flex items-center justify-center mb-4 group-hover:shadow-2xl group-hover:shadow-pink-500/30 transition-all duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-pink-300 transition-colors">
                    Search
                  </h3>
                  <p className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                    Search students
                  </p>
                </button>

                <button
                  onClick={() => router.push('/superadmin/students')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left hover:bg-white/10 transition-all shadow-2xl group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center mb-4 group-hover:shadow-2xl group-hover:shadow-emerald-500/30 transition-all duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-emerald-300 transition-colors">
                    Add Students
                  </h3>
                  <p className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                    Register students manually even when registration is closed
                  </p>
                </button>

                <button
                  onClick={() => router.push('/superadmin/settings')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-left hover:bg-white/10 transition-all shadow-2xl group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center mb-4 group-hover:shadow-2xl group-hover:shadow-purple-500/30 transition-all duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-300 transition-colors">
                    Settings
                  </h3>
                  <p className="text-white/60 text-sm group-hover:text-white/80 transition-colors">
                    Manage registration and app settings
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Year Management Tab */}
          {activeTab === 'year-management' && (
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  <div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent mb-2">
                      Year Setup Status
                    </h2>
                    <p className="text-xl text-white/70">
                      {currentSettings?.isInitialized
                        ? `Ready for ${currentSettings.currentYear}`
                        : 'Please create a new year to begin'}
                    </p>
                  </div>

                  <button
                    onClick={() => setShowYearModal(true)}
                    disabled={isInitializing}
                    className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 flex items-center gap-3 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {currentSettings?.currentYear ? 'Create New Year' : 'Create First Year'}
                  </button>
                </div>
              </div>

              {/* Available Years List */}
              {availableYears.length > 0 && (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                  <h3 className="text-2xl font-semibold text-white mb-6">Available Academic Years</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {availableYears.map((year) => (
                      <div
                        key={year}
                        className={`p-6 rounded-2xl border-2 transition-all shadow-xl ${
                          year === currentYear
                            ? 'bg-purple-500/20 border-purple-400 shadow-purple-500/20'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className={`text-2xl font-bold ${
                            year === currentYear ? 'text-purple-300' : 'text-white'
                          }`}>
                            {year}
                          </h4>
                          {year === currentYear && (
                            <span className="px-3 py-1 bg-purple-500/30 text-purple-200 text-xs font-bold rounded-full border border-purple-400/30">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {year !== currentYear && (
                            <button
                              onClick={() => promptSwitchYear(year)}
                              className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-100 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                              </svg>
                              Switch to This Year
                            </button>
                          )}
                          {year !== currentYear && (
                            <button
                              onClick={() => promptDeleteYear(year)}
                              className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-100 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete Year
                            </button>
                          )}
                          {year === currentYear && (
                            <div className="text-center py-2 text-purple-300/60 text-xs">
                              Cannot delete active year
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Faculty Management Tab */}
          {activeTab === 'faculties' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white mb-4">Faculty Management</h2>
              <p className="text-white/70 mb-6">
                Assign faculty to committees for approving student registrations.
              </p>
              <button
                onClick={() => router.push('/superadmin/faculty')}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl shadow-2xl transition-all"
              >
                Go to Faculty Management
              </button>
            </div>
          )}

          {/* Attendance Team Tab */}
          {activeTab === 'attendance-team' && (
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <h2 className="text-2xl font-semibold text-white mb-4">
                  Attendance Team Management
                </h2>
                <p className="text-white/70 mb-6">
                  Attendance faculty can create sessions and assign coordinators to mark attendance.
                </p>

                {!currentYear && (
                  <div className="bg-red-500/10 border border-red-400/20 rounded-2xl p-4 mb-6">
                    <p className="text-sm text-red-200">
                      ⚠️ No active year found. Please create a year in the Year Management tab first.
                    </p>
                  </div>
                )}

                {currentYear && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Add Attendance Faculty
                      </label>
                      <div className="flex gap-3">
                        <input
                          type="email"
                          value={newAttendanceEmail}
                          onChange={(e) => {
                            setNewAttendanceEmail(e.target.value);
                            setAttendanceError('');
                          }}
                          placeholder="faculty@karunya.edu.in"
                          className="flex-1 bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          disabled={addingAttendance}
                        />
                        <button
                          onClick={handleAddAttendanceFaculty}
                          disabled={addingAttendance || !newAttendanceEmail.trim()}
                          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {addingAttendance ? (
                            <>
                              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Adding...
                            </>
                          ) : (
                            'Add to Team'
                          )}
                        </button>
                      </div>
                      {attendanceError && (
                        <p className="text-xs text-red-300 mt-2">{attendanceError}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-semibold text-white">
                    Current Attendance Faculty ({attendanceFaculty.length})
                  </h2>
                </div>

                {attendanceFaculty.length === 0 ? (
                  <p className="text-sm text-white/70 text-center py-8">
                    No attendance faculty assigned yet for year {currentYear}.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {attendanceFaculty.map((faculty) => (
                      <div
                        key={faculty.email}
                        className="flex items-center justify-between px-6 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                      >
                        <div>
                          <p className="text-sm font-medium text-white">{faculty.email}</p>
                          <p className="text-xs text-white/60 mt-1">
                            Role: Attendance Admin • Assigned by {faculty.assignedBy}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveAttendanceFaculty(faculty.email)}
                          className="px-4 py-2 rounded-2xl text-xs font-medium bg-red-500/20 text-red-100 hover:bg-red-500/30 border border-red-400/20 transition-all"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white mb-4">Reports</h2>
              <p className="text-white/70 mb-6">
                Export Reports and Attendance Record
              </p>
              <button
                onClick={() => router.push('/superadmin/reports')}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl shadow-2xl transition-all"
              >
                Go to Reports page
              </button>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white mb-4">Search</h2>
              <p className="text-white/70 mb-6">
                Search Students and View their Details
              </p>
              <button
                onClick={() => router.push('/superadmin/search')}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl shadow-2xl transition-all"
              >
                Go to Search Page
              </button>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white mb-4">Settings</h2>
              <p className="text-white/70 mb-6">
                Manage Committes, Control Registration Form and Control the Form Details.
              </p>
              <button
                onClick={() => router.push('/superadmin/settings')}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl shadow-2xl transition-all"
              >
                Go to Settings
              </button>
            </div>
          )}
        </main>
      </div>

      {/* CREATE YEAR MODAL */}
      {showYearModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 backdrop-blur-2xl border border-white/20 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-8 border-b border-white/10">
              <h2 className="text-3xl font-bold text-white mb-2">
                Create New Academic Year
              </h2>
              <p className="text-white/70">
                All data will be scoped to this year automatically
              </p>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Academic Year
                </label>
                <div className="flex gap-3">
                  <select
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">Select Year</option>
                    {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
                      <option key={year} value={year.toString()}>
                        {year.toString()}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setNewYear(new Date().getFullYear().toString())}
                    className="px-6 py-3 bg-purple-500/20 border border-purple-400/30 text-purple-100 hover:bg-purple-500/30 rounded-2xl font-medium transition-all"
                  >
                    Current
                  </button>
                </div>
              </div>

              {/* Committees selection */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Activate Committees for this Year
                </label>
                {baseCommittees.length === 0 ? (
                  <div className="bg-yellow-500/10 border border-yellow-400/20 rounded-2xl p-4">
                    <p className="text-yellow-100 text-sm">
                      No committee templates found. Please create committee templates first.
                    </p>
                    <button
                      onClick={() => router.push('/superadmin/committees')}
                      className="mt-3 text-xs text-yellow-200 hover:text-yellow-100 underline"
                    >
                      Go to Committee Management →
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {baseCommittees.map((committee) => {
                      const checked = selectedCommittees.includes(committee.key);
                      return (
                        <button
                          key={committee.key}
                          type="button"
                          onClick={() => {
                            setSelectedCommittees((prev) =>
                              prev.includes(committee.key)
                                ? prev.filter((k) => k !== committee.key)
                                : [...prev, committee.key]
                            );
                          }}
                          className={`flex items-center justify-between px-3 py-2 rounded-2xl border text-sm transition-all ${
                            checked
                              ? 'bg-purple-500/20 border-purple-400/60 text-purple-100'
                              : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                          }`}
                        >
                          <span>{committee.name}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              checked ? 'bg-purple-400' : 'bg-white/30'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedCommittees.length === 0 && baseCommittees.length > 0 && (
                  <p className="text-xs text-red-300 mt-2">
                    Select at least one committee to continue.
                  </p>
                )}
              </div>

              {availableYears.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-400/20 rounded-2xl p-4">
                  <p className="text-yellow-100 text-sm font-medium mb-1">Existing Years:</p>
                  <p className="text-yellow-200/80 text-sm">{availableYears.join(', ')}</p>
                </div>
              )}

              <button
                onClick={handleCreateYear}
                disabled={!newYear || selectedCommittees.length === 0 || isInitializing}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isInitializing ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Initializing Year...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Create Year {newYear} & Initialize Collections
                  </>
                )}
              </button>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end">
              <button
                onClick={() => {
                  setShowYearModal(false);
                  setNewYear('');
                  setSelectedCommittees([]);
                }}
                disabled={isInitializing}
                className="px-6 py-2 text-white/70 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmationModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 backdrop-blur-2xl border border-white/20 rounded-3xl max-w-2xl w-full shadow-2xl">
            <div className={`p-8 border-b ${
              confirmationModal.type === 'delete' ? 'border-red-400/20' : 'border-white/10'
            }`}>
              <h2 className={`text-3xl font-bold mb-2 ${
                confirmationModal.type === 'delete' ? 'text-red-400' : 'text-white'
              }`}>
                {confirmationModal.title}
              </h2>
              <p className="text-white/90 text-lg">{confirmationModal.message}</p>
            </div>

            <div className="p-8 space-y-6">
              {confirmationModal.warningMessage && (
                <div className={`rounded-2xl p-6 ${
                  confirmationModal.type === 'delete' 
                    ? 'bg-red-500/10 border-2 border-red-400/30' 
                    : 'bg-yellow-500/10 border-2 border-yellow-400/30'
                }`}>
                  <div className="flex gap-3">
                    <svg className={`w-6 h-6 flex-shrink-0 ${
                      confirmationModal.type === 'delete' ? 'text-red-400' : 'text-yellow-400'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className={`text-sm whitespace-pre-line ${
                      confirmationModal.type === 'delete' ? 'text-red-200' : 'text-yellow-200'
                    }`}>
                      {confirmationModal.warningMessage}
                    </p>
                  </div>
                </div>
              )}

              {confirmationModal.type === 'delete' && (
                <div>
                  <label className="block text-sm font-medium text-white mb-3">
                    Type <span className="font-bold text-red-400">DELETE {confirmationModal.year}</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={`DELETE ${confirmationModal.year}`}
                    className="w-full bg-white/5 border-2 border-red-400/30 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3 justify-end">
              <button
                onClick={closeConfirmationModal}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmationModal.type === 'delete' ? handleDeleteYear : handleSwitchYear}
                disabled={
                  confirmationModal.type === 'delete' && 
                  deleteConfirmText !== `DELETE ${confirmationModal.year}`
                }
                className={`px-6 py-3 rounded-2xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                  confirmationModal.type === 'delete'
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white'
                }`}
              >
                {confirmationModal.type === 'delete' ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Permanently Delete
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Confirm Switch
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
