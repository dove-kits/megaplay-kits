// app/committee/[key]/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService';
import { getCommitteesForYear, Committee } from '@/lib/services/committeeService';
import { getFacultiesByYear } from '@/lib/services/facultyService';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface Student {
  id: string;
  regno: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  hostel: string;
  roomNumber: string;
  committee: string;
  category: 'normal' | 'scholarship';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  reviewedBy?: string;
  reviewedAt?: any;
  rejectionReason?: string;
}

type TabType = 'pending' | 'approved' | 'rejected';

export default function CommitteeDashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const committeeKey = params.key as string;

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [allCommittees, setAllCommittees] = useState<Committee[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (committeeKey) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, committeeKey]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        setError('No active year configured.');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }
      setCurrentYear(settings.currentYear);

      const allComms = await getCommitteesForYear(settings.currentYear);
      if (!Array.isArray(allComms) || allComms.length === 0) {
        setError('No committees found for this year.');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      setAllCommittees(allComms);

      const foundCommittee = allComms.find((c) => c?.key === committeeKey);
      if (!foundCommittee) {
        setError(`Committee '${committeeKey}' not found.`);
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      setCommittee(foundCommittee);

      const faculties = await getFacultiesByYear(settings.currentYear);
      if (!Array.isArray(faculties) || faculties.length === 0) {
        setError('Unable to load faculty data.');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      const faculty = faculties.find((f) => f?.email === user?.email);
      if (!faculty) {
        setError('You are not assigned to any committees.');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      const committees = Array.isArray(faculty.committees) ? faculty.committees : [];
      if (!committees.includes(committeeKey)) {
        setError('You do not have access to this committee.');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      await fetchStudents(settings.currentYear);
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Failed to load committee data.');
      setTimeout(() => router.push('/faculty/dashboard'), 2000);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (year: string) => {
    try {
      if (!year || !committeeKey) {
        console.error('Missing year or committee key');
        setStudents([]);
        return;
      }

      const colName = getYearCollectionName('students', year);
      const studentsRef = collection(db, colName);
      const q = query(studentsRef, where('committee', '==', committeeKey));
      const snapshot = await getDocs(q);

      const studentsList: Student[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data) {
          studentsList.push({
            id: docSnap.id,
            regno: data.regno ?? '',
            name: data.name ?? '',
            email: data.email ?? '',
            phone: data.phone ?? '',
            department: data.department ?? '',
            hostel: data.hostel ?? '',
            roomNumber: data.roomNumber ?? '',
            committee: data.committee ?? '',
            category: data.category ?? 'normal',
            status: data.status ?? 'pending',
            createdAt: data.createdAt,
            reviewedBy: data.reviewedBy,
            reviewedAt: data.reviewedAt,
            rejectionReason: data.rejectionReason,
          });
        }
      });

      setStudents(studentsList);
    } catch (error) {
      console.error('Failed to fetch students:', error);
      setStudents([]);
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

  const stats = {
    total: Array.isArray(students) ? students.length : 0,
    pending: Array.isArray(students)
      ? students.filter((s) => s?.status === 'pending').length
      : 0,
    approved: Array.isArray(students)
      ? students.filter((s) => s?.status === 'approved').length
      : 0,
    rejected: Array.isArray(students)
      ? students.filter((s) => s?.status === 'rejected').length
      : 0,
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_50%)]"></div>
        <div className="absolute top-20 -left-40 w-80 h-80 bg-indigo-500/15 rounded-full blur-[110px] animate-pulse"></div>
        <div className="absolute bottom-20 -right-40 w-80 h-80 bg-purple-500/15 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading committee data...</p>
        </div>
      </div>
    );
  }

  if (error || !committee) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.08),transparent_50%)]"></div>
        
        <div className="relative z-10 text-center max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="text-xl text-red-400 mb-2">
            {error || 'Committee not found'}
          </p>
          <p className="text-white/60 text-sm mb-6">Redirecting to dashboard...</p>
          <button
            onClick={() => router.push('/faculty/dashboard')}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#000000]">
      {/* Background System */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_50%)]"></div>
      
      {/* Animated Blobs */}
      <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-500/8 rounded-full blur-[90px]"></div>

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Left Section: Back Button, Logo, and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Back Button */}
        <button
          onClick={() => router.push('/faculty/dashboard')}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
          title="Back to Dashboard"
        >
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-white"
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
            {committee.name || committeeKey}
          </h1>
          <p className="text-[10px] sm:text-xs text-indigo-400 font-medium truncate">
            Year {currentYear || 'N/A'}
            {committee.description && (
              <span className="text-white/40 ml-1 sm:ml-2 hidden sm:inline">
                • {committee.description}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* User Info - Hidden on mobile/tablet */}
        <div className="hidden lg:block text-right">
          <p className="text-sm text-white/80 truncate max-w-[200px]">{user?.email}</p>
          <p className="text-xs text-white/50 mt-0.5">Faculty Member</p>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isLoggingOut ? (
            <span className="flex items-center gap-1.5 sm:gap-2">
              <svg
                className="w-3 h-3 sm:w-4 sm:h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="hidden sm:inline">Logging out...</span>
            </span>
          ) : (
            'Logout'
          )}
        </button>
      </div>
    </div>
  </div>
</header>


        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          {/* Committee Info Banner */}
          {committee.isActive === false && (
            <div className="bg-orange-500/10 border border-orange-400/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <svg
                className="w-5 h-5 text-orange-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-orange-200 text-sm">
                This committee is currently marked as inactive.
              </p>
            </div>
          )}

          {/* Pending Banner */}
          {stats.pending > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-400/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <svg
                className="w-5 h-5 text-yellow-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-yellow-200 text-sm">
                You have <span className="font-bold">{stats.pending}</span> pending
                student{stats.pending !== 1 ? 's' : ''} to review.
              </p>
            </div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <p className="text-white/60 text-sm mb-1">Total Students</p>
              <p className="text-3xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="bg-yellow-500/10 backdrop-blur-xl border border-yellow-400/20 rounded-2xl p-6">
              <p className="text-yellow-300/80 text-sm mb-1">Pending</p>
              <p className="text-3xl font-bold text-yellow-300">
                {stats.pending}
              </p>
            </div>
            <div className="bg-emerald-500/10 backdrop-blur-xl border border-emerald-400/20 rounded-2xl p-6">
              <p className="text-emerald-300/80 text-sm mb-1">Approved</p>
              <p className="text-3xl font-bold text-emerald-300">
                {stats.approved}
              </p>
            </div>
            <div className="bg-red-500/10 backdrop-blur-xl border border-red-400/20 rounded-2xl p-6">
              <p className="text-red-300/80 text-sm mb-1">Rejected</p>
              <p className="text-3xl font-bold text-red-300">
                {stats.rejected}
              </p>
            </div>
          </div>

          {/* Actions grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Manage Approved / Rejected */}
            <button
              onClick={() =>
                router.push(`/faculty/committee/${committeeKey}/manage`)
              }
              className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/40 rounded-3xl p-6 text-left transition-all flex flex-col justify-between"
            >
              <div>
                <div className="inline-flex items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300 mb-4 p-3">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.7}
                      d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Manage Approved / Rejected
                </h2>
                <p className="text-sm text-white/60">
                  View, update, or delete students who are already approved or rejected for this committee.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-white/50">
                <span>
                  {stats.approved} approved • {stats.rejected} rejected
                </span>
                <span className="group-hover:text-emerald-300 flex items-center gap-1">
                  Open
                  <svg
                    className="w-3 h-3"
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
                </span>
              </div>
            </button>

            {/* Add New Student */}
            <button
              onClick={() =>
                router.push(`/faculty/committee/${committeeKey}/add`)
              }
              className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-400/40 rounded-3xl p-6 text-left transition-all flex flex-col justify-between"
            >
              <div>
                <div className="inline-flex items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 mb-4 p-3">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.7}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Add New Student
                </h2>
                <p className="text-sm text-white/60">
                  Directly add students to this committee without going through the standard registration form.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-white/50">
                <span>Create new record</span>
                <span className="group-hover:text-indigo-300 flex items-center gap-1">
                  Open
                  <svg
                    className="w-3 h-3"
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
                </span>
              </div>
            </button>

            {/* Search Students */}
            <button
              onClick={() =>
                router.push(`/faculty/committee/${committeeKey}/search`)
              }
              className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/40 rounded-3xl p-6 text-left transition-all flex flex-col justify-between"
            >
              <div>
                <div className="inline-flex items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 mb-4 p-3">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.7}
                      d="M21 21l-5.2-5.2M11 18a7 7 0 100-14 7 7 0 000 14z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white mb-1">
                  Search Students
                </h2>
                <p className="text-sm text-white/60">
                  Search by registration number, name, department, email, or status within this committee.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-white/50">
                <span>{stats.total} students in committee</span>
                <span className="group-hover:text-sky-300 flex items-center gap-1">
                  Open
                  <svg
                    className="w-3 h-3"
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
                </span>
              </div>
            </button>
          </section>
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
