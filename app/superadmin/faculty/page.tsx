'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAuth, signOut } from 'firebase/auth';
import { getAppSettings } from '@/lib/services/settingsService';
import { 
  getBaseCommittees, 
  BaseCommittee 
} from '@/lib/services/committeeService';
import {
  getFacultiesByYear,
  upsertFaculty,
  deleteFaculty,
  Faculty,
} from '@/lib/services/facultyService';
import { isSuperAdmin } from '@/lib/utils/roleCheck';

interface CommitteeDisplay {
  key: string;
  name: string;
  description?: string;
  isCustom: boolean;
}

export default function FacultyManagementPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [activeCommittees, setActiveCommittees] = useState<string[]>([]);
  const [baseCommittees, setBaseCommittees] = useState<BaseCommittee[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [emailInput, setEmailInput] = useState('');
  const [selectedCommittees, setSelectedCommittees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Get all available committees from base committees filtered by active ones
  const getAvailableCommittees = (): CommitteeDisplay[] => {
    if (!Array.isArray(baseCommittees) || !Array.isArray(activeCommittees)) {
      return [];
    }

    return baseCommittees
      .filter(c => c && c.key && activeCommittees.includes(c.key))
      .map(c => ({
        key: c.key,
        name: c.name || c.key,
        description: c.description,
        isCustom: false
      }));
  };

  // Get committee name by key
  const getCommitteeName = (key: string | undefined | null): string => {
    if (!key) return 'Unknown';
    
    const committee = baseCommittees.find(c => c && c.key === key);
    if (committee) return committee.name || key;
    
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
  };

  // Calculate total committee assignments
  const getTotalAssignments = (): number => {
    if (!Array.isArray(faculties)) return 0;
    
    return faculties.reduce((total, fac) => {
      if (!fac) return total;
      const committees = Array.isArray(fac.committees) ? fac.committees : [];
      return total + committees.length;
    }, 0);
  };

  // Get initials from email
  const getInitials = (email: string | undefined | null): string => {
    if (!email || typeof email !== 'string') return '?';
    const firstChar = email.charAt(0);
    return firstChar ? firstChar.toUpperCase() : '?';
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const auth = getAuth();
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      setError('Failed to logout. Please try again.');
      setIsLoggingOut(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (!isSuperAdmin(user?.email)) {
      router.push('/login');
      return;
    }
    loadInitial();
  }, [user, router]);

  const loadInitial = async () => {
    try {
      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        setError('No active year found. Please create a year first in SuperAdmin dashboard.');
        setLoading(false);
        return;
      }
      setCurrentYear(settings.currentYear);
      setActiveCommittees(Array.isArray(settings.activeCommittees) ? settings.activeCommittees : []);

      const committees = await getBaseCommittees();
      setBaseCommittees(Array.isArray(committees) ? committees : []);

      const facs = await getFacultiesByYear(settings.currentYear);
      setFaculties(Array.isArray(facs) ? facs : []);
    } catch (e) {
      console.error('Error loading initial data:', e);
      setError('Failed to load faculty data.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCommittee = (key: string) => {
    if (!key) return;
    
    setSelectedCommittees((prev) =>
      (prev || []).includes(key) 
        ? prev.filter((k) => k !== key) 
        : [...(prev || []), key]
    );
    setError(null);
  };

  const handleAddFaculty = async () => {
    if (!currentYear || !user?.email) return;
    
    const trimmedEmail = emailInput?.trim();
    
    if (!trimmedEmail) {
      setError('Enter faculty email.');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    
    if (!Array.isArray(selectedCommittees) || selectedCommittees.length === 0) {
      setError('Select at least one committee for this faculty.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setSaving(true);
    
    try {
      await upsertFaculty(currentYear, trimmedEmail, selectedCommittees, user.email);
      const updated = await getFacultiesByYear(currentYear);
      setFaculties(Array.isArray(updated) ? updated : []);
      setEmailInput('');
      setSelectedCommittees([]);
      setSuccessMessage(`✅ Faculty ${trimmedEmail} added/updated successfully!`);
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      console.error('Error adding faculty:', e);
      setError('Failed to add faculty. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFaculty = async (email: string) => {
    if (!currentYear || !email) return;
    if (!confirm(`Remove ${email} from year ${currentYear}?\n\nThis will revoke their access to approve students for all assigned committees.`)) return;

    try {
      await deleteFaculty(currentYear, email);
      const updated = await getFacultiesByYear(currentYear);
      setFaculties(Array.isArray(updated) ? updated : []);
      setSuccessMessage(`✅ Faculty ${email} removed successfully!`);
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      console.error('Error deleting faculty:', e);
      setError('Failed to delete faculty. Please try again.');
    }
  };

  const handleEditFaculty = (fac: Faculty) => {
    if (!fac) return;
    
    setEmailInput(fac.email || '');
    setSelectedCommittees(Array.isArray(fac.committees) ? fac.committees : []);
    setError(null);
    setSuccessMessage(null);
    
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleClearForm = () => {
    setEmailInput('');
    setSelectedCommittees([]);
    setError(null);
    setSuccessMessage(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading faculty management...</p>
        </div>
      </div>
    );
  }

  const availableCommittees = getAvailableCommittees();
  const totalAssignments = getTotalAssignments();

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
          title="Back to Admin Dashboard"
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
            MegaPlay Admin
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">Faculty Management • </span>
            Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        {/* User Info Card - Hidden on mobile */}
        <div className="hidden lg:flex items-center gap-2 sm:gap-3 text-xs sm:text-sm bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-[10px] sm:text-xs shadow-lg flex-shrink-0">
            {user?.email?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <div className="text-right min-w-0">
            <p className="text-xs sm:text-sm text-white/90 font-medium truncate max-w-[120px] xl:max-w-[150px]">
              {user?.email}
            </p>
            <p className="text-[10px] sm:text-xs text-white/50">Admin</p>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
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
            <span>Logout</span>
          )}
        </button>
      </div>
    </div>
  </div>
</header>


        {/* Content */}
        <main className="max-w-7xl mx-auto px-6 py-10 space-y-8 animate-[fadeInUp_0.7s_ease-out]">
          {/* Success banner */}
          {successMessage && (
            <div className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 px-6 py-4 rounded-2xl text-sm flex items-center gap-3 shadow-lg shadow-emerald-500/10">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {successMessage}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="bg-red-500/20 border border-red-400/30 text-red-100 px-6 py-4 rounded-2xl text-sm flex items-center gap-3 shadow-lg shadow-red-500/10">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Info Card */}
          <section className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-400/20 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">About Faculty Management</h3>
                <p className="text-sm text-white/70 leading-relaxed">
                  Faculty members can approve student registrations for their assigned committees. 
                  A faculty can be assigned to multiple committees. Students will need approval from 
                  the faculty of their chosen committee before being accepted into events.
                </p>
              </div>
            </div>
          </section>

          {/* Add Faculty Card */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-white">
                {emailInput ? 'Edit Faculty' : 'Add Faculty'} for {currentYear}
              </h2>
              {emailInput && (
                <button
                  onClick={handleClearForm}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl text-sm font-medium transition-all"
                >
                  Clear Form
                </button>
              )}
            </div>

            {!currentYear && (
              <div className="bg-red-500/20 border border-red-400/30 rounded-2xl p-4">
                <p className="text-sm text-red-200">
                  ⚠️ No active year found. Please configure a year first in SuperAdmin dashboard.
                </p>
              </div>
            )}

            {currentYear && availableCommittees.length === 0 && (
              <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-2xl p-4">
                <p className="text-sm text-yellow-200 mb-2">
                  ⚠️ No active committees found for this year.
                </p>
                <button
                  onClick={() => router.push('/superadmin/committees')}
                  className="text-xs text-yellow-100 hover:text-yellow-50 underline"
                >
                  Go to Committee Management →
                </button>
              </div>
            )}

            {currentYear && availableCommittees.length > 0 && (
              <div className="space-y-6">
                {/* Email input */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Faculty Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={emailInput || ''}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setError(null);
                    }}
                    placeholder="faculty@karunya.edu.in"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    disabled={saving}
                  />
                  <p className="text-xs text-white/50 mt-1">
                    This faculty will be able to approve students for the selected committees
                  </p>
                </div>

                {/* Committees multi-select */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Assign Committees <span className="text-red-400">*</span>
                  </label>
                  <p className="text-xs text-white/50 mb-3">
                    Select one or more committees this faculty can manage
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {availableCommittees.map((c) => {
                      if (!c || !c.key) return null;
                      
                      const checked = (selectedCommittees || []).includes(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => handleToggleCommittee(c.key)}
                          disabled={saving}
                          className={`flex items-center justify-between px-4 py-3 rounded-2xl border text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            checked
                              ? 'bg-purple-500/20 border-purple-400/60 text-purple-100'
                              : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{c.name || c.key}</span>
                            {c.description && (
                              <span className="text-xs text-white/50 mt-0.5 line-clamp-1">{c.description}</span>
                            )}
                          </div>
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ml-2 ${
                              checked ? 'bg-purple-400' : 'bg-white/30'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  {selectedCommittees && selectedCommittees.length > 0 && (
                    <p className="text-xs text-purple-300 mt-2">
                      {selectedCommittees.length} committee{selectedCommittees.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>

                {/* Add button */}
                <div className="flex gap-3">
                  <button
                    onClick={handleAddFaculty}
                    disabled={saving || !emailInput?.trim() || !selectedCommittees?.length}
                    className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold shadow-2xl hover:from-purple-600 hover:to-pink-700 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {saving ? (
                      <>
                        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving...
                      </>
                    ) : emailInput ? (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Update Faculty
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Faculty
                      </>
                    )}
                  </button>
                  
                  {emailInput && (
                    <button
                      onClick={handleClearForm}
                      disabled={saving}
                      className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl font-medium transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Faculty list */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-white">
                  Registered Faculties
                </h2>
                <p className="text-sm text-white/60 mt-1">
                  {faculties?.length || 0} {faculties?.length === 1 ? 'faculty member' : 'faculty members'} for year {currentYear}
                </p>
              </div>
              {faculties?.length > 0 && totalAssignments > 0 && (
                <div className="px-4 py-2 bg-purple-500/20 border border-purple-400/30 text-purple-200 rounded-2xl text-sm font-medium">
                  {totalAssignments} total {totalAssignments === 1 ? 'assignment' : 'assignments'}
                </div>
              )}
            </div>

            {!faculties || faculties.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-white/60 text-sm">
                  No faculties added yet for year {currentYear}.
                </p>
                <p className="text-white/40 text-xs mt-2">
                  Add your first faculty member using the form above.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {faculties.map((fac) => {
                  if (!fac || !fac.email) return null;
                  
                  const committees = Array.isArray(fac.committees) ? fac.committees : [];
                  const initials = getInitials(fac.email);
                  
                  return (
                    <div
                      key={fac.email}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-sm shadow-lg">
                            {initials}
                          </div>
                          <p className="text-sm font-medium text-white">{fac.email}</p>
                        </div>
                        {committees.length > 0 ? (
                          <div className="flex flex-wrap gap-2 ml-13">
                            {committees.filter(Boolean).map((committeeKey) => {
                              if (!committeeKey) return null;
                              
                              return (
                                <span
                                  key={committeeKey}
                                  className="px-3 py-2 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-200 border border-purple-400/30"
                                >
                                  {getCommitteeName(committeeKey)}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-white/40 ml-13">No committees assigned</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditFaculty(fac)}
                          className="px-4 py-2 rounded-2xl text-xs font-medium bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 border border-blue-400/30 transition-all flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteFaculty(fac.email)}
                          className="px-4 py-2 rounded-2xl text-xs font-medium bg-red-500/20 text-red-100 hover:bg-red-500/30 border border-red-400/30 transition-all flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
