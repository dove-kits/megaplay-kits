'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isCoordinator } from '@/lib/services/coordinatorService';

export default function CoordinatorHomePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadData();
  }, [user, authLoading]);

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

      // Check if user is coordinator
      const isCoord = await isCoordinator(user?.email || '', settings.currentYear);
      if (!isCoord) {
        alert('Access denied. You are not a coordinator.');
        router.push('/login');
        return;
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load coordinator page.');
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
          <p className="text-white">Loading...</p>
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
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            Attendance Coordinator
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium">
            Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        {/* User Info - Hidden on mobile */}
        <div className="hidden md:flex items-center gap-3 text-sm bg-white/5 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-xs shadow-lg flex-shrink-0">
            {user?.email?.charAt(0)?.toUpperCase() || 'C'}
          </div>
          <span className="text-white/90 font-medium max-w-[120px] lg:max-w-[150px] truncate">
            {user?.email}
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
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-[fadeInUp_0.7s_ease-out]">
          {/* Action Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mark Attendance Card */}
            <button
              onClick={() => router.push('/attendance/coordinator/mark')}
              className="group relative bg-white/5 backdrop-blur-xl border border-white/10 hover:border-purple-400/50 rounded-2xl p-6 text-left transition-all hover:scale-105 hover:shadow-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg
                    className="w-6 h-6 text-purple-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>

                <h3 className="text-lg font-bold text-white mb-1.5 group-hover:text-purple-300 transition-colors">
                  Mark Attendance
                </h3>

                <p className="text-white/70 text-sm mb-4">
                  Mark attendance for students across OD/Scholarship and Lab sessions
                </p>

                <div className="flex items-center text-purple-300 font-medium text-sm">
                  <span>Start Marking</span>
                  <svg
                    className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </div>
              </div>
            </button>

            {/* View Attendance Card */}
            <button
              onClick={() => router.push('/attendance/coordinator/view')}
              className="group relative bg-white/5 backdrop-blur-xl border border-white/10 hover:border-blue-400/50 rounded-2xl p-6 text-left transition-all hover:scale-105 hover:shadow-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg
                    className="w-6 h-6 text-blue-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m-7 5a7 7 0 1114 0H2z"
                    />
                  </svg>
                </div>

                <h3 className="text-lg font-bold text-white mb-1.5 group-hover:text-blue-300 transition-colors">
                  My Attendance
                </h3>

                <p className="text-white/70 text-sm mb-4">
                  View your own attendance records and statistics
                </p>

                <div className="flex items-center text-blue-300 font-medium text-sm">
                  <span>View Details</span>
                  <svg
                    className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </div>
              </div>
            </button>

            {/* View Profile Card */}
            <button
              onClick={() => router.push('/attendance/coordinator/profile')}
              className="group relative bg-white/5 backdrop-blur-xl border border-white/10 hover:border-emerald-400/50 rounded-2xl p-6 text-left transition-all hover:scale-105 hover:shadow-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-green-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg
                    className="w-6 h-6 text-emerald-300"
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

                <h3 className="text-lg font-bold text-white mb-1.5 group-hover:text-emerald-300 transition-colors">
                  My Profile
                </h3>

                <p className="text-white/70 text-sm mb-4">
                  View and manage your personal profile information
                </p>

                <div className="flex items-center text-emerald-300 font-medium text-sm">
                  <span>View Profile</span>
                  <svg
                    className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </div>
              </div>
            </button>

            {/* Search Students Card */}
            <button
              onClick={() => router.push('/attendance/coordinator/search')}
              className="group relative bg-white/5 backdrop-blur-xl border border-white/10 hover:border-amber-400/50 rounded-2xl p-6 text-left transition-all hover:scale-105 hover:shadow-2xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg
                    className="w-6 h-6 text-amber-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>

                <h3 className="text-lg font-bold text-white mb-1.5 group-hover:text-amber-300 transition-colors">
                  Search Students
                </h3>

                <p className="text-white/70 text-sm mb-4">
                  Search for students and view their attendance records (read-only)
                </p>

                <div className="flex items-center text-amber-300 font-medium text-sm">
                  <span>Start Search</span>
                  <svg
                    className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </div>
              </div>
            </button>
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
