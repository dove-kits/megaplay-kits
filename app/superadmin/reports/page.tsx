'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isSuperAdmin } from '@/lib/utils/roleCheck';
import { getAppSettings } from '@/lib/services/settingsService';
import { getAllSessions, Session } from '@/lib/services/sessionService';
import {
  getAllAttendance,
  AttendanceRecord,
} from '@/lib/services/attendanceService';
import { getBaseCommittees, BaseCommittee } from '@/lib/services/committeeService';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function SuperAdminReportsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [baseCommittees, setBaseCommittees] = useState<BaseCommittee[]>([]);

  // All Data
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [filteredAttendance, setFilteredAttendance] = useState<AttendanceRecord[]>([]);

  // Filters
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCommittee, setSelectedCommittee] = useState<string>('all');

  // UI State
  const [loadingData, setLoadingData] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Get committee name by key from base committees
  const getCommitteeName = useCallback((key: string | undefined | null): string => {
    if (!key) return 'Unknown';
    
    const committee = baseCommittees.find(c => c && c.key === key);
    if (committee) return committee.name || key;
    
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
  }, [baseCommittees]);

  // Get category display name
  const getCategoryDisplay = useCallback((category: string | undefined | null): string => {
    if (!category) return 'N/A';
    
    switch (category.toLowerCase()) {
      case 'lab':
        return 'Lab';
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

      setLoadingData(true);
      const [attendance, sessions, committees] = await Promise.all([
        getAllAttendance(settings.currentYear),
        getAllSessions(settings.currentYear),
        getBaseCommittees(),
      ]);

      setAllAttendance(attendance);
      setAllSessions(sessions);
      setBaseCommittees(Array.isArray(committees) ? committees : []);
      setFilteredAttendance(attendance);
      setLoadingData(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load reports page.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!isSuperAdmin(user.email)) {
      alert('Access denied. SuperAdmin access required.');
      router.push('/login');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Apply filters
  useEffect(() => {
    let filtered = [...allAttendance];

    if (selectedDate) {
      filtered = filtered.filter((record) => record.date === selectedDate);
    }

    if (selectedSession) {
      filtered = filtered.filter((record) => record.sessionId === selectedSession);
    }

    if (selectedCategory !== 'all') {
      if (selectedCategory === 'lab') {
        filtered = filtered.filter((record) => record.markedCategory === 'lab');
      } else if (selectedCategory === 'od') {
        filtered = filtered.filter((record) => record.markedCategory === 'od');
      } else if (selectedCategory === 'scholarship') {
        filtered = filtered.filter((record) => record.markedCategory === 'scholarship');
      }
    }

    if (selectedCommittee !== 'all') {
      filtered = filtered.filter((record) => record.registeredCommittee === selectedCommittee);
    }

    setFilteredAttendance(filtered);
  }, [selectedDate, selectedSession, selectedCategory, selectedCommittee, allAttendance]);

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

  const uniqueDates = Array.from(
    new Set(
      allAttendance
        .filter((a) => a.date && typeof a.date === 'string')
        .map((a) => a.date)
    )
  ).sort((a, b) => {
    if (!a || !b) return 0;
    return b.localeCompare(a);
  });

  const sessionsForDate = selectedDate
    ? allSessions.filter((s) => s.date === selectedDate)
    : [];

  const getFilterSummary = () => {
    const parts = [];
    
    if (selectedDate) {
      parts.push(`Date: ${selectedDate}`);
    }
    
    if (selectedSession) {
      const session = allSessions.find((s) => s.sessionId === selectedSession);
      if (session) {
        parts.push(`Session: Session ${session.sessionNumber}`);
      }
    }
    
    if (selectedCategory !== 'all') {
      parts.push(`Category: ${getCategoryDisplay(selectedCategory)}`);
    }
    
    if (selectedCommittee !== 'all') {
      parts.push(`Committee: ${getCommitteeName(selectedCommittee)}`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : 'All Records';
  };

  // Export Functions
  const downloadCSV = () => {
    if (!filteredAttendance.length) {
      alert('No data to export');
      return;
    }

    setExporting(true);

    const filterInfo = getFilterSummary();
    const header = ['Regno', 'Name', 'Committee'];
    const rows = filteredAttendance.map((r) =>
      [
        r.regno,
        r.studentName,
        getCommitteeName(r.registeredCommittee),
      ]
        .map((v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [
      `"${filterInfo}"`,
      '',
      header.join(','),
      ...rows
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `attendance-report-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  const downloadExcel = () => {
    if (!filteredAttendance.length) {
      alert('No data to export');
      return;
    }

    setExporting(true);

    const filterInfo = getFilterSummary();
    
    const data = filteredAttendance.map((r) => ({
      Regno: r.regno,
      Name: r.studentName,
      Committee: getCommitteeName(r.registeredCommittee),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    XLSX.utils.sheet_add_aoa(worksheet, [[filterInfo]], { origin: 'A1' });
    XLSX.utils.sheet_add_aoa(worksheet, [['Regno', 'Name', 'Committee']], { origin: 'A3' });
    XLSX.utils.sheet_add_json(worksheet, data, { origin: 'A4', skipHeader: true });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    const maxWidths = [
      { wch: 15 },
      { wch: 30 },
      { wch: 25 },
    ];
    worksheet['!cols'] = maxWidths;

    XLSX.writeFile(workbook, `attendance-report-${Date.now()}.xlsx`);

    setExporting(false);
  };

  const downloadPDF = () => {
    if (!filteredAttendance.length) {
      alert('No data to export');
      return;
    }

    setExporting(true);

    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setFontSize(18);
    doc.text('Attendance Report', 14, 15);

    doc.setFontSize(10);
    let yPos = 22;
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
    yPos += 6;
    doc.text(`Total Records: ${filteredAttendance.length}`, 14, yPos);

    if (selectedDate) {
      yPos += 6;
      doc.text(`Date: ${selectedDate}`, 14, yPos);
    }
    if (selectedSession) {
      const session = allSessions.find((s) => s.sessionId === selectedSession);
      if (session) {
        yPos += 6;
        doc.text(`Session: Session ${session.sessionNumber}`, 14, yPos);
      }
    }
    if (selectedCategory !== 'all') {
      yPos += 6;
      doc.text(`Category: ${getCategoryDisplay(selectedCategory)}`, 14, yPos);
    }
    if (selectedCommittee !== 'all') {
      yPos += 6;
      doc.text(`Committee: ${getCommitteeName(selectedCommittee)}`, 14, yPos);
    }

    const tableData = filteredAttendance.map((r) => [
      r.regno,
      r.studentName,
      getCommitteeName(r.registeredCommittee),
    ]);

    autoTable(doc, {
      head: [['Regno', 'Name', 'Committee']],
      body: tableData,
      startY: yPos + 8,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        textColor: [0, 0, 0],
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 80 },
        2: { cellWidth: 60 },
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

    setExporting(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading reports...</p>
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
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all duration-300 hover:scale-105 flex-shrink-0"
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
            <span className="hidden sm:inline">Attendance Reports</span>
            <span className="sm:hidden">Reports</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">SuperAdmin Analytics • </span>
            Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        {/* User Info Card - Hidden on mobile */}
        {user && (
          <div className="hidden lg:flex items-center gap-2 sm:gap-3 text-xs sm:text-sm bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-[10px] sm:text-xs shadow-lg flex-shrink-0">
              {user.displayName?.charAt(0)?.toUpperCase() || 'S'}
            </div>
            <div className="text-right min-w-0">
              <span className="text-white/90 font-medium block truncate max-w-[120px] xl:max-w-[150px] text-xs sm:text-sm">
                {user.displayName || user.email}
              </span>
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] sm:text-xs rounded-full font-medium border border-purple-400/30 inline-block mt-0.5 whitespace-nowrap">
                SUPERADMIN
              </span>
            </div>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 md:py-2.5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-medium text-xs sm:text-sm transition-all duration-300 flex items-center gap-1.5 sm:gap-2 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 disabled:opacity-50 whitespace-nowrap"
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
        <main className="max-w-7xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          {loadingData ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white/70 text-lg">Loading attendance data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Filters */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white">Advanced Filters</h2>
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
                      <div className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white/50 text-sm">
                        {selectedDate ? 'No sessions' : 'Select a date first'}
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
                {(selectedDate || selectedSession || selectedCategory !== 'all' || selectedCommittee !== 'all') && (
                  <div className="mt-6 flex items-center justify-between bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-sm text-white/70">
                      Active filters applied • Showing {filteredAttendance.length} of {allAttendance.length} records
                    </p>
                    <button
                      onClick={() => {
                        setSelectedDate('');
                        setSelectedSession('');
                        setSelectedCategory('all');
                        setSelectedCommittee('all');
                      }}
                      className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition-all flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear All Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Export Buttons */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Export Data</h2>
                      <p className="text-sm text-white/60 mt-1">
                        {filteredAttendance.length} records ready to export
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={downloadCSV}
                    disabled={!filteredAttendance.length || exporting}
                    className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Export CSV
                  </button>

                  <button
                    onClick={downloadExcel}
                    disabled={!filteredAttendance.length || exporting}
                    className="px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Export Excel
                  </button>

                  <button
                    onClick={downloadPDF}
                    disabled={!filteredAttendance.length || exporting}
                    className="px-8 py-4 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-semibold rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        Data Preview
                      </h2>
                      <p className="text-sm text-white/60 mt-1">
                        {filteredAttendance.length} records
                      </p>
                    </div>
                  </div>
                </div>

                {filteredAttendance.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">No Records Found</h3>
                    <p className="text-white/60">Try adjusting your filters to see more data</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-black/20 border-b border-white/10">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                            Regno
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                            Committee
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredAttendance.slice(0, 100).map((record, index) => {
                          const recordKey = record.attendanceId || `record-${record.regno}-${record.date}-${index}`;
                          
                          return (
                            <tr key={recordKey} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-200 font-semibold">
                                {record.regno}
                              </td>
                              <td className="px-4 py-3 text-slate-200">{record.studentName}</td>
                              <td className="px-4 py-3 text-slate-300">
                                {getCommitteeName(record.registeredCommittee)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredAttendance.length > 100 && (
                      <div className="mt-6 text-center bg-white/5 rounded-2xl p-4 border border-white/10">
                        <p className="text-sm text-white/70">
                          Showing first 100 of {filteredAttendance.length} records. Export to see all data.
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
      `}</style>
    </div>
  );
}
