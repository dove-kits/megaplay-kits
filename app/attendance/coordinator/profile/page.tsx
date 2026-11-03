'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isCoordinator } from '@/lib/services/coordinatorService';

export default function CoordinatorProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadProfileData();
  }, [user, authLoading]);

  const loadProfileData = async () => {
    try {
      setLoading(true);

      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        alert('No active year configured.');
        router.push('/login');
        return;
      }

      setCurrentYear(settings.currentYear);

      if (!user?.email) {
        router.push('/login');
        return;
      }

      // Check if user is coordinator
      const isCoord = await isCoordinator(user.email, settings.currentYear);
      if (!isCoord) {
        alert('Access denied. You are not a coordinator.');
        router.push('/login');
        return;
      }

    } catch (error) {
      console.error('Failed to load profile:', error);
      alert('Failed to load profile data.');
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

  const getInitials = (email: string): string => {
    const name = email.split('@')[0];
    const parts = name.split('.');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
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
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        
        <p className="relative z-10 text-white">Redirecting...</p>
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
                    Coordinator Profile
                  </h1>
                  <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
                    Year {currentYear || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs sm:text-sm font-medium text-white truncate max-w-[150px]">
                    {user.email?.split('@')[0]}
                  </p>
                  <p className="text-[10px] sm:text-xs text-white/60">Coordinator</p>
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

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-[fadeInUp_0.7s_ease-out]">
          {/* Back Button */}
          <div className="mb-6">
            <Link
              href="/attendance/coordinator/dashboard"
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/50 rounded-xl text-white/90 hover:text-white transition-all"
            >
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span className="font-medium text-xs sm:text-sm">Back to Dashboard</span>
            </Link>
          </div>

          <div className="space-y-6">
            {/* Profile Card */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex flex-col items-center sm:items-start sm:flex-row gap-6">
                {/* Profile Picture */}
                <div className="relative flex-shrink-0">
                  <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 overflow-hidden shadow-2xl">
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-5xl sm:text-6xl font-bold text-white">
                        {getInitials(user.email || 'CO')}
                      </span>
                    </div>
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-purple-500 flex items-center justify-center shadow-xl border-4 border-[#000000]">
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
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1 w-full text-center sm:text-left">
                  <div className="mb-4">
                    <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 mb-2">
                      <h2 className="text-2xl sm:text-3xl font-bold text-white">
                        {user.email?.split('@')[0].replace(/\./g, ' ').toUpperCase()}
                      </h2>
                      <span className="px-3 py-1 bg-purple-500/20 text-purple-300 text-xs font-bold rounded-full border border-purple-400/30">
                        COORDINATOR
                      </span>
                    </div>
                    <p className="text-white/60 text-xs sm:text-sm">Attendance Coordinator • Year {currentYear}</p>
                  </div>

                  {/* Profile Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    {/* Email */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-purple-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/50 mb-1">Email Address</p>
                          <p className="text-sm font-medium text-white truncate">{user.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* Role */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-pink-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/50 mb-1">Role</p>
                          <p className="text-sm font-medium text-white">Attendance Coordinator</p>
                        </div>
                      </div>
                    </div>

                    {/* Academic Year */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-indigo-300"
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
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/50 mb-1">Academic Year</p>
                          <p className="text-sm font-medium text-white">{currentYear || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-emerald-300"
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
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/50 mb-1">Account Status</p>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                            <p className="text-sm font-medium text-emerald-300">Active</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Responsibilities Section */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg
                  className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400"
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
                Your Responsibilities
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Mark Attendance</p>
                    <p className="text-xs text-white/60 mt-1">Mark attendance for OD/Scholarship and Lab sessions</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-purple-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">View Records</p>
                    <p className="text-xs text-white/60 mt-1">Access your own attendance records and statistics</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Search Students</p>
                    <p className="text-xs text-white/60 mt-1">Search and view student attendance records (read-only)</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Manage Sessions</p>
                    <p className="text-xs text-white/60 mt-1">Coordinate attendance marking across multiple sessions</p>
                  </div>
                </div>
              </div>
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
