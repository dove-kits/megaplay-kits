'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isAttendanceFaculty } from '@/lib/services/attendanceFacultyService';
import {
  getCoordinatorsByYear,
  assignCoordinator,
  removeCoordinator,
  Coordinator,
} from '@/lib/services/coordinatorService';
import { getAllSessions, Session, updateSessionStatus } from '@/lib/services/sessionService';

type TabType = 'overview' | 'manage' | 'search' | 'students' | 'reports' | 'coordinators';

export default function AttendanceAdminDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [newCoordinatorEmail, setNewCoordinatorEmail] = useState('');
  const [addingCoordinator, setAddingCoordinator] = useState(false);
  const [coordinatorError, setCoordinatorError] = useState('');
  const [removingCoordinator, setRemovingCoordinator] = useState<string | null>(null);

  const loadCoordinators = useCallback(async (year: string) => {
    try {
      const coords = await getCoordinatorsByYear(year);
      setCoordinators(coords);
    } catch (error) {
      console.error('Failed to load coordinators:', error);
    }
  }, []);

  const loadSessions = useCallback(async (year: string) => {
    try {
      const allSessions = await getAllSessions(year);
      setSessions(allSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        alert('No active year configured.');
        router.push('/login');
        return;
      }

      setCurrentYear(settings.currentYear);

      const isAdmin = await isAttendanceFaculty(
        user?.email || '',
        settings.currentYear
      );
      if (!isAdmin) {
        alert('Access denied. You are not part of the attendance team.');
        router.push('/login');
        return;
      }

      await Promise.all([
        loadCoordinators(settings.currentYear),
        loadSessions(settings.currentYear),
      ]);

      await updateSessionStatus(settings.currentYear);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load attendance admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, [user?.email, loadCoordinators, loadSessions, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const handleAddCoordinator = async () => {
    if (!currentYear || !user?.email) return;
    if (!newCoordinatorEmail.trim()) {
      setCoordinatorError('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newCoordinatorEmail.trim())) {
      setCoordinatorError('Please enter a valid email address');
      return;
    }

    setAddingCoordinator(true);
    setCoordinatorError('');

    try {
      await assignCoordinator(currentYear, newCoordinatorEmail.trim(), user.email);
      await loadCoordinators(currentYear);
      setNewCoordinatorEmail('');
      alert(
        '✅ Coordinator Added Successfully!\n\n' +
        `${newCoordinatorEmail.trim()} has been assigned as a coordinator.\n\n` +
        'They will need to complete onboarding before accessing the attendance portal.'
      );
    } catch (error) {
      console.error('Failed to add coordinator:', error);
      setCoordinatorError('Failed to add coordinator. Please try again.');
    } finally {
      setAddingCoordinator(false);
    }
  };

  const handleRemoveCoordinator = async (email: string) => {
    if (!currentYear) return;
    
    // Enhanced confirmation dialog with detailed information
    const confirmed = confirm(
      `⚠️ REMOVE COORDINATOR\n\n` +
      `Email: ${email}\n\n` +
      `This action will permanently delete:\n` +
      `✓ Coordinator assignment\n` +
      `✓ Student profile (regno, name, phone, department, etc.)\n` +
      `✓ Committee membership\n` +
      `✓ All related attendance data\n\n` +
      `Their Firebase account will remain active but role will be reset to 'student'.\n\n` +
      `⚠️ THIS CANNOT BE UNDONE ⚠️\n\n` +
      `Are you absolutely sure you want to proceed?`
    );

    if (!confirmed) return;

    // Set removing state for this specific coordinator
    setRemovingCoordinator(email);

    try {
      await removeCoordinator(currentYear, email);
      await loadCoordinators(currentYear);
      
      alert(
        '✅ Coordinator Removed Successfully\n\n' +
        `${email} has been completely removed.\n\n` +
        'Deleted data:\n' +
        '• Coordinator access\n' +
        '• Student profile\n' +
        '• Committee assignments\n\n' +
        'Their user role has been reset to "student".'
      );
    } catch (error) {
      console.error('Failed to remove coordinator:', error);
      alert(
        '❌ Removal Failed\n\n' +
        `Could not remove ${email}.\n\n` +
        'Error: ' + (error instanceof Error ? error.message : 'Unknown error') + '\n\n' +
        'Please try again or contact technical support if the issue persists.'
      );
    } finally {
      setRemovingCoordinator(null);
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
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading attendance admin dashboard...</p>
        </div>
      </div>
    );
  }

  const totalSessions = sessions.length;

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
                    alt="Logo"
                    width={40}
                    height={40}
                    className="drop-shadow-2xl sm:w-[50px] sm:h-[50px]"
                  />
                </div>

                {/* Title Section */}
                <div className="min-w-0 flex-1">
                  <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
                    <span className="hidden sm:inline">Attendance Administration</span>
                    <span className="sm:hidden">Attendance Admin</span>
                  </h1>
                  <p className="text-[10px] sm:text-xs text-purple-400 font-medium">
                    Year {currentYear || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Right Section: User Email and Logout */}
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
                {/* User Email - Hidden on mobile */}
                <div className="text-right hidden md:block">
                  <p className="text-xs sm:text-sm font-medium text-white max-w-[150px] lg:max-w-[200px] truncate">
                    {user?.email}
                  </p>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {isLoggingOut ? (
                    <>
                      <span className="hidden sm:inline">Logging out...</span>
                      <span className="sm:hidden">...</span>
                    </>
                  ) : (
                    'Logout'
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Navigation Tabs - Scrollable on Mobile */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-[fadeInUp_0.7s_ease-out]">
          {/* Mobile Dropdown */}
          <div className="md:hidden mb-4">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-1">
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as TabType)}
                className="w-full bg-purple-500/20 text-purple-300 border border-purple-400/30 rounded-lg px-4 py-3 text-sm font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23c4b5fd'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundSize: '1.5em 1.5em',
                  paddingRight: '2.5rem'
                }}
              >
                <option value="overview">Overview</option>
                <option value="manage">Manage ({totalSessions})</option>
                <option value="search">Search</option>
                <option value="students">Add Students</option>
                <option value="reports">Reports</option>
                <option value="coordinators">Coordinators ({coordinators.length})</option>
              </select>
            </div>
          </div>

          {/* Desktop Tabs */}
          <div className="hidden md:block bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'overview'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('manage')}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'manage'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                }`}
              >
                Manage ({totalSessions})
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'search'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setActiveTab('students')}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'students'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                }`}
              >
                Add Students
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'reports'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                }`}
              >
                Reports
              </button>
              <button
                onClick={() => setActiveTab('coordinators')}
                className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'coordinators'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                }`}
              >
                Coordinators ({coordinators.length})
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Actions - 2 rows on mobile, 3 columns on desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                  onClick={() => router.push('/attendance/admin/sessions/create')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg
                      className="w-6 h-6 text-purple-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Create Sessions
                  </h3>
                  <p className="text-white/60 text-sm">
                    Create multiple sessions for a specific date
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab('manage')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg
                      className="w-6 h-6 text-blue-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Manage Sessions
                  </h3>
                  <p className="text-white/60 text-sm">
                    Edit, delete, and organize all sessions
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab('search')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg
                      className="w-6 h-6 text-cyan-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Search Attendance
                  </h3>
                  <p className="text-white/60 text-sm">
                    Search and view attendance records
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab('students')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg
                      className="w-6 h-6 text-emerald-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Add Students
                  </h3>
                  <p className="text-white/60 text-sm">
                    Bulk import or add individual students
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab('reports')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 border border-orange-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg
                      className="w-6 h-6 text-orange-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Generate Reports
                  </h3>
                  <p className="text-white/60 text-sm">
                    Export attendance reports and analytics
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab('coordinators')}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-left hover:bg-white/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-pink-500/20 border border-pink-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg
                      className="w-6 h-6 text-pink-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Manage Coordinators
                  </h3>
                  <p className="text-white/60 text-sm">
                    Assign coordinators to mark attendance
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Manage Tab */}
          {activeTab === 'manage' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-blue-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Manage Sessions</h2>
              <p className="text-white/60 mb-6">
                Edit, delete, cancel, and organize all your sessions in one place
              </p>
              <button
                onClick={() => router.push('/attendance/admin/sessions/manage')}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-semibold rounded-xl shadow-lg transition-all"
              >
                Go to Session Management
              </button>
            </div>
          )}

          {/* Search Tab */}
          {activeTab === 'search' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-cyan-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Search Attendance</h2>
              <p className="text-white/60 mb-6">
                Search and view attendance records by student, date, or session
              </p>
              <button
                onClick={() => router.push('/attendance/admin/search')}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg transition-all"
              >
                Go to Search
              </button>
            </div>
          )}

          {/* Add Students Tab */}
          {activeTab === 'students' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-emerald-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Add Students</h2>
              <p className="text-white/60 mb-6">
                Import students in bulk via CSV or add individual students manually
              </p>
              <button
                onClick={() => router.push('/attendance/admin/add')}
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold rounded-xl shadow-lg transition-all"
              >
                Go to Add Students
              </button>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/20 border border-orange-400/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-orange-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Generate Reports</h2>
              <p className="text-white/60 mb-6">
                Export attendance reports, analytics, and statistics in various formats
              </p>
              <button
                onClick={() => router.push('/attendance/admin/reports')}
                className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold rounded-xl shadow-lg transition-all"
              >
                Go to Reports
              </button>
            </div>
          )}

          {/* Coordinators Tab */}
          {activeTab === 'coordinators' && (
            <div className="space-y-6">
              {/* Add Coordinator */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-white mb-2">
                  Add Coordinator
                </h2>
                <p className="text-white/70 text-sm mb-6">
                  Coordinators can mark attendance for all students across all committees. They must complete onboarding before accessing the portal.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Coordinator Email
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="email"
                        value={newCoordinatorEmail}
                        onChange={(e) => {
                          setNewCoordinatorEmail(e.target.value);
                          setCoordinatorError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newCoordinatorEmail.trim()) {
                            handleAddCoordinator();
                          }
                        }}
                        placeholder="coordinator@karunya.edu.in"
                        className="flex-1 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        disabled={addingCoordinator}
                      />
                      <button
                        onClick={handleAddCoordinator}
                        disabled={addingCoordinator || !newCoordinatorEmail.trim()}
                        className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingCoordinator ? (
                          <span className="flex items-center gap-2 justify-center">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                            </svg>
                            Adding...
                          </span>
                        ) : (
                          'Add Coordinator'
                        )}
                      </button>
                    </div>
                    {coordinatorError && (
                      <p className="text-xs text-red-300 mt-2">{coordinatorError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Coordinators List */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h2 className="text-xl font-bold text-white mb-6">
                  Current Coordinators ({coordinators.length})
                </h2>

                {coordinators.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-white/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-white/70">
                      No coordinators assigned yet. Add coordinators to enable attendance marking.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {coordinators.map((coordinator, index) => {
                      const coordinatorKey = coordinator.email || `coordinator-${index}`;
                      const isRemoving = removingCoordinator === coordinator.email;
                      
                      return (
                        <div
                          key={coordinatorKey}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 transition-all ${
                            isRemoving ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {coordinator.email}
                            </p>
                            <p className="text-xs text-white/60 mt-1">
                              Assigned by {coordinator.assignedBy || 'Unknown'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveCoordinator(coordinator.email)}
                            disabled={isRemoving}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-100 hover:bg-red-500/30 border border-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRemoving ? (
                              <span className="flex items-center gap-2 justify-center">
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                                </svg>
                                Removing...
                              </span>
                            ) : (
                              'Remove'
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Custom scrollbar hide CSS */}
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
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
