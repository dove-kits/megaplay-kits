'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isAttendanceFaculty } from '@/lib/services/attendanceFacultyService';
import { getAllSessions, Session } from '@/lib/services/sessionService';
import {
  getAllAttendance,
  getAttendanceByDate,
  getSessionAttendance,
  AttendanceRecord,
} from '@/lib/services/attendanceService';
import { getBaseCommittees, BaseCommittee } from '@/lib/services/committeeService';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Toast notification component
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast = ({ message, type, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' 
    ? 'from-emerald-500 to-teal-600' 
    : type === 'error' 
    ? 'from-red-500 to-rose-600' 
    : 'from-blue-500 to-indigo-600';

  const icon = type === 'success' 
    ? (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
    : type === 'error'
    ? (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
    : (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-[slideInRight_0.3s_ease-out]">
      <div className={`bg-gradient-to-r ${bgColor} text-white px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/20 flex items-center gap-3 min-w-[300px] max-w-md`}>
        <div className="flex-shrink-0">
          {icon}
        </div>
        <p className="font-medium text-sm flex-1">{message}</p>
        <button
          onClick={onClose}
          className="flex-shrink-0 hover:bg-white/20 rounded-lg p-1 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Export loading modal component
interface ExportLoadingModalProps {
  message: string;
}

const ExportLoadingModal = ({ message }: ExportLoadingModalProps) => {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-gradient-to-br from-purple-900/90 to-indigo-900/90 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl max-w-sm mx-4">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-purple-300/30 border-t-purple-300 rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-pink-300 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-lg mb-1">{message}</p>
            <p className="text-purple-200 text-sm">Please wait...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function AttendanceReportsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [baseCommittees, setBaseCommittees] = useState<BaseCommittee[]>([]);

  // Data: sessions are cached (1 read per session); attendance is loaded only
  // for the selected date / session (or the full year on request).
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [fullYearLoaded, setFullYearLoaded] = useState(false);

  // Filters
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCommittee, setSelectedCommittee] = useState<string>('all');

  // UI State
  const [loadingData, setLoadingData] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingType, setExportingType] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  
  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  // Get committee name by key from base committees
  const getCommitteeName = useCallback((key: string | undefined | null): string => {
    if (!key) return 'Unknown';
    
    const committee = baseCommittees.find(c => c && c.key === key);
    if (committee) return committee.name || key;
    
    // Fallback: Format key as name
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
  }, [baseCommittees]);

  // Get category display name
  const getCategoryDisplay = useCallback((category: string | undefined | null): string => {
    if (!category) return 'N/A';
    
    switch (category.toLowerCase()) {
      case 'lab':
        return 'LAB';
      case 'od':
        return 'OD';
      case 'scholarship':
        return 'Scholarship';
      default:
        return category.toUpperCase();
    }
  }, []);

  // Get category badge color
  const getCategoryBadgeColor = useCallback((category: string | undefined | null): string => {
    if (!category) return 'bg-gray-500/20 text-gray-300 border border-gray-400/30';
    
    switch (category.toLowerCase()) {
      case 'lab':
        return 'bg-purple-500/20 text-purple-300 border border-purple-400/30';
      case 'od':
        return 'bg-blue-500/20 text-blue-300 border border-blue-400/30';
      case 'scholarship':
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border border-gray-400/30';
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

      const isFaculty = await isAttendanceFaculty(user?.email || '', settings.currentYear);
      if (!isFaculty) {
        alert('Access denied. You are not an attendance faculty.');
        router.push('/login');
        return;
      }

      // Only sessions (cached) + committees (cached). Attendance is NOT loaded
      // here: it is fetched when a date / session is chosen.
      setLoadingData(true);
      const [sessions, committees] = await Promise.all([
        getAllSessions(settings.currentYear),
        getBaseCommittees(),
      ]);

      setAllSessions(sessions);
      setBaseCommittees(Array.isArray(committees) ? committees : []);
      setLoadingData(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load reports page.');
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
  }, [user?.uid, authLoading]);

  // Fetch attendance for the current selection
  useEffect(() => {
    if (!currentYear) return;

    // Nothing selected and full year not requested: nothing to load
    if (!selectedDate && !fullYearLoaded) {
      setRecords([]);
      return;
    }

    let cancelled = false;

    (async () => {
      setFetching(true);
      try {
        const data = selectedSession
          ? await getSessionAttendance(currentYear, selectedSession)
          : selectedDate
          ? await getAttendanceByDate(currentYear, selectedDate)
          : await getAllAttendance(currentYear);

        if (!cancelled) setRecords(data);
      } catch (error) {
        console.error('Failed to load attendance:', error);
        if (!cancelled) {
          setRecords([]);
          showToast('Failed to load attendance records', 'error');
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentYear, selectedDate, selectedSession, fullYearLoaded]);

  // Category / committee filters run in the browser on what is already loaded (0 reads)
  const filteredAttendance = useMemo(
    () =>
      records.filter(
        (record) =>
          (selectedCategory === 'all' || record.markedCategory === selectedCategory) &&
          (selectedCommittee === 'all' || record.registeredCommittee === selectedCommittee)
      ),
    [records, selectedCategory, selectedCommittee]
  );

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

  // Dates come from the (cached) sessions list, not from attendance records
  const uniqueDates = Array.from(
    new Set(
      allSessions
        .filter((s) => s.date && typeof s.date === 'string')
        .map((s) => s.date)
    )
  ).sort((a, b) => b.localeCompare(a));

  // Get sessions for selected date
  const sessionsForDate = selectedDate
    ? allSessions.filter((s) => s.date === selectedDate)
    : [];

  // Export Functions
  const downloadCSV = async () => {
    if (!filteredAttendance.length) {
      showToast('No data to export', 'error');
      return;
    }

    setExporting(true);
    setExportingType('csv');

    try {
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get metadata
      const dateStr = selectedDate || 'All Dates';
      const categoryStr = selectedCategory !== 'all' ? getCategoryDisplay(selectedCategory) : 'All Categories';
      const sessionStr = selectedSession 
        ? (() => {
            const session = allSessions.find(s => s.sessionId === selectedSession);
            return session ? `${session.sessionNumber}` : 'N/A';
          })()
        : 'All Sessions';
      const totalStudents = filteredAttendance.length;

      // Build CSV with header information
      const lines = [
        'Attendance Report',
        '',
        `Date: ${dateStr}`,
        `Category: ${categoryStr}`,
        `Session: ${sessionStr}`,
        `Total Students: ${totalStudents}`,
        '',
        'Name,Registration Number,Committee,Category',
      ];

      // Add data rows
      filteredAttendance.forEach((r) => {
        const row = [
          r.studentName,
          r.regno,
          getCommitteeName(r.registeredCommittee),
          getCategoryDisplay(r.markedCategory),
        ].map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`);
        lines.push(row.join(','));
      });

      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance-report-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('CSV file exported successfully. You can find it in your file manager.', 'success');
    } catch (error) {
      console.error('CSV export failed:', error);
      showToast('Failed to export CSV file', 'error');
    } finally {
      setExporting(false);
      setExportingType(null);
    }
  };

  const downloadExcel = async () => {
    if (!filteredAttendance.length) {
      showToast('No data to export', 'error');
      return;
    }

    setExporting(true);
    setExportingType('excel');

    try {
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get metadata
      const dateStr = selectedDate || 'All Dates';
      const categoryStr = selectedCategory !== 'all' ? getCategoryDisplay(selectedCategory) : 'All Categories';
      const sessionStr = selectedSession 
        ? (() => {
            const session = allSessions.find(s => s.sessionId === selectedSession);
            return session ? `${session.sessionNumber}` : 'N/A';
          })()
        : 'All Sessions';
      const totalStudents = filteredAttendance.length;

      // Create header rows
      const headerData = [
        ['Attendance Report'],
        [],
        [`Date: ${dateStr}`],
        [`Category: ${categoryStr}`],
        [`Session: ${sessionStr}`],
        [`Total Students: ${totalStudents}`],
        [],
        ['Name', 'Registration Number', 'Committee', 'Category'],
      ];

      // Add data rows
      const dataRows = filteredAttendance.map((r) => [
        r.studentName,
        r.regno,
        getCommitteeName(r.registeredCommittee),
        getCategoryDisplay(r.markedCategory),
      ]);

      // Combine header and data
      const allData = [...headerData, ...dataRows];

      const worksheet = XLSX.utils.aoa_to_sheet(allData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

      // Set column widths
      worksheet['!cols'] = [
        { wch: 30 }, // Name
        { wch: 20 }, // Registration Number
        { wch: 30 }, // Committee
        { wch: 15 }, // Category
      ];

      // Merge cells for title
      if (!worksheet['!merges']) worksheet['!merges'] = [];
      worksheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } });

      XLSX.writeFile(workbook, `attendance-report-${Date.now()}.xlsx`);

      showToast('Excel file exported successfully. You can find it in your file manager.', 'success');
    } catch (error) {
      console.error('Excel export failed:', error);
      showToast('Failed to export Excel file', 'error');
    } finally {
      setExporting(false);
      setExportingType(null);
    }
  };

  const downloadPDF = async () => {
    if (!filteredAttendance.length) {
      showToast('No data to export', 'error');
      return;
    }

    setExporting(true);
    setExportingType('pdf');

    try {
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 500));

      const doc = new jsPDF('p', 'mm', 'a4'); // Portrait

      // Title
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('Attendance Report', 14, 20);

      // Metadata
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      
      const dateStr = selectedDate 
        ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        : 'All Dates';
      
      const categoryStr = selectedCategory !== 'all' ? getCategoryDisplay(selectedCategory) : 'All Categories';
      
      const sessionStr = selectedSession 
        ? (() => {
            const session = allSessions.find(s => s.sessionId === selectedSession);
            return session ? `${session.sessionNumber}` : 'All Sessions';
          })()
        : 'All Sessions';
      
      const totalStudents = filteredAttendance.length;

      let yPos = 35;
      doc.text(`Date: ${dateStr}`, 14, yPos);
      yPos += 8;
      doc.text(`Category: ${categoryStr}`, 14, yPos);
      yPos += 8;
      doc.text(`Session: ${sessionStr}`, 14, yPos);
      yPos += 8;
      doc.text(`Total Students: ${totalStudents}`, 14, yPos);

      // Table data
      const tableData = filteredAttendance.map((r) => [
        r.studentName,
        r.regno,
        getCommitteeName(r.registeredCommittee),
        getCategoryDisplay(r.markedCategory),
      ]);

      autoTable(doc, {
        head: [['Name', 'Registration Number', 'Committee', 'Category']],
        body: tableData,
        startY: yPos + 12,
        theme: 'grid',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          lineWidth: 0.5,
          lineColor: [0, 0, 0],
          halign: 'left',
        },
        styles: {
          fontSize: 10,
          cellPadding: 3,
          textColor: [0, 0, 0],
          lineWidth: 0.5,
          lineColor: [0, 0, 0],
          halign: 'left',
        },
        columnStyles: {
          0: { cellWidth: 50 }, // Name
          1: { cellWidth: 45 }, // Registration Number
          2: { cellWidth: 50 }, // Committee
          3: { cellWidth: 30 }, // Category
        },
        didDrawPage: (data) => {
          const pageCount = (doc as any).internal.getNumberOfPages();
          const pageNumber = (doc as any).internal.getCurrentPageInfo().pageNumber;
          doc.setFontSize(8);
          doc.text(
            `Page ${pageNumber} of ${pageCount}`,
            doc.internal.pageSize.width / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
          );
        },
      });

      doc.save(`attendance-report-${Date.now()}.pdf`);

      showToast('PDF file exported successfully. You can find it in your file manager.', 'success');
    } catch (error) {
      console.error('PDF export failed:', error);
      showToast('Failed to export PDF file', 'error');
    } finally {
      setExporting(false);
      setExportingType(null);
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
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-white">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#000000]">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}

      {/* Export Loading Modal */}
      {exporting && exportingType && (
        <ExportLoadingModal
          message={`Exporting ${exportingType.toUpperCase()} file...`}
        />
      )}

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
                  onClick={() => router.push('/attendance/admin')}
                  className="flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
                  aria-label="Back to admin"
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
                <div className="flex items-center justify-center flex-shrink-0">
                  <Image
                    src="/klo2.svg"
                    alt="Logo"
                    width={45}
                    height={45}
                    className="drop-shadow-2xl sm:w-[55px] sm:h-[55px]"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
                    Attendance Reports
                  </h1>
                  <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
                    Attendance Faculty • Year {currentYear || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs sm:text-sm text-white font-medium max-w-[150px] md:max-w-xs truncate">{user?.email}</p>
                  <p className="text-[10px] sm:text-xs text-white/60">Attendance Faculty</p>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="px-3 py-1.5 sm:px-5 sm:py-2.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-[fadeInUp_0.7s_ease-out]">
          {loadingData ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white/80 text-lg">Loading attendance data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Filters Section */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-5">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <h2 className="text-xl font-bold text-white">Filter Reports</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Date Filter */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Filter by Date
                    </label>
                    <select
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setSelectedSession('');
                      }}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="">All Dates</option>
                      {uniqueDates.map((date, index) => (
                        <option key={`date-${date}-${index}`} value={date}>
                          {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Session Filter */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Filter by Session
                    </label>
                    {selectedDate && sessionsForDate.length > 0 ? (
                      <select
                        value={selectedSession}
                        onChange={(e) => setSelectedSession(e.target.value)}
                        className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                      >
                        <option value="">All Sessions</option>
                        {sessionsForDate.map((session) => (
                          <option key={session.sessionId} value={session.sessionId}>
                            Session {session.sessionNumber}: {session.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white/50 text-sm flex items-center">
                        {selectedDate ? 'No sessions available' : 'Select a date first'}
                      </div>
                    )}
                  </div>

                  {/* Category Filter */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Filter by Category
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="all">All Categories</option>
                      <option value="lab">Lab</option>
                      <option value="od">OD</option>
                      <option value="scholarship">Scholarship</option>
                    </select>
                  </div>

                  {/* Committee Filter */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Filter by Committee
                    </label>
                    <select
                      value={selectedCommittee}
                      onChange={(e) => setSelectedCommittee(e.target.value)}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="all">All Committees</option>
                      {baseCommittees.map((committee) => (
                        <option key={committee.key} value={committee.key}>
                          {committee.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Clear Filters */}
                {(selectedDate || selectedSession || selectedCategory !== 'all' || selectedCommittee !== 'all' || fullYearLoaded) && (
                  <div className="mt-5 pt-5 border-t border-white/10">
                    <button
                      onClick={() => {
                        setSelectedDate('');
                        setSelectedSession('');
                        setSelectedCategory('all');
                        setSelectedCommittee('all');
                        setFullYearLoaded(false);
                      }}
                      className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear All Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Export Section */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-5">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h2 className="text-xl font-bold text-white">Export Data</h2>
                </div>
                
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={downloadCSV}
                    disabled={!filteredAttendance.length || exporting || fetching}
                    className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm sm:text-base font-semibold rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                  >
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="hidden sm:inline">Export CSV</span>
                    <span className="sm:hidden">CSV</span>
                  </button>

                  <button
                    onClick={downloadExcel}
                    disabled={!filteredAttendance.length || exporting || fetching}
                    className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm sm:text-base font-semibold rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                  >
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="hidden sm:inline">Export Excel</span>
                    <span className="sm:hidden">Excel</span>
                  </button>

                  <button
                    onClick={downloadPDF}
                    disabled={!filteredAttendance.length || exporting || fetching}
                    className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-sm sm:text-base font-semibold rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
                  >
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="hidden sm:inline">Export PDF</span>
                    <span className="sm:hidden">PDF</span>
                  </button>
                </div>

                <div className="mt-4 p-4 bg-purple-500/10 border border-purple-400/20 rounded-xl">
                  <p className="text-sm text-purple-200 font-medium">
                    📊 {filteredAttendance.length} record{filteredAttendance.length !== 1 ? 's' : ''} ready to export
                  </p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h2 className="text-xl font-bold text-white">
                      Data Preview
                    </h2>
                  </div>
                  <div className="px-4 py-2 bg-purple-500/20 border border-purple-400/30 rounded-xl">
                    <p className="text-sm text-purple-200 font-semibold">
                      {filteredAttendance.length} total records
                    </p>
                  </div>
                </div>

                {!selectedDate && !fullYearLoaded ? (
                  <div className="text-center py-16">
                    <svg className="w-16 h-16 mx-auto text-white/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-white/60 text-lg font-medium">Select a date to load its records</p>
                    <p className="text-white/40 text-sm mt-2 mb-6">
                      Only the records for the chosen date or session are loaded, which keeps database usage low.
                    </p>
                    <button
                      onClick={() => setFullYearLoaded(true)}
                      className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-xl transition-all"
                    >
                      Load full year (large)
                    </button>
                  </div>
                ) : fetching ? (
                  <div className="text-center py-16">
                    <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white/70">Loading attendance records...</p>
                  </div>
                ) : filteredAttendance.length === 0 ? (
                  <div className="text-center py-16">
                    <svg className="w-16 h-16 mx-auto text-white/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-white/60 text-lg font-medium">No attendance records found</p>
                    <p className="text-white/40 text-sm mt-2">Try adjusting your filters to see more results</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead className="bg-black/20 border-b border-white/10">
                        <tr>
                          <th className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                            Registration No.
                          </th>
                          <th className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                            Student Name
                          </th>
                          <th className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                            Committee
                          </th>
                          <th className="px-4 sm:px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">
                            Category
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {filteredAttendance.slice(0, 100).map((record, index) => {
                          const recordKey = record.attendanceId || `record-${record.regno}-${record.date}-${index}`;
                          
                          return (
                            <tr 
                              key={recordKey} 
                              className="hover:bg-white/5 transition-colors duration-150"
                            >
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                <span className="font-mono font-semibold text-purple-300 bg-purple-500/10 px-3 py-1 rounded-lg">
                                  {record.regno}
                                </span>
                              </td>
                              <td className="px-4 sm:px-6 py-4">
                                <span className="text-white font-medium">{record.studentName}</span>
                              </td>
                              <td className="px-4 sm:px-6 py-4">
                                <span className="text-white/80 bg-sky-500/10 px-3 py-1 rounded-lg border border-sky-400/20">
                                  {getCommitteeName(record.registeredCommittee)}
                                </span>
                              </td>
                              <td className="px-4 sm:px-6 py-4">
                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${getCategoryBadgeColor(record.markedCategory)}`}>
                                  {getCategoryDisplay(record.markedCategory)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredAttendance.length > 100 && (
                      <div className="bg-white/5 border-t border-white/10 p-4">
                        <p className="text-sm text-white/70 text-center">
                          📄 Showing first 100 of {filteredAttendance.length} records. Export to view all data.
                        </p>
                      </div>
                    )}
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

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
