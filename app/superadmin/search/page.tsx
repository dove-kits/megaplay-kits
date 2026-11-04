'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isSuperAdmin } from '@/lib/utils/roleCheck';
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService';
import { 
  getAllStudents, 
  Student,
} from '@/lib/services/studentService';
import {
  getStudentAttendance,
  AttendanceRecord
} from '@/lib/services/attendanceService';
import { getAllSessions, Session } from '@/lib/services/sessionService';
import { getBaseCommittees, BaseCommittee } from '@/lib/services/committeeService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { doc, deleteDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export default function SuperAdminSearchPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
const sessionsCacheRef = useRef<Session[] | null>(null);   // <-- add this line
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Data
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [committees, setCommittees] = useState<BaseCommittee[]>([]);

  // Search Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedHostel, setSelectedHostel] = useState('');
  const [selectedCommittee, setSelectedCommittee] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'scholarship' | 'normal'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Sort
  const [sortField, setSortField] = useState<keyof Student>('regno');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Selection
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);

  // Modals
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Edit Form
  const [editForm, setEditForm] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

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
      sessionsCacheRef.current = null;
      setLoading(true);
      setError(null);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        setError('No active year configured.');
        router.push('/login');
        return;
      }

      setCurrentYear(settings.currentYear);

      const [students, baseCommittees] = await Promise.all([
        getAllStudents(settings.currentYear),
        getBaseCommittees(),
      ]);

      setAllStudents(students || []);
      setFilteredStudents(students || []);
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
  }, [router]);

  const uid = user?.uid;
const email = user?.email;

useEffect(() => {
  if (authLoading) return;
  if (!uid) { router.push('/login'); return; }
  if (!isSuperAdmin(email)) { router.push('/login'); return; }
  loadData();
}, [uid, email, authLoading, loadData, router]);

  const getCommitteeName = useCallback((key: string | undefined) => {
    if (!key) return 'Unknown';
    const committee = committees.find((c) => c.key === key);
    return committee?.name || key;
  }, [committees]);

  const formatStatus = (status: string | undefined) => {
    if (!status) return 'Unknown';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  useEffect(() => {
    let filtered = [...allStudents];

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

    if (selectedDepartment) {
      filtered = filtered.filter((s) => s?.department === selectedDepartment);
    }

    if (selectedHostel) {
      filtered = filtered.filter((s) => s?.hostel === selectedHostel);
    }

    if (selectedCommittee) {
      filtered = filtered.filter((s) => s?.committee === selectedCommittee);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter((s) => s?.status === selectedStatus);
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((s) => s?.category === categoryFilter);
    }

    setFilteredStudents(filtered);
    setCurrentPage(1);
    setSelectAllPages(false);
    setSelectedStudents(new Set());
  }, [searchQuery, selectedDepartment, selectedHostel, selectedCommittee, selectedStatus, categoryFilter, allStudents]);

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

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedStudents.slice(startIndex, endIndex);
  }, [sortedStudents, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage);

  const handleSort = (field: keyof Student) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAllPages = () => {
    if (selectAllPages) {
      setSelectedStudents(new Set());
      setSelectAllPages(false);
    } else {
      const allRegNos = sortedStudents.map(s => s.regno).filter(Boolean);
      setSelectedStudents(new Set(allRegNos));
      setSelectAllPages(true);
    }
  };

  const handleSelectCurrentPage = () => {
    const currentPageRegNos = paginatedStudents.map(s => s.regno).filter(Boolean);
    const allSelected = currentPageRegNos.every(regno => selectedStudents.has(regno));
    
    const newSelected = new Set(selectedStudents);
    
    if (allSelected) {
      currentPageRegNos.forEach(regno => newSelected.delete(regno));
    } else {
      currentPageRegNos.forEach(regno => newSelected.add(regno));
    }
    
    setSelectedStudents(newSelected);
    
    if (newSelected.size === sortedStudents.length) {
      setSelectAllPages(true);
    } else {
      setSelectAllPages(false);
    }
  };

  const handleSelectStudent = (regno: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(regno)) {
      newSelected.delete(regno);
    } else {
      newSelected.add(regno);
    }
    setSelectedStudents(newSelected);
    
    if (newSelected.size === sortedStudents.length) {
      setSelectAllPages(true);
    } else {
      setSelectAllPages(false);
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = ['Reg No', 'Name', 'Email', 'Phone', 'Department', 'Hostel', 'Room No', 'Committee', 'Category', 'Status'];
      const csvRows = [headers.join(',')];
      
      const dataToExport = selectedStudents.size > 0 
        ? sortedStudents.filter(s => selectedStudents.has(s.regno))
        : sortedStudents;
      
      dataToExport.forEach(student => {
        const row = [
          student?.regno || '',
          `"${student?.name || ''}"`,
          student?.email || '',
          student?.phone || '',
          student?.department || '',
          student?.hostel || '',
          student?.roomNumber || '',
          getCommitteeName(student?.committee),
          student?.category || 'normal',
          formatStatus(student?.status),
        ];
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students_${currentYear}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      setSuccess('✅ CSV exported successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('CSV export error:', err);
      setError('Failed to export CSV. Please try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = () => {
    setExporting(true);
    
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      const dataToExport = selectedStudents.size > 0 
        ? sortedStudents.filter(s => selectedStudents.has(s.regno))
        : sortedStudents;
      
      doc.setFontSize(16);
      doc.text('Student Database Report', 14, 15);
      
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
      doc.text(`Academic Year: ${currentYear}`, 14, 27);
      doc.text(`Total Students: ${dataToExport.length}`, 14, 32);
      if (selectedStudents.size > 0) {
        doc.text(`(Selected: ${selectedStudents.size} students)`, 14, 37);
      }
      
      const tableHeaders = [
        'Reg No',
        'Name',
        'Department',
        'Hostel',
        'Room',
        'Phone',
        'Committee',
        'Category',
        'Status'
      ];
      
      const tableData = dataToExport.map(student => [
        student?.regno || '-',
        student?.name || '-',
        student?.department || '-',
        student?.hostel || '-',
        student?.roomNumber || '-',
        student?.phone || '-',
        getCommitteeName(student?.committee),
        student?.category === 'scholarship' ? 'Scholarship' : 'Normal',
        formatStatus(student?.status)
      ]);
      
      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: selectedStudents.size > 0 ? 42 : 37,
        theme: 'striped',
        headStyles: {
          fillColor: [147, 51, 234],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 40 },
          2: { cellWidth: 30 },
          3: { cellWidth: 25 },
          4: { cellWidth: 15 },
          5: { cellWidth: 25 },
          6: { cellWidth: 30 },
          7: { cellWidth: 22 },
          8: { cellWidth: 20 },
        },
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages();
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          doc.setFontSize(8);
          doc.text(
            `Page ${data.pageNumber} of ${pageCount}`,
            data.settings.margin.left,
            pageHeight - 10
          );
        }
      });
      
      doc.save(`students_${currentYear}_${new Date().toISOString().split('T')[0]}.pdf`);
      setSuccess('✅ PDF exported successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('PDF export error:', err);
      setError('Failed to export PDF. Please try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setExporting(false);
    }
  };

  const handleViewDetails = (student: Student) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
  };

  const handleEditStudent = (student: Student) => {
    setEditForm({ ...student });
    setShowDetailsModal(false);
    setShowEditModal(true);
  };

  const handleDeleteStudent = (student: Student) => {
    setSelectedStudent(student);
    setShowDetailsModal(false);
    setShowDeleteModal(true);
  };

  const confirmDeleteStudent = async () => {
  if (!selectedStudent || !currentYear) return;

  setDeleting(true);
  try {
    if (!db) {
      throw new Error('Firebase database not initialized');
    }

    // Add `await` here if getYearCollectionName is async
    const studentsCol = getYearCollectionName('students', currentYear);
    const attendanceCol = getYearCollectionName('attendance', currentYear);

    if (typeof studentsCol !== 'string' || typeof attendanceCol !== 'string') {
      throw new Error('Invalid collection name');
    }
    if (!selectedStudent.regno) {
      throw new Error('Student has no regno');
    }

    // Delete student doc
    await deleteDoc(doc(db, studentsCol, selectedStudent.regno));

    // Delete attendance records
    const attendanceQuery = query(
      collection(db, attendanceCol),
      where('regno', '==', selectedStudent.regno)
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);

    await Promise.all(
      attendanceSnapshot.docs.map((d) => deleteDoc(d.ref))
    );

    setAllStudents((prev) => prev.filter((s) => s.regno !== selectedStudent.regno));

    setSuccess(
      `✅ Student ${selectedStudent.regno} and ${attendanceSnapshot.size} attendance record(s) deleted successfully`
    );
    setTimeout(() => setSuccess(null), 3000);
    setShowDeleteModal(false);
    setSelectedStudent(null);
  } catch (error) {
    console.error('Failed to delete student:', error);
    setError('Failed to delete student. Please try again.');
    setTimeout(() => setError(null), 3000);
  } finally {
    setDeleting(false);
  }
};

  const handleSaveEdit = async () => {
    if (!editForm || !currentYear) return;

    setSaving(true);
    try {
      const firestore = await import('firebase/firestore');
      const config = await import('@/lib/firebase/config');
      
      const database = config.db;
      
      if (!database) {
        throw new Error('Firebase database not initialized');
      }

      const colName = getYearCollectionName('students', currentYear);
      const studentRef = firestore.doc(database, colName, editForm.regno);

      await firestore.updateDoc(studentRef, {
        name: editForm.name || '',
        email: editForm.email || '',
        phone: editForm.phone || '',
        department: editForm.department || '',
        hostel: editForm.hostel || '',
        roomNumber: editForm.roomNumber || '',
        committee: editForm.committee || '',
        category: editForm.category || 'normal',
      });

      setAllStudents(prev =>
        prev.map(s => s.regno === editForm.regno ? editForm : s)
      );

      setSuccess('✅ Student details updated successfully');
      setTimeout(() => setSuccess(null), 3000);
      setShowEditModal(false);
      setEditForm(null);
    } catch (error) {
      console.error('Failed to update student:', error);
      setError('Failed to update student details.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleViewAttendance = async (student: Student) => {
  if (!currentYear) return;

  setSelectedStudent(student);
  setShowDetailsModal(false);
  setLoadingAttendance(true);
  setShowAttendanceModal(true);

  try {
    // Sessions: loaded once and cached (also skips the "_init" doc that
    // used to be counted as an extra session, which skewed the percentage)
    if (!sessionsCacheRef.current) {
      sessionsCacheRef.current = await getAllSessions(currentYear);
    }
    setAllSessionsData(sessionsCacheRef.current);

    // Only THIS student's records (was: every record for the whole year)
    const studentRecords = await getStudentAttendance(currentYear, student.regno);
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

  const uniqueDepartments = Array.from(
    new Set(allStudents.filter(s => s?.department).map(s => s.department))
  ).sort();
  
  const uniqueHostels = Array.from(
    new Set(allStudents.filter(s => s?.hostel).map(s => s.hostel))
  ).sort();

  const filteredAttendance = (studentAttendance || []).filter((record) => {
    if (attendanceFilters.date && record?.date !== attendanceFilters.date) {
      return false;
    }
    if (attendanceFilters.category !== 'all' && record?.markedCategory !== attendanceFilters.category) {
      return false;
    }
    return true;
  });

  const calculateAttendancePercentage = () => {
    if (allSessionsData.length === 0) return 0;
    
    const totalHours = allSessionsData.length * 3;
    const attendedHours = studentAttendance.length * 3;
    
    return totalHours > 0 ? ((attendedHours / totalHours) * 100).toFixed(2) : 0;
  };

  const uniqueAttendanceDates = Array.from(
    new Set((studentAttendance || []).map(r => r?.date).filter(Boolean))
  ).sort((a, b) => (b || '').localeCompare(a || ''));

  const currentPageAllSelected = paginatedStudents.every(s => selectedStudents.has(s.regno));

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
          <p className="text-white">Loading search page...</p>
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
      {/* Left Section: Back Button, Logo, and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Back Button */}
        <button
          onClick={() => router.push('/superadmin')}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Logo - Hidden on very small screens */}
        <div className="hidden xs:flex items-center justify-center flex-shrink-0">
          <Image
            src="/klo2.svg"
            alt="Logo"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px]"
          />
        </div>

        {/* Title Section */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            <span className="hidden sm:inline">Student Search Database</span>
            <span className="sm:hidden">Search Students</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">SuperAdmin • </span>
            Year {currentYear || 'N/A'} • {sortedStudents.length} <span className="hidden xs:inline">students</span>
            {selectedStudents.size > 0 && (
              <span className="ml-1 sm:ml-2 text-sky-400">
                • {selectedStudents.size} <span className="hidden xs:inline">selected</span>{selectAllPages ? ' (All)' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        {/* User Info Card - Hidden on mobile/tablet */}
        <div className="hidden lg:flex items-center gap-2 sm:gap-3 text-xs sm:text-sm bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center text-white font-semibold text-[10px] sm:text-xs shadow-lg flex-shrink-0">
            {user?.email?.charAt(0)?.toUpperCase() || 'S'}
          </div>
          <span className="text-white/90 font-medium max-w-[120px] xl:max-w-[200px] truncate">
            {user?.email || 'Admin'}
          </span>
          <span className="px-2 py-0.5 sm:py-1 bg-purple-500/20 text-purple-300 border border-purple-400/30 text-[10px] sm:text-xs rounded-full font-medium whitespace-nowrap">
            SUPERADMIN
          </span>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
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


        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-[fadeInUp_0.7s_ease-out]">
          <div className="space-y-6">
            {/* Messages */}
            {error && (
              <div className="rounded-2xl bg-red-500/10 border border-red-400/20 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/30 px-4 py-3 text-sm text-emerald-100">
                {success}
              </div>
            )}

            {/* Selection Info Banner */}
            {selectAllPages && (
              <div className="rounded-2xl bg-sky-500/10 border border-sky-400/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">ℹ️</div>
                  <div>
                    <p className="text-sm text-sky-100 font-medium">
                      <strong>All {sortedStudents.length} students selected</strong> across all pages. 
                      Export actions will include all selected students.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Search & Filters */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl">
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search & Filter Students
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-white mb-2">
                    Search (Regno / Name / Email / Phone)
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g., 21EUCS001, John"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Department</label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">All</option>
                    {uniqueDepartments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Hostel</label>
                  <select
                    value={selectedHostel}
                    onChange={(e) => setSelectedHostel(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">All</option>
                    {uniqueHostels.map((hostel) => (
                      <option key={hostel} value={hostel}>{hostel}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Committee</label>
                  <select
                    value={selectedCommittee}
                    onChange={(e) => setSelectedCommittee(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">All</option>
                    {committees.map((committee) => (
                      <option key={committee.key} value={committee.key}>
                        {committee?.name || committee.key}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Items Per Page</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={sortedStudents.length}>All ({sortedStudents.length})</option>
                  </select>
                </div>
              </div>

              {/* Category & Status Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Category</label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setCategoryFilter('all')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        categoryFilter === 'all'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                          : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setCategoryFilter('scholarship')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        categoryFilter === 'scholarship'
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                          : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      Scholarship
                    </button>
                    <button
                      onClick={() => setCategoryFilter('normal')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        categoryFilter === 'normal'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                          : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      Normal
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">Status</label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setSelectedStatus('all')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        selectedStatus === 'all'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                          : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedStatus('pending')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        selectedStatus === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                          : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      Pending
                    </button>
                    <button
                      onClick={() => setSelectedStatus('approved')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        selectedStatus === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      Approved
                    </button>
                    <button
                      onClick={() => setSelectedStatus('rejected')}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        selectedStatus === 'rejected'
                          ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                          : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      Rejected
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={loadData}
                  className="px-4 sm:px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-2xl transition-all flex items-center gap-2 text-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="hidden sm:inline">Refresh Data</span>
                  <span className="sm:hidden">Refresh</span>
                </button>
                
                <button
                  onClick={handleSelectAllPages}
                  className={`px-4 sm:px-6 py-3 rounded-2xl font-semibold shadow-2xl transition-all text-sm ${
                    selectAllPages 
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white' 
                      : 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white'
                  }`}
                >
                  {selectAllPages ? '✓ All Selected (Deselect)' : '☑ Select All Pages'}
                </button>
                
                <button
                  onClick={exportToCSV}
                  disabled={exporting}
                  className="px-4 sm:px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-semibold shadow-2xl transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden lg:inline">Export {selectedStudents.size > 0 ? `(${selectedStudents.size})` : 'All'} CSV</span>
                  <span className="lg:hidden">CSV</span>
                </button>
                
                <button
                  onClick={exportToPDF}
                  disabled={exporting}
                  className="px-4 sm:px-6 py-3 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold shadow-2xl transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="hidden lg:inline">{exporting ? 'Generating...' : `Export ${selectedStudents.size > 0 ? `(${selectedStudents.size})` : 'All'} PDF`}</span>
                  <span className="lg:hidden">PDF</span>
                </button>
                
                {selectedStudents.size > 0 && (
                  <button
                    onClick={() => {
                      setSelectedStudents(new Set());
                      setSelectAllPages(false);
                    }}
                    className="px-4 sm:px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold transition-all text-sm"
                  >
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Clear Filters */}
              {(searchQuery || selectedDepartment || selectedHostel || selectedCommittee || selectedStatus !== 'all' || categoryFilter !== 'all') && (
                <div className="mt-4 flex items-center justify-between bg-purple-500/10 border border-purple-400/20 rounded-2xl p-4">
                  <p className="text-sm text-purple-200">
                    Showing {filteredStudents.length} of {allStudents.length} students
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedDepartment('');
                      setSelectedHostel('');
                      setSelectedCommittee('');
                      setSelectedStatus('all');
                      setCategoryFilter('all');
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
                  <thead className="bg-black/20 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-4 text-left w-12">
                        <input
                          type="checkbox"
                          checked={currentPageAllSelected && paginatedStudents.length > 0}
                          onChange={handleSelectCurrentPage}
                          className="w-4 h-4 rounded text-purple-500 focus:ring-purple-400"
                          title="Select all on this page"
                        />
                      </th>
                      <SortableHeader field="regno" label="Reg No" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                      <SortableHeader field="name" label="Name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                      <SortableHeader field="department" label="Department" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                      <SortableHeader field="hostel" label="Hostel" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                      <th className="px-4 py-4 font-semibold text-slate-200 text-left">Committee</th>
                      <th className="px-4 py-4 font-semibold text-slate-200 text-left">Category</th>
                      <th className="px-4 py-4 font-semibold text-slate-200 text-left">Status</th>
                      <th className="px-4 py-4 font-semibold text-slate-200 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginatedStudents.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-white/60">
                          No students found matching your criteria
                        </td>
                      </tr>
                    ) : (
                      paginatedStudents.map((student) => (
                        <tr 
                          key={student?.regno || Math.random()}
                          className={`hover:bg-white/5 transition-colors ${selectedStudents.has(student.regno) ? 'bg-sky-500/10' : ''}`}
                        >
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedStudents.has(student.regno)}
                              onChange={() => handleSelectStudent(student.regno)}
                              className="w-4 h-4 rounded text-purple-500 focus:ring-purple-400"
                            />
                          </td>
                          <td className="px-4 py-4 font-mono text-slate-200 font-semibold">{student?.regno || 'N/A'}</td>
                          <td className="px-4 py-4 text-slate-200">{student?.name || 'Unknown'}</td>
                          <td className="px-4 py-4 text-slate-300">{student?.department || '—'}</td>
                          <td className="px-4 py-4 text-slate-300">{student?.hostel || '—'}</td>
                          <td className="px-4 py-4 text-slate-300">{getCommitteeName(student?.committee)}</td>
                          <td className="px-4 py-4">
                            <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                              student?.category === 'scholarship'
                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                            }`}>
                              {student?.category === 'scholarship' ? '🔵 Scholarship' : '⚪ Normal'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                              student?.status === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                                : student?.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                                : 'bg-red-500/20 text-red-300 border border-red-400/30'
                            }`}>
                              {formatStatus(student?.status)}
                            </span>
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
                <div className="bg-black/20 px-4 sm:px-6 py-4 border-t border-white/10">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-300">
                        Showing <span className="font-medium text-slate-100">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                        <span className="font-medium text-slate-100">{Math.min(currentPage * itemsPerPage, sortedStudents.length)}</span> of{' '}
                        <span className="font-medium text-slate-100">{sortedStudents.length}</span> results
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        &laquo;
                      </button>
                      <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                              currentPage === pageNum
                                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg'
                                : 'bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                      
                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        &rsaquo;
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

        {/* Details Modal */}
        {showDetailsModal && selectedStudent && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-3xl border border-white/10 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
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
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Status</label>
                    <p className="text-white">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        selectedStudent.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : selectedStudent.status === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                          : 'bg-red-500/20 text-red-300 border border-red-400/30'
                      }`}>
                        {formatStatus(selectedStudent.status)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex gap-3 justify-end flex-wrap">
                <button
                  onClick={() => handleViewAttendance(selectedStudent)}
                  className="px-4 sm:px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-semibold rounded-2xl shadow-2xl transition-all text-sm"
                >
                  View Attendance
                </button>
                <button
                  onClick={() => handleEditStudent(selectedStudent)}
                  className="px-4 sm:px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-2xl shadow-2xl transition-all text-sm"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => handleDeleteStudent(selectedStudent)}
                  className="px-4 sm:px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold rounded-2xl shadow-2xl transition-all text-sm"
                >
                  Delete Student
                </button>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-4 sm:px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal - Continue in next response due to length */}
        {showEditModal && editForm && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-3xl border border-white/10 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 sm:p-8 border-b border-white/10">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Edit Student Details</h2>
                <p className="text-white/70">Update information for {editForm.name}</p>
              </div>
              <div className="p-6 sm:p-8 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Name</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Email</label>
                    <input
                      type="email"
                      value={editForm.email || ''}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Phone</label>
                    <input
                      type="text"
                      value={editForm.phone || ''}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Department</label>
                    <select
                      value={editForm.department || ''}
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="">Select Department</option>
                      {uniqueDepartments.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Hostel</label>
                    <select
                      value={editForm.hostel || ''}
                      onChange={(e) => setEditForm({ ...editForm, hostel: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="">Select Hostel</option>
                      {uniqueHostels.map((hostel) => (
                        <option key={hostel} value={hostel}>{hostel}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Room Number</label>
                    <input
                      type="text"
                      value={editForm.roomNumber || ''}
                      onChange={(e) => setEditForm({ ...editForm, roomNumber: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Committee</label>
                    <select
                      value={editForm.committee || ''}
                      onChange={(e) => setEditForm({ ...editForm, committee: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="">Select Committee</option>
                      {committees.map((committee) => (
                        <option key={committee.key} value={committee.key}>{committee.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Category</label>
                    <select
                      value={editForm.category || 'normal'}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value as 'scholarship' | 'normal' })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="normal">Normal</option>
                      <option value="scholarship">Scholarship</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditForm(null);
                  }}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-2xl shadow-2xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedStudent && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-3xl border border-white/10 max-w-md w-full shadow-2xl">
              <div className="p-8">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white text-center mb-2">Delete Student?</h2>
                <p className="text-white/70 text-center mb-6">
                  Are you sure you want to delete <strong className="text-white">{selectedStudent.name}</strong> ({selectedStudent.regno})? 
                  This will permanently delete the student record and <strong className="text-red-300">all attendance records</strong>. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setSelectedStudent(null);
                    }}
                    disabled={deleting}
                    className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDeleteStudent}
                    disabled={deleting}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold rounded-2xl shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Deleting...
                      </>
                    ) : (
                      'Delete Forever'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Attendance Modal */}
        {showAttendanceModal && selectedStudent && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-3xl border border-white/10 max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 sm:p-8 border-b border-white/10">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Attendance Records</h2>
                <p className="text-white/70">{selectedStudent.name} ({selectedStudent.regno})</p>
                
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <p className="text-xs text-white/60 uppercase tracking-wider mb-1">Total Sessions</p>
                    <p className="text-2xl font-bold text-white">{allSessionsData.length}</p>
                    <p className="text-xs text-white/50 mt-1">{allSessionsData.length * 3} hours</p>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-4">
                    <p className="text-xs text-emerald-300 uppercase tracking-wider mb-1">Attended</p>
                    <p className="text-2xl font-bold text-emerald-200">{studentAttendance.length}</p>
                    <p className="text-xs text-emerald-300/70 mt-1">{studentAttendance.length * 3} hours</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-400/30 rounded-2xl p-4">
                    <p className="text-xs text-red-300 uppercase tracking-wider mb-1">Missed</p>
                    <p className="text-2xl font-bold text-red-200">{allSessionsData.length - studentAttendance.length}</p>
                    <p className="text-xs text-red-300/70 mt-1">{(allSessionsData.length - studentAttendance.length) * 3} hours</p>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-400/30 rounded-2xl p-4">
                    <p className="text-xs text-purple-300 uppercase tracking-wider mb-1">Percentage</p>
                    <p className="text-2xl font-bold text-purple-200">{calculateAttendancePercentage()}%</p>
                    <p className="text-xs text-purple-300/70 mt-1">
                      {parseFloat(calculateAttendancePercentage() as string) >= 75 ? '✓ Good' : '⚠ Low'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 sm:p-8 space-y-6">
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
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <p className="text-white font-semibold text-lg">{record.date}</p>
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                ✓ Present
                              </span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-white/60 text-sm">Session: <span className="text-white/90">{record.sessionName || 'Unknown'}</span></p>
                              <p className="text-white/60 text-sm">Category: <span className="text-white/90 uppercase">{record.markedCategory || 'Unknown'}</span></p>
                              <p className="text-white/60 text-sm">Session #{record.sessionNumber} • 3 hours</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-400/30">
                              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
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
      className="px-4 py-4 font-semibold text-slate-200 cursor-pointer hover:bg-white/5 transition-colors text-left"
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
