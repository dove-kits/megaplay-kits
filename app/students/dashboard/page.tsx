'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService';
import { getStudentByEmail, Student } from '@/lib/services/studentService';
import {
  getSessionsSummary,
  getTotalSessionsFromSummary,
} from '@/lib/services/sessionService';
import { getStudentAttendanceCount } from '@/lib/services/attendanceService';

interface AttendanceStats {
  presentHours: number;
  absentHours: number;
  totalHours: number;
  percentage: number;
}

export default function StudentDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [committeeName, setCommitteeName] = useState<string>('');
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats>({
    presentHours: 0,
    absentHours: 0,
    totalHours: 0,
    percentage: 0,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, authLoading]);

  /**
   * Cost per visit (about 4-5 reads, flat for the whole term):
   *   settings (cached) 0-1, student 1, summary 1, count ~1, committee 1.
   * Before: every session + every attendance record of the year.
   */
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        alert('No active year configured.');
        router.push('/students');
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
        router.push('/students');
        return;
      }

      if (studentData.status !== 'approved') {
        router.push('/students');
        return;
      }

      setStudent(studentData);

      // Committee name + attendance stats in parallel
      await Promise.all([
        loadCommitteeName(year, studentData.committee),
        calculateAttendanceStats(year, studentData.regno),
      ]);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      alert('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  // 1 read (the old code read every committee of the year to find one name)
  const loadCommitteeName = async (year: string, committeeKey?: string) => {
    if (!committeeKey) return;

    try {
      const snap = await getDoc(
        doc(db, getYearCollectionName('committees', year), committeeKey)
      );
      const name = snap.exists() ? (snap.data()?.name as string | undefined) : undefined;
      setCommitteeName(name || committeeKey);
    } catch (error) {
      console.error('Failed to load committee:', error);
      setCommitteeName(committeeKey);
    }
  };

  const calculateAttendanceStats = async (year: string, regno: string) => {
    try {
      // Summary doc (1 read) = total non-cancelled sessions.
      // COUNT aggregation (about 1 read) = sessions this student attended.
      const [summary, presentSessions] = await Promise.all([
        getSessionsSummary(year),
        getStudentAttendanceCount(year, regno),
      ]);

      const totalSessions = getTotalSessionsFromSummary(summary);
      const absentSessions = Math.max(0, totalSessions - presentSessions);

      const presentHours = presentSessions * 3;
      const totalHours = totalSessions * 3;
      const absentHours = absentSessions * 3;
      const percentage =
        totalHours > 0 ? Math.min(100, (presentHours / totalHours) * 100) : 0;

      setAttendanceStats({
        presentHours,
        absentHours,
        totalHours,
        percentage: parseFloat(percentage.toFixed(2)),
      });
    } catch (error) {
      console.error('Failed to calculate attendance:', error);
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

  const getInitials = (name: string): string => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getPercentageColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-emerald-500';
    if (percentage >= 75) return 'text-blue-500';
    if (percentage >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#02030a]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]"></div>
        <div className="absolute top-20 -left-40 w-80 h-80 bg-blue-500/15 rounded-full blur-[110px] animate-pulse"></div>
        <div className="absolute bottom-20 -right-40 w-80 h-80 bg-purple-500/15 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading dashboard...</p>
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
              <div className="flex items-center justify-center">
                <Image
                  src="/klo2.svg"
                  alt="MegaPlay"
                  width={55}
                  height={55}
                  className="drop-shadow-2xl"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
                  Student Dashboard
                </h1>
                <p className="text-xs text-indigo-400 font-medium">
                  Year {currentYear || 'N/A'} • {committeeName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{student.name}</p>
                <p className="text-xs text-white/60">{student.regno}</p>
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
          <div className="space-y-6">
            {/* Profile Card with Attendance */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl">
              <div className="flex flex-col items-center sm:items-start sm:flex-row gap-4 sm:gap-6">
                {/* Left: Profile Picture */}
                <div className="relative flex-shrink-0">
                  <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden">
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-5xl sm:text-6xl font-bold text-white">
                        {getInitials(student.name)}
                      </span>
                    </div>
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-xl border-4 border-[#000000]">
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Right: Student Info and Attendance */}
                <div className="flex-1 w-full flex flex-col items-center sm:items-start justify-between sm:h-40">
                  {/* Student Name and Details */}
                  <div className="text-center sm:text-left w-full">
                    <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                      <h2 className="text-xl sm:text-2xl font-bold text-white uppercase">
                        {student.name}
                      </h2>
                      <svg
                        className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-white/70 mb-4 sm:mb-0">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                        />
                      </svg>
                      <span className="font-mono font-semibold">{student.regno}</span>
                    </div>
                  </div>

                  {/* Attendance Percentage Box */}
                  <div className="w-full sm:w-auto">
                    <div className="border-2 border-dashed border-white/20 rounded-xl px-6 py-3 flex flex-col items-center justify-center w-full sm:w-auto">
                      <p className="text-xs text-white/60 uppercase tracking-wider mb-1">
                        Overall Attendance
                      </p>
                      <p className={`text-3xl font-bold ${getPercentageColor(attendanceStats.percentage)}`}>
                        {attendanceStats.percentage}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* View Profile */}
              <Link
                href="/students/dashboard/profile"
                className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl hover:bg-white/10 transition-all duration-300 hover:-translate-y-[1px] active:translate-y-[1px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-shadow">
                      <svg
                        className="w-7 h-7 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">
                        View Profile
                      </h3>
                      <p className="text-sm text-white/60">
                        Complete personal & academic details
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-6 h-6 text-indigo-300 group-hover:translate-x-1 transition-transform"
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
              </Link>

              {/* View Attendance */}
              <Link
                href="/students/dashboard/attendance"
                className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl hover:bg-white/10 transition-all duration-300 hover:-translate-y-[1px] active:translate-y-[1px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-shadow">
                      <svg
                        className="w-7 h-7 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">
                        View Attendance
                      </h3>
                      <p className="text-sm text-white/60">
                        Date-wise attendance with sessions
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-6 h-6 text-indigo-300 group-hover:translate-x-1 transition-transform"
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
              </Link>
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
