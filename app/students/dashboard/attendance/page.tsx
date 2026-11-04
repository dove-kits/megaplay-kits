'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { getStudentByEmail, Student } from '@/lib/services/studentService';
import {
  getSessionsSummary,
  getTotalSessionsFromSummary,
  getSummaryDates,
  SessionsSummary,
} from '@/lib/services/sessionService';
import {
  getStudentAttendanceByDates,
  getStudentAttendanceCount,
} from '@/lib/services/attendanceService';

interface SessionStatus {
  sessionNumber: number;
  present: boolean | null; // null means session didn't exist that day
}

interface DateAttendance {
  date: string;
  sessions: SessionStatus[];
}

// How many dates are shown by default / added by "Load older days"
const PAGE_SIZE = 2;

export default function StudentAttendancePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // From the summary doc (1 read): which dates / session numbers exist
  const [summary, setSummary] = useState<SessionsSummary>({});
  // From a COUNT query (about 1 read): sessions this student attended
  const [presentSessions, setPresentSessions] = useState(0);

  // Attendance for the dates that have been loaded so far:
  // { "2026-11-04": [1, 3, 4] }  (= session numbers attended)
  const [attendedByDate, setAttendedByDate] = useState<Record<string, number[]>>({});
  const fetchedDatesRef = useRef<Set<string>>(new Set());
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // View: latest N dates (default) OR one picked date
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pickedDate, setPickedDate] = useState<string>('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, authLoading]);

  /**
   * Base load: student (1) + summary (1) + count (about 1) = about 3 reads.
   * No session or attendance collection is scanned.
   */
  const loadBaseData = async () => {
    try {
      setLoading(true);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        alert('No active year configured.');
        router.push('/students/dashboard');
        return;
      }

      const year = settings.currentYear;
      setCurrentYear(year);

      if (!user?.email) {
        router.push('/login');
        return;
      }

      const studentData = await getStudentByEmail(year, user.email);

      if (!studentData) {
        alert('Student record not found.');
        router.push('/students/dashboard');
        return;
      }

      if (studentData.status !== 'approved') {
        router.push('/students');
        return;
      }

      setStudent(studentData);

      const [summaryData, presentCount] = await Promise.all([
        getSessionsSummary(year),
        getStudentAttendanceCount(year, studentData.regno),
      ]);

      setSummary(summaryData);
      setPresentSessions(presentCount);
    } catch (error) {
      console.error('Failed to load attendance:', error);
      alert('Failed to load attendance data.');
    } finally {
      setLoading(false);
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

  // All dates that have sessions, newest first (0 reads)
  const allDates = useMemo(() => getSummaryDates(summary), [summary]);

  // Highest session number across all dates = number of grid columns
  const maxSessionNumber = useMemo(() => {
    let max = 0;
    Object.values(summary).forEach((list) => {
      (list || []).forEach((n) => {
        if (n > max) max = n;
      });
    });
    return max;
  }, [summary]);

  // Dates shown right now
  const visibleDates = useMemo(
    () => (pickedDate ? [pickedDate] : allDates.slice(0, visibleCount)),
    [pickedDate, allDates, visibleCount]
  );

  // Load attendance ONLY for visible dates that were not loaded before.
  // Cost: about 1 read per attendance record on those dates
  // (about 6 reads for 2 days at 3 sessions/day, about 12 at 6 sessions/day).
  useEffect(() => {
    if (!student || !currentYear) return;

    const missing = visibleDates.filter((d) => !fetchedDatesRef.current.has(d));
    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      setLoadingDates(true);
      setLoadError(null);
      try {
        const records = await getStudentAttendanceByDates(
          currentYear,
          student.regno,
          missing
        );
        if (cancelled) return;

        missing.forEach((d) => fetchedDatesRef.current.add(d));

        setAttendedByDate((prev) => {
          const next = { ...prev };
          missing.forEach((d) => {
            next[d] = [];
          });
          records.forEach((r) => {
            next[r.date] = [...(next[r.date] || []), r.sessionNumber];
          });
          return next;
        });
      } catch (error) {
        console.error('Failed to load attendance for dates:', error);
        // Do NOT mark the dates as fetched, otherwise they would show as Absent.
        if (!cancelled) {
          setLoadError(
            'Could not load attendance for these dates. Please try again in a moment.'
          );
        }
      } finally {
        if (!cancelled) setLoadingDates(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visibleDates, student, currentYear]);

  // Rows for the grid
  const dateWiseAttendance = useMemo(() => {
    const rows: DateAttendance[] = [];

    visibleDates.forEach((date) => {
      // Not loaded yet: skip, so nothing shows as Absent by mistake
      if (!fetchedDatesRef.current.has(date) || !attendedByDate[date]) return;

      const existing = new Set(summary[date] || []);
      const attended = new Set(attendedByDate[date] || []);

      const sessions: SessionStatus[] = [];
      for (let n = 1; n <= maxSessionNumber; n++) {
        if (existing.has(n)) {
          sessions.push({ sessionNumber: n, present: attended.has(n) });
        } else {
          sessions.push({ sessionNumber: n, present: null });
        }
      }

      rows.push({ date, sessions });
    });

    return rows;
  }, [visibleDates, attendedByDate, summary, maxSessionNumber]);

  // Statistics (whole term) from the summary total + COUNT query
  const stats = useMemo(() => {
    const totalSessions = getTotalSessionsFromSummary(summary);
    const absentSessions = Math.max(0, totalSessions - presentSessions);

    const presentHours = presentSessions * 3;
    const totalHours = totalSessions * 3;
    const absentHours = absentSessions * 3;
    const percentage =
      totalHours > 0 ? Math.min(100, (presentHours / totalHours) * 100) : 0;

    return {
      presentSessions,
      absentSessions,
      totalSessions,
      presentHours,
      absentHours,
      totalHours,
      percentage: parseFloat(percentage.toFixed(2)),
    };
  }, [summary, presentSessions]);

  const hasOlderDates = !pickedDate && visibleCount < allDates.length;

  // Get percentage color
  const getPercentageColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-emerald-400';
    if (percentage >= 75) return 'text-blue-400';
    if (percentage >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Parse YYYY-MM-DD as a LOCAL date (new Date('YYYY-MM-DD') is UTC)
  const parseLocalDate = (dateStr: string): Date => new Date(dateStr + 'T00:00:00');

  const formatDate = (dateStr: string): string =>
    parseLocalDate(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const getDayName = (dateStr: string): string =>
    parseLocalDate(dateStr).toLocaleDateString('en-IN', { weekday: 'short' });

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]"></div>
        <div className="absolute top-20 -left-40 w-80 h-80 bg-blue-500/15 rounded-full blur-[110px] animate-pulse"></div>
        <div className="absolute bottom-20 -right-40 w-80 h-80 bg-purple-500/15 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading attendance...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#000000] text-white">
        <p>Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#000000]">
      {/* Background System */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]"></div>
      
      {/* Animated Blobs */}
      <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-blue-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/8 rounded-full blur-[90px]"></div>

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/students/dashboard"
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all hover:-translate-y-[1px] active:translate-y-[1px]"
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
              </Link>
              <div className="flex items-center justify-center">
                <Image
                  src="/klo2.svg"
                  alt="MegaPlay"
                  width={50}
                  height={50}
                  className="drop-shadow-2xl"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
                  Attendance Details
                </h1>
                <p className="text-xs text-indigo-400 font-medium">
                  Year {currentYear || 'N/A'} • {student.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{student.regno}</p>
                <p className="text-xs text-white/60">{student.department}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {isLoggingOut ? 'Logging out...' : 'Logout'}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          <div className="space-y-8">
            {/* Statistics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Present */}
              <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 border border-emerald-500/30 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] sm:text-xs text-emerald-200/80 uppercase tracking-wider">
                    Present
                  </p>
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-300"
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
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-100 mb-1">
                  {stats.presentHours}
                </p>
                <p className="text-[10px] sm:text-xs text-emerald-200/60">
                  {stats.presentSessions} sessions
                </p>
              </div>

              {/* Absent */}
              <div className="bg-gradient-to-br from-red-500/20 to-rose-600/20 border border-red-500/30 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] sm:text-xs text-red-200/80 uppercase tracking-wider">
                    Absent
                  </p>
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 text-red-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-red-100 mb-1">
                  {stats.absentHours}
                </p>
                <p className="text-[10px] sm:text-xs text-red-200/60">
                  {stats.absentSessions} sessions
                </p>
              </div>

              {/* Total */}
              <div className="bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border border-blue-500/30 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] sm:text-xs text-blue-200/80 uppercase tracking-wider">
                    Total
                  </p>
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 text-blue-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-blue-100 mb-1">
                  {stats.totalHours}
                </p>
                <p className="text-[10px] sm:text-xs text-blue-200/60">
                  {stats.totalSessions} sessions
                </p>
              </div>

              {/* Percentage */}
              <div className="bg-gradient-to-br from-purple-500/20 to-pink-600/20 border border-purple-500/30 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] sm:text-xs text-purple-200/80 uppercase tracking-wider">
                    Percentage
                  </p>
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <p className={`text-2xl sm:text-3xl font-bold mb-1 ${getPercentageColor(stats.percentage)}`}>
                  {stats.percentage}%
                </p>
                <p className="text-[10px] sm:text-xs text-purple-200/60">Overall attendance</p>
              </div>
            </div>

            {/* Date Picker */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
              <div className="flex flex-col md:flex-row gap-4 md:items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-white mb-2">
                    View a specific date
                  </label>
                  <select
                    value={pickedDate}
                    onChange={(e) => setPickedDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">Latest {PAGE_SIZE} days</option>
                    {allDates.map((date) => (
                      <option key={date} value={date}>
                        {formatDate(date)} ({getDayName(date)})
                      </option>
                    ))}
                  </select>
                </div>

                {pickedDate && (
                  <button
                    onClick={() => {
                      setPickedDate('');
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="px-5 py-3 rounded-2xl bg-indigo-500/20 border border-indigo-400/60 text-indigo-100 text-sm font-medium hover:bg-indigo-500/30 transition-all"
                  >
                    Back to latest {PAGE_SIZE} days
                  </button>
                )}
              </div>
              <p className="text-xs text-white/50 mt-3">
                Only the dates shown below are loaded, which keeps the page fast.
              </p>
            </div>

            {/* Attendance Grid */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between gap-3">
                <h3 className="text-lg sm:text-xl font-bold text-white">Attendance Records</h3>
                {loadingDates && (
                  <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>

              {loadError && (
                <div className="mx-4 sm:mx-6 mt-4 rounded-2xl bg-red-500/10 border border-red-500/40 px-4 py-3 text-sm text-red-100">
                  {loadError}
                </div>
              )}

              <div className="overflow-x-auto">
                {allDates.length === 0 ? (
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
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                      />
                    </svg>
                    <p className="text-white/60 text-base sm:text-lg">No sessions yet</p>
                    <p className="text-white/40 text-xs sm:text-sm mt-2">
                      Check back after the first session is created
                    </p>
                  </div>
                ) : dateWiseAttendance.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center">
                    <p className="text-white/60 text-base sm:text-lg">
                      {loadingDates ? 'Loading attendance...' : 'No attendance to show'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-black/20 border-b border-white/10">
                      <tr>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-200 sticky left-0 bg-black/20 backdrop-blur-xl z-10">
                          Date
                        </th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-200">
                          Day
                        </th>
                        {Array.from({ length: maxSessionNumber }, (_, i) => i + 1).map(
                          (sessionNum) => (
                            <th
                              key={sessionNum}
                              className="px-2 sm:px-6 py-3 sm:py-4 text-center text-xs sm:text-sm font-semibold text-slate-200"
                            >
                              <span className="hidden sm:inline">Session {sessionNum}</span>
                              <span className="sm:hidden">S{sessionNum}</span>
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {dateWiseAttendance.map((dateAtt) => (
                        <tr key={dateAtt.date} className="hover:bg-white/5 transition-colors">
                          <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-white sticky left-0 bg-[#000000]/90 backdrop-blur-xl z-10">
                            <div className="text-xs sm:text-sm">
                              {formatDate(dateAtt.date)}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-white/70">
                            {getDayName(dateAtt.date)}
                          </td>
                          {dateAtt.sessions.map((session) => (
                            <td key={session.sessionNumber} className="px-2 sm:px-6 py-3 sm:py-4 text-center">
                              {session.present === null ? (
                                // Session didn't exist on this date
                                <span className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 text-white/40 text-xl sm:text-2xl font-light">
                                  -
                                </span>
                              ) : session.present ? (
                                // Student was present
                                <span className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs sm:text-sm shadow-lg">
                                  P
                                </span>
                              ) : (
                                // Student was absent
                                <span className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold text-xs sm:text-sm shadow-lg">
                                  A
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Load older days */}
              {hasOlderDates && (
                <div className="p-4 sm:p-6 border-t border-white/10 text-center">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    disabled={loadingDates}
                    className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/20 text-white text-sm font-medium transition-all disabled:opacity-50"
                  >
                    Load older days
                  </button>
                </div>
              )}
            </div>
          </div>
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
