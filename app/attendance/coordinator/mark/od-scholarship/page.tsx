'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isCoordinator } from '@/lib/services/coordinatorService';
import { getSessionsByDate, Session } from '@/lib/services/sessionService';
import {
  markAttendance,
  getSessionAttendance,
  deleteAttendance,
  AttendanceRecord,
} from '@/lib/services/attendanceService';
import { getBaseCommittees, BaseCommittee } from '@/lib/services/committeeService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getYearCollectionName } from '@/lib/services/settingsService';

export default function ODScholarshipMarkingPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [baseCommittees, setBaseCommittees] = useState<BaseCommittee[]>([]);

  // Step 1: Date Selection
  const [selectedDate, setSelectedDate] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Step 2: Session Selection
  const [availableSessions, setAvailableSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Step 3: Marking
  const [regnoInput, setRegnoInput] = useState('');
  const [markedStudents, setMarkedStudents] = useState<AttendanceRecord[]>([]);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState<{
    name: string;
    regno: string;
    committee: string;
    category: string;
    time: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Get committee name by key from base committees
  const getCommitteeName = (key: string | undefined | null): string => {
    if (!key) return 'Unknown';
    
    const committee = baseCommittees.find(c => c && c.key === key);
    if (committee) return committee.name || key;
    
    // Fallback: Format key as name
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadData();
  }, [user, authLoading]);

  const loadData = async () => {
    try {
      setLoading(true);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        alert('No active year configured.');
        router.push('/login');
        return;
      }

      setCurrentYear(settings.currentYear);

      const isCoord = await isCoordinator(user?.email || '', settings.currentYear);
      if (!isCoord) {
        alert('Access denied. You are not a coordinator.');
        router.push('/login');
        return;
      }

      // Load base committees
      const committees = await getBaseCommittees();
      setBaseCommittees(Array.isArray(committees) ? committees : []);

      // Set default date to today
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
      await loadSessionsForDate(today, settings.currentYear);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load marking page.');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionsForDate = async (date: string, year: string) => {
    if (!date) return;

    setLoadingSessions(true);
    setError('');

    try {
      const sessions = await getSessionsByDate(year, date);
      setAvailableSessions(sessions);

      if (sessions.length === 0) {
        setError('No sessions found for this date');
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setError('Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedSession(null);
    setMarkedStudents([]);
    setError('');
    setSuccessMessage(null);

    if (currentYear) {
      loadSessionsForDate(date, currentYear);
    }
  };

  const handleSessionSelect = async (session: Session) => {
    setSelectedSession(session);
    setError('');
    setSuccessMessage(null);
    setRegnoInput('');

    if (!currentYear) return;

    try {
      const attendance = await getSessionAttendance(currentYear, session.sessionId);
      // Filter by markedCategory for OD/Scholarship page
      const filtered = attendance.filter((a) => 
        a.markedCategory === 'od' || a.markedCategory === 'scholarship'
      );
      setMarkedStudents(filtered);
    } catch (error) {
      console.error('Failed to load attendance:', error);
    }
  };

  const handleMarkAttendance = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentYear || !selectedSession || !user?.email) return;
    if (!regnoInput.trim()) {
      setError('Please enter a registration number');
      return;
    }

    if (!selectedDate) {
      setError('No date selected');
      return;
    }

    setMarking(true);
    setError('');
    setSuccessMessage(null);

    try {
      // Get student's registered category first
      const studentsCol = getYearCollectionName('students', currentYear);
      const studentRef = doc(db, studentsCol, regnoInput.trim().toUpperCase());
      const studentSnap = await getDoc(studentRef);

      if (!studentSnap.exists()) {
        setError('Student not found in database');
        setMarking(false);
        return;
      }

      const studentData = studentSnap.data();

      if (studentData.status !== 'approved') {
        setError('Student registration is not approved');
        setMarking(false);
        return;
      }

      // Determine the markedCategory based on student's registeredCategory
      let markedCategory: 'od' | 'scholarship';
      
      if (studentData.category === 'scholarship') {
        markedCategory = 'scholarship';
      } else {
        // For 'normal' category students, mark as 'od'
        markedCategory = 'od';
      }

      // Mark attendance with the appropriate category
      const result = await markAttendance(
        currentYear,
        selectedSession.sessionId,
        selectedSession.name,
        selectedDate,
        selectedSession.sessionNumber,
        regnoInput.trim().toUpperCase(),
        markedCategory,
        user.email
      );

      if (result.success && result.record) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        setSuccessMessage({
          name: result.record.studentName,
          regno: result.record.regno,
          committee: getCommitteeName(result.record.registeredCommittee),
          category:
            result.record.markedCategory === 'scholarship'
              ? 'SCHOLARSHIP' 
              : 'OD',
          time: timeString,
        });

        setMarkedStudents((prev) => [result.record!, ...prev]);
        setRegnoInput('');

        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(result.error || 'Failed to mark attendance');
      }
    } catch (error) {
      console.error('Failed to mark attendance:', error);
      setError('Failed to mark attendance. Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const handleDelete = async (attendanceId: string, studentName: string) => {
    if (!currentYear || !attendanceId) {
      console.error('Missing currentYear or attendanceId');
      alert('Cannot delete: Missing required data');
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete attendance for ${studentName}?`
    );
    if (!confirmed) return;

    setDeletingId(attendanceId);

    try {
      await deleteAttendance(currentYear, attendanceId);

      setMarkedStudents((prev) => prev.filter((s) => s.attendanceId !== attendanceId));

      setSuccessMessage({
        name: studentName,
        regno: '',
        committee: '',
        category: '',
        time: 'Deleted',
      });
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Failed to delete attendance:', error);
      alert('Failed to delete attendance. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = async () => {
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
        {/* Background Elements */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px] animate-pulse"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
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
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/attendance/coordinator/mark')}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div className="flex items-center justify-center">
                <Image
                  src="/klo2.svg"
                  alt="Logo"
                  width={55}
                  height={55}
                  className="drop-shadow-2xl"
                />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
                  OD/Scholarship Attendance
                </h1>
                <p className="text-xs text-blue-400 font-medium">
                  Coordinator • Year {currentYear || 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm text-white/80">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="px-3 sm:px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {isLoggingOut ? 'Logging out...' : 'Logout'}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-[fadeInUp_0.7s_ease-out]">
          {!selectedSession ? (
            // Date & Session Selection
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Date Selection */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
                <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 sm:mb-6 flex items-center gap-2">
                  <svg
                    className="w-6 h-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Select Date
                </h2>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-calendar-picker-indicator]:invert"
                />
              </div>

              {/* Session List */}
              {loadingSessions ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-white/70">Loading sessions...</p>
                </div>
              ) : error && availableSessions.length === 0 ? (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 sm:p-10 text-center shadow-2xl">
                  <svg
                    className="w-16 h-16 text-white/30 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-white/60 text-lg">{error}</p>
                  <p className="text-white/40 text-sm mt-2">Try selecting a different date</p>
                </div>
              ) : availableSessions.length > 0 ? (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
                  <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4 sm:mb-6">
                    Available Sessions ({availableSessions.length})
                  </h2>
                  <div className="space-y-3">
                    {availableSessions.map((session) => (
                      <button
                        key={session.sessionId}
                        onClick={() => handleSessionSelect(session)}
                        className="w-full text-left px-4 sm:px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 rounded-2xl transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-base sm:text-lg font-semibold text-white group-hover:text-blue-300 transition-colors">
                              Session {session.sessionNumber}: {session.name}
                            </p>
                            <p className="text-xs sm:text-sm text-white/60 mt-1">
                              {session.attendanceCount} students marked • {session.status}
                            </p>
                          </div>
                          <svg
                            className="w-5 h-5 sm:w-6 sm:h-6 text-white/40 group-hover:text-blue-300 transition-colors flex-shrink-0 ml-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            // Marking Interface
            <div className="space-y-6">
              {/* Session Header */}
              <div className="bg-white/5 backdrop-blur-xl border border-blue-400/30 rounded-3xl p-4 sm:p-6 shadow-2xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-white mb-1">
                      {selectedSession.name}
                    </h2>
                    <p className="text-xs sm:text-sm text-blue-300">
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}{' '}
                      • Session {selectedSession.sessionNumber} • OD/Scholarship
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSession(null);
                      setMarkedStudents([]);
                      setSuccessMessage(null);
                    }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition-all"
                  >
                    Change Session
                  </button>
                </div>
              </div>

              {/* Marking Form */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Scan or Enter Register Number
                </h3>

                <form onSubmit={handleMarkAttendance} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      value={regnoInput}
                      onChange={(e) => {
                        setRegnoInput(e.target.value.toUpperCase());
                        setError('');
                        setSuccessMessage(null);
                      }}
                      placeholder="Scan barcode or type register number..."
                      disabled={marking}
                      autoFocus
                      className="w-full bg-white/5 border-2 border-blue-500/60 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-white text-base sm:text-lg placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase disabled:opacity-50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={marking || !regnoInput.trim()}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-2xl shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-lg"
                  >
                    {marking ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Marking Attendance...
                      </span>
                    ) : (
                      'Mark Attendance'
                    )}
                  </button>
                </form>

                {/* Success Message */}
                {successMessage && (
                  <div className="mt-4 px-4 sm:px-6 py-4 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400/50 flex items-start gap-3 animate-[fadeInUp_0.5s_ease-out]">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-emerald-100 font-semibold text-base sm:text-lg mb-1 flex items-center gap-2">
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Attendance Marked Successfully!
                      </p>
                      <p className="text-white font-bold text-lg sm:text-xl mb-2">
                        {successMessage.name} ({successMessage.regno})
                      </p>
                      <p className="text-emerald-200 text-xs sm:text-sm">
                        Committee: {successMessage.committee} • Category:{' '}
                        {successMessage.category} • {successMessage.time}
                      </p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="mt-4 px-4 py-3 rounded-2xl bg-red-500/20 border border-red-400/40 text-red-100 text-sm flex items-center gap-2 animate-[fadeInUp_0.5s_ease-out]">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}
              </div>

              {/* Marked Students */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-4 sm:p-6 border-b border-white/10">
                  <h3 className="text-lg sm:text-xl font-semibold text-white">
                    Session Attendance ({markedStudents.length})
                  </h3>
                  <p className="text-xs sm:text-sm text-white/60 mt-1">
                    Students marked for this session
                  </p>
                </div>

                {markedStudents.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center">
                    <svg
                      className="w-12 h-12 sm:w-16 sm:h-16 text-white/30 mx-auto mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <p className="text-white/60 text-base sm:text-lg">No students marked yet</p>
                    <p className="text-white/40 text-xs sm:text-sm mt-2">
                      Start scanning or entering registration numbers
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-black/20 border-b border-white/10">
                        <tr>
                          <th className="text-left text-xs sm:text-sm font-semibold text-slate-200 py-3 px-3 sm:px-4">
                            Time
                          </th>
                          <th className="text-left text-xs sm:text-sm font-semibold text-slate-200 py-3 px-3 sm:px-4">
                            Reg No
                          </th>
                          <th className="text-left text-xs sm:text-sm font-semibold text-slate-200 py-3 px-3 sm:px-4">
                            Name
                          </th>
                          <th className="text-left text-xs sm:text-sm font-semibold text-slate-200 py-3 px-3 sm:px-4 hidden md:table-cell">
                            Committee
                          </th>
                          <th className="text-left text-xs sm:text-sm font-semibold text-slate-200 py-3 px-3 sm:px-4">
                            Category
                          </th>
                          <th className="text-left text-xs sm:text-sm font-semibold text-slate-200 py-3 px-3 sm:px-4">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {markedStudents.map((record, index) => {
                          const time = record.markedAt?.toDate
                            ? record.markedAt.toDate().toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                              })
                            : '';

                          const uniqueKey = record.attendanceId 
                            ? `od-${record.attendanceId}-${index}`
                            : `od-temp-${record.regno}-${index}`;

                          return (
                            <tr
                              key={uniqueKey}
                              className="hover:bg-white/5 transition-colors"
                            >
                              <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm text-white/60">{time}</td>
                              <td className="py-3 px-3 sm:px-4">
                                <span className="text-xs sm:text-sm font-mono font-semibold text-blue-400">
                                  {record.regno}
                                </span>
                              </td>
                              <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm text-white font-medium">
                                {record.studentName}
                              </td>
                              <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm text-slate-300 hidden md:table-cell">
                                {getCommitteeName(record.registeredCommittee)}
                              </td>
                              <td className="py-3 px-3 sm:px-4">
                                <span 
                                  className={`px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded-full border ${
                                    record.markedCategory === 'scholarship'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                                      : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                                  }`}
                                >
                                  {record.markedCategory === 'scholarship' ? 'Scholarship' : 'OD'}
                                </span>
                              </td>
                              <td className="py-3 px-3 sm:px-4">
                                <button
                                  onClick={() =>
                                    handleDelete(record.attendanceId!, record.studentName)
                                  }
                                  disabled={deletingId === record.attendanceId || !record.attendanceId}
                                  className="px-2 sm:px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] sm:text-xs font-medium rounded-lg border border-red-400/30 hover:border-red-400/50 transition-all disabled:opacity-50 flex items-center gap-1"
                                >
                                  <svg
                                    className="w-3 h-3 sm:w-4 sm:h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                  <span className="hidden sm:inline">
                                    {deletingId === record.attendanceId ? 'Deleting...' : 'Delete'}
                                  </span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

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
