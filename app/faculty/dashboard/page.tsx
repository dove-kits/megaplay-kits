'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { getCommitteesForYear, Committee } from '@/lib/services/committeeService';
import { getFacultiesByYear, Faculty } from '@/lib/services/facultyService';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getYearCollectionName } from '@/lib/services/settingsService';

interface CommitteeSummary {
  key: string;
  name: string;
  description?: string;
  pendingCount: number;
}

export default function FacultyDashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [facultyRecord, setFacultyRecord] = useState<Faculty | null>(null);
  const [committees, setCommittees] = useState<CommitteeSummary[]>([]);
  const [allCommittees, setAllCommittees] = useState<Committee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const loadDashboard = async () => {
    if (!user?.email) {
      setError('No user email found.');
      setInitializing(false);
      return;
    }

    try {
      // 1. Get current year from settings
      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        setError('No active year configured. Please contact the HOD.');
        setInitializing(false);
        return;
      }
      setCurrentYear(settings.currentYear);

      // 2. Fetch all committees for this year (including dynamic ones)
      const allComms = await getCommitteesForYear(settings.currentYear);
      
      if (!Array.isArray(allComms) || allComms.length === 0) {
        setError('No committees found for this year. Please contact the HOD.');
        setInitializing(false);
        return;
      }
      
      setAllCommittees(allComms);

      // 3. Load faculty record for this year with null safety
      const facs = await getFacultiesByYear(settings.currentYear);
      
      if (!Array.isArray(facs) || facs.length === 0) {
        setError('No faculty records found for this year.');
        setInitializing(false);
        return;
      }

      const userEmailLower = (user.email ?? '').toLowerCase();
      const fac = facs.find((f) => {
        if (!f || !f.email) return false;
        return f.email.toLowerCase() === userEmailLower;
      });

      if (!fac) {
        setError('You are not assigned to any committee for this year.');
        setInitializing(false);
        return;
      }
      setFacultyRecord(fac);

      // 4. Build committee summaries (only their assigned committees)
      if (!Array.isArray(fac.committees) || fac.committees.length === 0) {
        setError('You do not have any committees assigned yet for this year.');
        setInitializing(false);
        return;
      }

      const summaries: CommitteeSummary[] = [];
      
      for (const key of fac.committees) {
        if (!key) continue; // Skip null/undefined keys
        
        // Find the committee from the fetched committees
        const committeeDoc = allComms.find((c) => c?.key === key);
        
        if (!committeeDoc) {
          console.warn(`Committee ${key} not found in Firestore`);
          continue;
        }

        try {
          const pendingCount = await getPendingCountForCommittee(settings.currentYear, key);
          summaries.push({
            key: committeeDoc.key,
            name: committeeDoc.name || key,
            description: committeeDoc.description,
            pendingCount,
          });
        } catch (err) {
          console.error(`Failed to load count for committee ${key}:`, err);
          // Continue with other committees even if one fails
          summaries.push({
            key: committeeDoc.key,
            name: committeeDoc.name || key,
            description: committeeDoc.description,
            pendingCount: 0,
          });
        }
      }
      
      setCommittees(summaries);
    } catch (e) {
      console.error('Dashboard load error:', e);
      setError('Failed to load faculty dashboard.');
    } finally {
      setInitializing(false);
    }
  };

  const getPendingCountForCommittee = async (year: string, committeeKey: string) => {
    try {
      if (!year || !committeeKey) return 0;
      
      const colName = getYearCollectionName('students', year);
      const q = query(
        collection(db, colName),
        where('committee', '==', committeeKey),
        where('status', '==', 'pending')
      );
      const snap = await getCountFromServer(q);
      return snap.data().count || 0;
    } catch (error) {
      console.error('Error getting pending count:', error);
      return 0;
    }
  };

  const handleOpenCommittee = (key: string) => {
    if (!key) return;
    router.push(`/faculty/committee/${key}/dashboard`);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
      alert('Failed to logout. Please try again.');
      setIsLoggingOut(false);
    }
  };

  if (loading || initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]"></div>
        <div className="absolute top-20 -left-40 w-80 h-80 bg-blue-500/15 rounded-full blur-[110px] animate-pulse"></div>
        <div className="absolute bottom-20 -right-40 w-80 h-80 bg-purple-500/15 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#000000] text-white">
        <p>Redirecting to login...</p>
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
      <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-500/8 rounded-full blur-[90px]"></div>

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Header */}
       <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Left Section: Logo and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
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
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
            Faculty Portal
          </h1>
          <p className="text-[10px] sm:text-xs text-emerald-400 font-medium">
            Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* User Info */}
        <div className="text-right hidden md:block">
          <p className="text-xs sm:text-sm text-white/80 max-w-[150px] lg:max-w-xs truncate">
            {user.email || 'Unknown User'}
          </p>
          {facultyRecord && Array.isArray(facultyRecord.committees) && facultyRecord.committees.length > 0 && (
            <p className="text-[10px] sm:text-xs text-white/60 mt-1 max-w-[150px] lg:max-w-xs truncate">
              Committees:{' '}
              {facultyRecord.committees
                .filter((k) => k) // Remove null/undefined
                .map((k) => {
                  const comm = allCommittees.find((c) => c?.key === k);
                  return comm?.name || k;
                })
                .join(', ')}
            </p>
          )}
        </div>
        
        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="group relative px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-xl sm:rounded-2xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-100 hover:text-red-50 font-medium text-xs sm:text-sm transition-all duration-300 flex items-center gap-1.5 sm:gap-2 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isLoggingOut ? (
            <>
              <svg className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="hidden sm:inline">Logging out...</span>
              <span className="sm:hidden">...</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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


        {/* Main content */}
        <main className="max-w-7xl mx-auto px-6 py-10 space-y-8 animate-[fadeInUp_0.7s_ease-out]">
          {error && (
            <div className="bg-red-500/10 border border-red-400/40 text-red-100 px-6 py-4 rounded-2xl text-sm flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold mb-1">Error Loading Dashboard</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!error && (
            <>
              <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl">
  <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-white mb-2">
    Welcome, <span className="truncate inline-block max-w-[200px] sm:max-w-none align-bottom">{user.email || 'Faculty'}</span>
  </h2>
  <p className="text-white/70 text-xs sm:text-sm mb-4 leading-relaxed">
    Your assigned committees for {currentYear || 'the current year'} are listed below. You can
    open each committee to review and approve student registrations.
  </p>
  {facultyRecord && (
    <div className="mt-3 sm:mt-4 flex items-center gap-2 text-[10px] sm:text-xs text-emerald-400">
      <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      <span>Active Faculty Member</span>
    </div>
  )}
</section>


              <section>
                <h3 className="text-xl font-semibold text-white mb-4 px-2">
                  Your Committees ({committees.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {committees.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => handleOpenCommittee(c.key)}
                      className="bg-white/5 border border-white/10 rounded-3xl p-6 text-left text-white hover:bg-white/10 hover:-translate-y-1 transition-all shadow-xl hover:shadow-2xl hover:border-indigo-400/30"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                          </svg>
                        </div>
                        {c.pendingCount > 0 && (
                          <span className="px-2 py-1 text-xs font-bold bg-yellow-500/20 text-yellow-300 rounded-lg border border-yellow-400/30">
                            {c.pendingCount} pending
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold mb-1">{c.name || 'Unknown'}</h3>
                      {c.description && (
                        <p className="text-xs text-white/50 mb-2">{c.description}</p>
                      )}
                      <p className="text-xs text-white/40 mb-3 font-mono">
                        {c.key || 'N/A'}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-emerald-300 font-medium">
                          {c.pendingCount === 0 ? '✓ All reviewed' : `${c.pendingCount} to review`}
                        </p>
                        <svg className="w-5 h-5 text-white/40 group-hover:text-white/80 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}

                  {committees.length === 0 && (
                    <div className="col-span-full bg-white/5 border border-white/10 rounded-3xl p-10 text-center">
                      <svg className="w-16 h-16 text-white/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-white/60 text-sm">
                        You do not have any committees assigned yet for this year.
                      </p>
                      <p className="text-white/40 text-xs mt-2">
                        Please contact your HOD for committee assignments.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </>
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
