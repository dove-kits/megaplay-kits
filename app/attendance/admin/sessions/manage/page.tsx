'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isAttendanceFaculty } from '@/lib/services/attendanceFacultyService';
import {
  getAllSessions,
  Session,
  updateSessionName,
  deleteSession,
  cancelSession,
  reactivateSession,
  checkSessionAttendance,
  createSingleSession,
} from '@/lib/services/sessionService';

export default function ManageSessionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [processingSession, setProcessingSession] = useState<string | null>(null);
  
  // Add session states
  const [addingToDate, setAddingToDate] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [addingSession, setAddingSession] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, authLoading]);

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

      const isAdmin = await isAttendanceFaculty(
        user?.email || '',
        settings.currentYear
      );
      if (!isAdmin) {
        alert('Access denied. You are not part of the attendance team.');
        router.push('/login');
        return;
      }

      await loadSessions(settings.currentYear);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load sessions management page.');
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async (year: string) => {
    try {
      const allSessions = await getAllSessions(year);
      setSessions(allSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const sessionsByDate = sessions.reduce((acc, session) => {
    if (!acc[session.date]) {
      acc[session.date] = [];
    }
    acc[session.date].push(session);
    return acc;
  }, {} as Record<string, Session[]>);

  // Next session number for a date, computed from the sessions already in state
  const getNextSessionNumber = (date: string) =>
    Math.max(
      0,
      ...sessions.filter((s) => s.date === date).map((s) => s.sessionNumber || 0)
    ) + 1;

  const handleEditStart = (session: Session) => {
    setEditingSession(session.sessionId);
    setEditedName(session.name);
  };

  const handleEditCancel = () => {
    setEditingSession(null);
    setEditedName('');
  };

  const handleEditSave = async (sessionId: string) => {
    if (!currentYear || !editedName.trim()) {
      alert('Session name cannot be empty');
      return;
    }

    setProcessingSession(sessionId);
    try {
      const trimmed = editedName.trim();
      await updateSessionName(currentYear, sessionId, trimmed);
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, name: trimmed } : s))
      );
      setEditingSession(null);
      setEditedName('');
    } catch (error) {
      console.error('Failed to update session name:', error);
      alert('Failed to update session name. Please try again.');
    } finally {
      setProcessingSession(null);
    }
  };

  const handleDelete = async (session: Session) => {
    if (!currentYear) return;

    setProcessingSession(session.sessionId);
    try {
      const { hasAttendance, count } = await checkSessionAttendance(
        currentYear,
        session.sessionId
      );

      let deleteAttendance = false;
      if (hasAttendance) {
        const confirmMsg = `This session has ${count} attendance record(s). Do you want to delete them too?\n\nClick OK to delete everything, or Cancel to delete only the session.`;
        deleteAttendance = confirm(confirmMsg);
        
        if (!deleteAttendance) {
          const confirmSessionOnly = confirm(
            'Delete session only? Attendance records will remain.'
          );
          if (!confirmSessionOnly) {
            setProcessingSession(null);
            return;
          }
        }
      } else {
        const confirmDelete = confirm(
          `Delete "${session.name}"?\n\nThis action cannot be undone.`
        );
        if (!confirmDelete) {
          setProcessingSession(null);
          return;
        }
      }

      await deleteSession(currentYear, session.sessionId, deleteAttendance);
      setSessions((prev) => prev.filter((s) => s.sessionId !== session.sessionId));
      alert('Session deleted successfully!');
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete session. Please try again.');
    } finally {
      setProcessingSession(null);
    }
  };

  const handleStatusToggle = async (session: Session) => {
    if (!currentYear) return;

    setProcessingSession(session.sessionId);
    try {
      let nextStatus: Session['status'];
      if (session.status === 'cancelled') {
        await reactivateSession(currentYear, session.sessionId);
        nextStatus = 'active';
      } else {
        await cancelSession(currentYear, session.sessionId);
        nextStatus = 'cancelled';
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === session.sessionId ? { ...s, status: nextStatus } : s
        )
      );
    } catch (error) {
      console.error('Failed to update session status:', error);
      alert('Failed to update session status. Please try again.');
    } finally {
      setProcessingSession(null);
    }
  };

  const handleAddSessionStart = (date: string) => {
    setAddingToDate(date);
    setNewSessionName(`New Session ${getNextSessionNumber(date)}`);
  };

  const handleAddSessionCancel = () => {
    setAddingToDate(null);
    setNewSessionName('');
  };

  const handleAddSessionSave = async () => {
    if (!currentYear || !addingToDate || !user?.email) {
      return;
    }

    setAddingSession(true);
    try {
      const nextSessionNumber = getNextSessionNumber(addingToDate);
      const sessionName = newSessionName.trim() || `New Session ${nextSessionNumber}`;

      const created = await createSingleSession(
        currentYear,
        addingToDate,
        nextSessionNumber,
        sessionName,
        user.email
      );

      setSessions((prev) => [...prev, created]);
      setAddingToDate(null);
      setNewSessionName('');
    } catch (error) {
      console.error('Failed to add session:', error);
      alert('Failed to add session. Please try again.');
    } finally {
      setAddingSession(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'completed':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'cancelled':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading sessions...</p>
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
          onClick={() => router.push('/attendance/admin')}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
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
            alt="Logo"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[50px] sm:h-[50px]"
          />
        </div>

        {/* Title Section */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            Manage Sessions
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            Year {currentYear || 'N/A'} • {sessions.length} <span className="hidden xs:inline">Total </span>Sessions
          </p>
        </div>
      </div>

      {/* Right Section: User Email */}
      <div className="text-right hidden md:block flex-shrink-0">
        <p className="text-xs sm:text-sm font-medium text-white max-w-[150px] lg:max-w-[200px] truncate">
          {user?.email}
        </p>
      </div>
    </div>
  </div>
</header>


        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-[fadeInUp_0.7s_ease-out]">
          {sessions.length === 0 ? (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 text-center">
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-white/60 mb-4">No sessions created yet.</p>
              <button
                onClick={() => router.push('/attendance/admin/sessions/create')}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg transition-all"
              >
                Create First Session
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(sessionsByDate)
                .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                .map(([date, dateSessionsRaw]) => {
                  const dateSessions = [...dateSessionsRaw].sort(
                    (a, b) => (a.sessionNumber || 0) - (b.sessionNumber || 0)
                  );
                  const dateKey = `date-group-${date}`;
                  const isExpanded = expandedDate === date;

                  return (
                    <div
                      key={dateKey}
                      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
                    >
                      {/* Date Header */}
                      <button
                        onClick={() => setExpandedDate(isExpanded ? null : date)}
                        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 hover:bg-white/5 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-5 h-5 sm:w-6 sm:h-6 text-purple-300"
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
                          </div>
                          <div className="text-left">
                            <p className="text-base sm:text-lg font-bold text-white">
                              {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                            <p className="text-xs text-white/60">
                              {dateSessions.length} session{dateSessions.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-white/60 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {/* Sessions List */}
                      {isExpanded && (
                        <div className="border-t border-white/10 bg-black/20">
                          <div className="p-3 sm:p-4 space-y-3">
                            {dateSessions.map((session) => (
                              <div
                                key={session.sessionId}
                                className="bg-white/5 border border-white/10 rounded-xl p-4"
                              >
                                {editingSession === session.sessionId ? (
                                  // Edit Mode
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
                                      <span className="font-medium">Session {session.sessionNumber}</span>
                                      <span>•</span>
                                      <span>{session.attendanceCount || 0} attendance</span>
                                    </div>
                                    <input
                                      type="text"
                                      value={editedName}
                                      onChange={(e) => setEditedName(e.target.value)}
                                      className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                      placeholder="Session name"
                                      disabled={processingSession === session.sessionId}
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleEditSave(session.sessionId)}
                                        disabled={processingSession === session.sessionId}
                                        className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                                      >
                                        {processingSession === session.sessionId ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        onClick={handleEditCancel}
                                        disabled={processingSession === session.sessionId}
                                        className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  // View Mode
                                  <div>
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-medium text-white/60">
                                            Session {session.sessionNumber}
                                          </span>
                                          <span
                                            className={`px-2 py-0.5 text-xs font-medium rounded-md border ${getStatusColor(
                                              session.status
                                            )}`}
                                          >
                                            {session.status}
                                          </span>
                                        </div>
                                        <p className="text-sm sm:text-base font-semibold text-white mb-1">
                                          {session.name}
                                        </p>
                                        <p className="text-xs text-white/50">
                                          {session.attendanceCount || 0} attendance record{(session.attendanceCount || 0) !== 1 ? 's' : ''}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        onClick={() => handleEditStart(session)}
                                        disabled={processingSession === session.sessionId}
                                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                                      >
                                        <svg
                                          className="w-3 h-3 inline mr-1"
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
                                        Edit
                                      </button>

                                      <button
                                        onClick={() => handleStatusToggle(session)}
                                        disabled={processingSession === session.sessionId}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all disabled:opacity-50 ${
                                          session.status === 'cancelled'
                                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200'
                                            : 'bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-200'
                                        }`}
                                      >
                                        {session.status === 'cancelled' ? 'Reactivate' : 'Cancel'}
                                      </button>

                                      <button
                                        onClick={() => handleDelete(session)}
                                        disabled={processingSession === session.sessionId}
                                        className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                                      >
                                        {processingSession === session.sessionId ? (
                                          'Deleting...'
                                        ) : (
                                          <>
                                            <svg
                                              className="w-3 h-3 inline mr-1"
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
                                            Delete
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Add New Session Form */}
                            {addingToDate === date ? (
                              <div className="bg-purple-500/10 border border-purple-400/30 rounded-xl p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-xs text-purple-300 mb-2">
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
                                        d="M12 4v16m8-8H4"
                                      />
                                    </svg>
                                    <span className="font-medium">Add New Session</span>
                                  </div>
                                  <input
                                    type="text"
                                    value={newSessionName}
                                    onChange={(e) => setNewSessionName(e.target.value)}
                                    className="w-full bg-white/5 border border-purple-400/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Session name"
                                    disabled={addingSession}
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={handleAddSessionSave}
                                      disabled={addingSession || !newSessionName.trim()}
                                      className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                                    >
                                      {addingSession ? 'Adding...' : 'Add Session'}
                                    </button>
                                    <button
                                      onClick={handleAddSessionCancel}
                                      disabled={addingSession}
                                      className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSessionStart(date)}
                                className="w-full px-4 py-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-400/30 hover:border-purple-400/50 text-purple-300 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium"
                              >
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
                                    d="M12 4v16m8-8H4"
                                  />
                                </svg>
                                Add New Session
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
