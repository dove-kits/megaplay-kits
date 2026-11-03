'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService';
import { isCoordinator } from '@/lib/services/coordinatorService';
import { 
  getAllStudents, 
  Student,
} from '@/lib/services/studentService';
import { 
  getAllAttendance, 
  AttendanceRecord 
} from '@/lib/services/attendanceService';
import { getBaseCommittees, BaseCommittee } from '@/lib/services/committeeService';

export default function CoordinatorSearchPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Data
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [committees, setCommittees] = useState<BaseCommittee[]>([]);

  // Search Filters (only search query and committee)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCommittee, setSelectedCommittee] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Sort
  const [sortField, setSortField] = useState<keyof Student>('regno');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modals
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Attendance Data
  const [studentAttendance, setStudentAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendanceFilters, setAttendanceFilters] = useState({
    date: '',
    category: 'all',
  });
  const [allSessionsData, setAllSessionsData] = useState<any[]>([]);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        setError('No active year configured.');
        router.push('/login');
        return;
      }

      setCurrentYear(settings.currentYear);

      // Check if user is coordinator
      const isCoord = await isCoordinator(
        user?.email || '',
        settings.currentYear
      );
      if (!isCoord) {
        alert('Access denied. You are not a coordinator.');
        router.push('/login');
        return;
      }

      // Load students and committees
      const [students, baseCommittees] = await Promise.all([
        getAllStudents(settings.currentYear),
        getBaseCommittees(),
      ]);

      // Filter only approved students
      const approvedStudents = (students || []).filter(s => s?.status === 'approved');

      setAllStudents(approvedStudents);
      setFilteredStudents(approvedStudents);
      setCommittees(baseCommittees || []);
      setSuccess('✅ Data loaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('Failed to load search page.');
      setAllStudents([]);
      setFilteredStudents([]);
      setCommittees([]);
    } finally {
      setLoading(false);
    }
  }, [user?.email, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Helper function to get committee name
  const getCommitteeName = useCallback((key: string | undefined) => {
    if (!key) return 'Unknown';
    const committee = committees.find((c) => c.key === key);
    return committee?.name || key;
  }, [committees]);

  // Apply filters
  useEffect(() => {
    let filtered = [...allStudents];

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (student) =>
          student?.regno?.toLowerCase().includes(query) ||
          student?.name?.toLowerCase().includes(query) ||
          student?.email?.toLowerCase().includes(query) ||
          student?.phone?.toLowerCase().includes(query)
      );
    }

    // Committee filter
    if (selectedCommittee) {
      filtered = filtered.filter((s) => s?.committee === selectedCommittee);
    }

    setFilteredStudents(filtered);
    setCurrentPage(1);
  }, [searchQuery, selectedCommittee, allStudents]);

  // Sort students
  const sortedStudents = useMemo(() => {
    const sorted = [...filteredStudents].sort((a, b) => {
      const aValue = (a?.[sortField] || '').toString().toLowerCase();
      const bValue = (b?.[sortField] || '').toString().toLowerCase();

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredStudents, sortField, sortDirection]);

  // Paginate students
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedStudents.slice(startIndex, endIndex);
  }, [sortedStudents, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage);

  // Handle sort
  const handleSort = (field: keyof Student) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleViewDetails = (student: Student) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
  };

  const handleViewAttendance = async (student: Student) => {
    if (!currentYear) return;

    setSelectedStudent(student);
    setShowDetailsModal(false);
    setLoadingAttendance(true);
    setShowAttendanceModal(true);

    try {
      const firestore = await import('firebase/firestore');
      const config = await import('@/lib/firebase/config');

      const database = config.db;

      if (!database) {
        throw new Error('Firebase database not initialized');
      }

      const sessionsCol = getYearCollectionName('sessions', currentYear);
      const sessionsSnapshot = await firestore.getDocs(firestore.collection(database, sessionsCol));
      setAllSessionsData(sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const allAttendance = await getAllAttendance(currentYear);
      const studentRecords = (allAttendance || []).filter(
        (record) => record?.regno === student?.regno
      );
      setStudentAttendance(studentRecords);
    } catch (error) {
      console.error('Failed to load attendance:', error);
      setError('Failed to load attendance records.');
      setTimeout(() => setError(null), 3000);
      setStudentAttendance([]);
      setAllSessionsData([]);
    } finally {
      setLoadingAttendance(false);
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
      setError('Failed to logout. Please try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Filter attendance
  const filteredAttendance = (studentAttendance || []).filter((record) => {
    if (attendanceFilters.date && record?.date !== attendanceFilters.date) {
      return false;
    }
    if (attendanceFilters.category !== 'all' && record?.markedCategory !== attendanceFilters.category) {
      return false;
    }
    return true;
  });

  // Calculate attendance percentage
  const calculateAttendancePercentage = () => {
    if (allSessionsData.length === 0) return 0;

    const totalHours = allSessionsData.length * 3;
    const attendedHours = studentAttendance.length * 3;

    return totalHours > 0 ? ((attendedHours / totalHours) * 100).toFixed(2) : 0;
  };

  // Get unique dates from attendance
  const uniqueAttendanceDates = Array.from(
    new Set((studentAttendance || []).map(r => r?.date).filter(Boolean))
  ).sort((a, b) => (b || '').localeCompare(a || ''));

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
          <p className="text-white">Loading coordinator search page...</p>
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
              {/* Left Section */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <button
                  onClick={() => router.push('/attendance/coordinator/dashboard')}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center justify-center flex-shrink-0">
                  <Image
                    src="/klo2.svg"
                    alt="Logo"
                    width={42}
                    height={42}
                    className="drop-shadow-2xl sm:w-[50px] sm:h-[50px]"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
                    Student Search 
                  </h1>
                  <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
                    Coordinator • Year {currentYear || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs sm:text-sm font-medium text-white max-w-[150px] truncate">{user?.email}</p>
                  <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full font-medium">
                    COORDINATOR
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="px-2 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
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

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-[fadeInUp_0.7s_ease-out]">
          <div className="space-y-6">
            {/* Messages */}
            {error && (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/40 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-100">
                {success}
              </div>
            )}

            {/* Search & Filters */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search Approved Students
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Search Query */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white mb-2">
                    Search (Regno / Name / Email / Phone)
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., URK23CS7064, John"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Committee Filter */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Committee</label>
                  <select
                    value={selectedCommittee}
                    onChange={(e) => setSelectedCommittee(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">All Committees</option>
                    {committees.map((committee) => (
                      <option key={committee.key} value={committee.key}>
                        {committee?.name || committee.key}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 items-end">
                <button
                  onClick={loadData}
                  className="px-4 sm:px-6 py-2 sm:py-3 rounded-2xl bg-gradient-to-r from-teal-400 to-sky-500 text-slate-900 text-sm sm:text-base font-semibold hover:from-teal-300 hover:to-sky-400 shadow-2xl transition-all hover:-translate-y-0.5 flex items-center gap-2"
                >
                  <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="hidden sm:inline">Refresh Data</span>
                  <span className="sm:hidden">Refresh</span>
                </button>
              </div>

              {/* Clear Filters */}
              {(searchQuery || selectedCommittee) && (
                <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-purple-500/10 border border-purple-400/20 rounded-2xl p-4">
                  <p className="text-sm text-purple-200">
                    Showing {filteredStudents.length} of {allStudents.length} students
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCommittee('');
                    }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Filters
                  </button>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <SortableHeader 
                        field="regno"
                        label="Reg No"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <SortableHeader 
                        field="name"
                        label="Name"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      />
                      <th className="px-4 py-4 font-semibold text-white text-left">Committee</th>
                      <th className="px-4 py-4 font-semibold text-white text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginatedStudents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-white/60">
                          No students found matching your criteria
                        </td>
                      </tr>
                    ) : (
                      paginatedStudents.map((student) => (
                        <tr 
                          key={student?.regno || Math.random()}
                          className="hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-4 font-mono text-white font-semibold">
                            {student?.regno || 'N/A'}
                          </td>
                          <td className="px-4 py-4 text-white">
                            {student?.name || 'Unknown'}
                          </td>
                          <td className="px-4 py-4 text-white/90">
                            {getCommitteeName(student?.committee)}
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handleViewDetails(student)}
                              className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white text-xs font-semibold rounded-lg transition-all shadow-lg"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-white/5 px-4 sm:px-6 py-4 border-t border-white/10">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="text-xs sm:text-sm text-white/80">
                        Showing <span className="font-medium text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                        <span className="font-medium text-white">{Math.min(currentPage * itemsPerPage, sortedStudents.length)}</span> of{' '}
                        <span className="font-medium text-white">{sortedStudents.length}</span> results
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-2 sm:px-3 py-2 rounded-lg bg-white/5 border border-white/20 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                      >
                        &laquo;
                      </button>
                      <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-2 sm:px-3 py-2 rounded-lg bg-white/5 border border-white/20 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                      >
                        &lsaquo;
                      </button>

                      {[...Array(Math.min(5, totalPages))].map((_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }

                        if (pageNum < 1 || pageNum > totalPages) return null;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                              currentPage === pageNum
                                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
                                : 'bg-white/5 border border-white/20 text-white hover:bg-white/10'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-2 sm:px-3 py-2 rounded-lg bg-white/5 border border-white/20 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                      >
                        &rsaquo;
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-2 sm:px-3 py-2 rounded-lg bg-white/5 border border-white/20 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                      >
                        &raquo;
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 border border-white/10 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 sm:p-8 border-b border-white/10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Student Details</h2>
              <p className="text-white/70">Complete information for {selectedStudent.name}</p>
            </div>
            <div className="p-6 sm:p-8 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Registration Number</label>
                  <p className="text-white font-mono font-semibold text-lg">{selectedStudent.regno}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Name</label>
                  <p className="text-white font-semibold text-lg">{selectedStudent.name}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Email</label>
                  <p className="text-white">{selectedStudent.email || '—'}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Phone</label>
                  <p className="text-white">{selectedStudent.phone || '—'}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Department</label>
                  <p className="text-white">{selectedStudent.department || '—'}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Hostel</label>
                  <p className="text-white">{selectedStudent.hostel || '—'}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Room Number</label>
                  <p className="text-white">{selectedStudent.roomNumber || '—'}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Committee</label>
                  <p className="text-white">{getCommitteeName(selectedStudent.committee)}</p>
                </div>
                <div>
                  <label className="text-xs text-white/60 uppercase tracking-wider">Category</label>
                  <p className="text-white">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      selectedStudent.category === 'scholarship'
                        ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                    }`}>
                      {selectedStudent.category === 'scholarship' ? 'Scholarship' : 'Normal'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3 justify-end flex-wrap">
              <button
                onClick={() => handleViewAttendance(selectedStudent)}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-semibold rounded-2xl shadow-2xl transition-all hover:-translate-y-0.5"
              >
                View Attendance
              </button>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Modal */}
      {showAttendanceModal && selectedStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 border border-white/10 rounded-3xl max-w-5xl w-full my-8 shadow-2xl">
            <div className="p-6 sm:p-8 border-b border-white/10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Attendance Records</h2>
              <p className="text-white/70">{selectedStudent.name} ({selectedStudent.regno})</p>

              {/* Attendance Statistics */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wider mb-1">Total Sessions</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{allSessionsData.length}</p>
                  <p className="text-[10px] sm:text-xs text-white/50 mt-1">{allSessionsData.length * 3} hours</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-emerald-300 uppercase tracking-wider mb-1">Attended</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-200">{studentAttendance.length}</p>
                  <p className="text-[10px] sm:text-xs text-emerald-300/70 mt-1">{studentAttendance.length * 3} hours</p>
                </div>
                <div className="bg-red-500/10 border border-red-400/30 rounded-2xl p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-red-300 uppercase tracking-wider mb-1">Missed</p>
                  <p className="text-xl sm:text-2xl font-bold text-red-200">{allSessionsData.length - studentAttendance.length}</p>
                  <p className="text-[10px] sm:text-xs text-red-300/70 mt-1">{(allSessionsData.length - studentAttendance.length) * 3} hours</p>
                </div>
                <div className="bg-purple-500/10 border border-purple-400/30 rounded-2xl p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-purple-300 uppercase tracking-wider mb-1">Percentage</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-200">{calculateAttendancePercentage()}%</p>
                  <p className="text-[10px] sm:text-xs text-purple-300/70 mt-1">
                    {parseFloat(calculateAttendancePercentage() as string) >= 75 ? '✓ Good' : '⚠ Low'}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 sm:p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Filter by Date</label>
                  <select
                    value={attendanceFilters.date}
                    onChange={(e) => setAttendanceFilters({ ...attendanceFilters, date: e.target.value })}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">All Dates</option>
                    {uniqueAttendanceDates.map((date) => (
                      <option key={date} value={date}>{date}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Filter by Category</label>
                  <select
                    value={attendanceFilters.category}
                    onChange={(e) => setAttendanceFilters({ ...attendanceFilters, category: e.target.value })}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="all">All Categories</option>
                    <option value="od">OD</option>
                    <option value="scholarship">Scholarship</option>
                    <option value="lab">Lab</option>
                  </select>
                </div>
              </div>

              {loadingAttendance ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-white/60">Loading attendance records...</p>
                </div>
              ) : filteredAttendance.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No attendance records found for this student.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAttendance.map((record, index) => (
                    <div key={index} className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <p className="text-white font-semibold text-base sm:text-lg">{record.date}</p>
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                              ✓ Present
                            </span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-white/60 text-xs sm:text-sm">Session: <span className="text-white/90">{record.sessionName || 'Unknown'}</span></p>
                            <p className="text-white/60 text-xs sm:text-sm">Category: <span className="text-white/90 uppercase">{record.markedCategory || 'Unknown'}</span></p>
                            <p className="text-white/60 text-xs sm:text-sm">Session #{record.sessionNumber} • 3 hours</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-400/30">
                            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end">
              <button
                onClick={() => {
                  setShowAttendanceModal(false);
                  setSelectedStudent(null);
                  setStudentAttendance([]);
                  setAllSessionsData([]);
                  setAttendanceFilters({ date: '', category: 'all' });
                }}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl font-medium transition-all"
              >
                Close
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

// Sortable Header Component
interface SortableHeaderProps {
  field: keyof Student;
  label: string;
  sortField: keyof Student;
  sortDirection: 'asc' | 'desc';
  onSort: (field: keyof Student) => void;
}

function SortableHeader({ field, label, sortField, sortDirection, onSort }: SortableHeaderProps) {
  const isActive = sortField === field;

  return (
    <th 
      onClick={() => onSort(field)}
      className="px-4 py-4 font-semibold text-white cursor-pointer hover:bg-white/5 transition-colors text-left"
    >
      <div className="flex items-center gap-2">
        {label}
        {isActive && (
          <span className="text-purple-400 font-bold">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );
}
