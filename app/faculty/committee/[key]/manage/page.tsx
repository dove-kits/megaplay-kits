// app/faculty/committee/[key]/manage/page.tsx
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
  deleteDoc,
  serverTimestamp,
  Timestamp,
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
  reviewedBy?: string | null;
  reviewedAt?: Timestamp | Date | null;
  rejectionReason?: string;
}

type ManageTab = 'pending' | 'approved' | 'rejected';

export default function CommitteeManagePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const committeeKey = params.key as string;

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ManageTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');

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

      const list: Student[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data) {
          list.push({
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
            reviewedBy: data.reviewedBy ?? null,
            reviewedAt: data.reviewedAt ?? null,
            rejectionReason: data.rejectionReason,
          });
        }
      });

      setStudents(list);
    } catch (error) {
      console.error('Failed to fetch students:', error);
      setStudents([]);
    }
  };

  const filteredStudents = students
    .filter((s) => s.status === activeTab)
    .filter((s) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.regno.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.department ?? '').toLowerCase().includes(q)
      );
    });

  const handleStatusChange = async (studentId: string, newStatus: Student['status']) => {
    if (!currentYear || !user?.email) return;

    try {
      const colName = getYearCollectionName('students', currentYear);
      const studentRef = doc(db, colName, studentId);

      await updateDoc(studentRef, {
        status: newStatus,
        reviewedBy: user.email,
        reviewedAt: serverTimestamp(),
        ...(newStatus !== 'rejected' ? { rejectionReason: '' } : {}),
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                status: newStatus,
                reviewedBy: user.email ?? null,
                reviewedAt: new Date(),
                rejectionReason: newStatus === 'rejected' ? s.rejectionReason : '',
              }
            : s
        )
      );
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update status.');
    }
  };

  const handleRejectFromPending = async (studentId: string) => {
    const reason = window.prompt('Please provide a reason for rejection (optional):') || '';
    if (!currentYear || !user?.email) return;

    try {
      const colName = getYearCollectionName('students', currentYear);
      const studentRef = doc(db, colName, studentId);

      await updateDoc(studentRef, {
        status: 'rejected',
        reviewedBy: user.email,
        reviewedAt: serverTimestamp(),
        rejectionReason: reason,
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                status: 'rejected',
                reviewedBy: user.email ?? null,
                reviewedAt: new Date(),
                rejectionReason: reason,
              }
            : s
        )
      );
    } catch (error) {
      console.error('Failed to reject student:', error);
      alert('Failed to reject student.');
    }
  };

  const handleDelete = async (studentId: string) => {
    if (!currentYear) return;
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this student record? This action cannot be undone.'
    );
    if (!confirmDelete) return;

    try {
      const colName = getYearCollectionName('students', currentYear);
      const studentRef = doc(db, colName, studentId);
      await deleteDoc(studentRef);

      setStudents((prev) => prev.filter((s) => s.id !== studentId));
    } catch (error) {
      console.error('Failed to delete student:', error);
      alert('Failed to delete student.');
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
          onClick={() => router.push(`/faculty/committee/${committeeKey}/dashboard`)}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
          title="Back to Committee Dashboard"
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
            width={36}
            height={36}
            className="drop-shadow-2xl sm:w-[48px] sm:h-[48px]"
          />
        </div>

        {/* Title Section */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            Manage Students
          </h1>
          <p className="text-[10px] sm:text-xs text-indigo-400 font-medium truncate">
            {committee.name} • Year {currentYear || 'N/A'}
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


        {/* Main */}
        <main className="max-w-7xl mx-auto px-6 py-8 animate-[fadeInUp_0.7s_ease-out]">
          {/* Tabs */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2 mb-6 flex gap-2">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'pending'
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              Pending ({students.filter((s) => s.status === 'pending').length})
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'approved'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              Approved ({students.filter((s) => s.status === 'approved').length})
            </button>
            <button
              onClick={() => setActiveTab('rejected')}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'rejected'
                  ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              Rejected ({students.filter((s) => s.status === 'rejected').length})
            </button>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-5.2-5.2M11 18a7 7 0 100-14 7 7 0 000 14z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by regno, name, email, or department..."
                className="w-full bg-white/5 border border-white/20 rounded-2xl pl-12 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                  title="Clear search"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden">
            {filteredStudents.length === 0 ? (
              <div className="p-10 text-center">
                <svg
                  className="w-16 h-16 text-white/20 mx-auto mb-4"
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
                <p className="text-white/60 text-sm">
                  {searchQuery
                    ? 'No students found matching your search.'
                    : `No ${activeTab} students in this committee yet.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-white/80 uppercase tracking-wider">
                        Reg No
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-white/80 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-white/80 uppercase tracking-wider">
                        Department
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-white/80 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-white/80 uppercase tracking-wider">
                        Email
                      </th>
                      {activeTab === 'rejected' && (
                        <th className="px-6 py-4 text-left text-xs font-medium text-white/80 uppercase tracking-wider">
                          Reason
                        </th>
                      )}
                      <th className="px-6 py-4 text-right text-xs font-medium text-white/80 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredStudents.map((student) => (
                      <tr
                        key={student.id}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                          {student.regno || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {student.name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white/80">
                          {student.department || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${
                              student.category === 'scholarship'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                            }`}
                          >
                            {student.category === 'scholarship'
                              ? 'Scholarship'
                              : 'Normal (OD)'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white/80">
                          {student.email || 'N/A'}
                        </td>
                        {activeTab === 'rejected' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70 max-w-xs truncate">
                            {student.rejectionReason || 'No reason provided'}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <div className="flex items-center gap-2 justify-end">
                            {/* Pending tab actions */}
                            {activeTab === 'pending' && (
                              <>
                                <button
                                  onClick={() =>
                                    handleStatusChange(student.id, 'approved')
                                  }
                                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg border border-emerald-400/30 transition-all"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() =>
                                    handleRejectFromPending(student.id)
                                  }
                                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium rounded-lg border border-red-400/30 transition-all"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {/* Approved tab actions */}
                            {activeTab === 'approved' && (
                              <>
                                <button
                                  onClick={() =>
                                    handleStatusChange(student.id, 'rejected')
                                  }
                                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium rounded-lg border border-red-400/30 transition-all"
                                >
                                  Mark Rejected
                                </button>
                                <button
                                  onClick={() =>
                                    handleStatusChange(student.id, 'pending')
                                  }
                                  className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-medium rounded-lg border border-yellow-400/30 transition-all"
                                >
                                  Move to Pending
                                </button>
                              </>
                            )}

                            {/* Rejected tab actions */}
                            {activeTab === 'rejected' && (
                              <>
                                <button
                                  onClick={() =>
                                    handleStatusChange(student.id, 'approved')
                                  }
                                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg border border-emerald-400/30 transition-all"
                                >
                                  Mark Approved
                                </button>
                                <button
                                  onClick={() =>
                                    handleStatusChange(student.id, 'pending')
                                  }
                                  className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs font-medium rounded-lg border border-yellow-400/30 transition-all"
                                >
                                  Move to Pending
                                </button>
                              </>
                            )}

                            {/* Delete */}
                            <button
                              onClick={() => handleDelete(student.id)}
                              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium rounded-lg border border-white/20 transition-all"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Results count */}
          {filteredStudents.length > 0 && (
            <div className="mt-4 text-center text-sm text-white/50">
              Showing {filteredStudents.length} {activeTab} student
              {filteredStudents.length !== 1 ? 's' : ''}
              {searchQuery && ` matching "${searchQuery}"`}
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
