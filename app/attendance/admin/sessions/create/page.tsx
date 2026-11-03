'use client';


import { useEffect, useState } from 'react';
import { useAuth } from '../../../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isAttendanceFaculty } from '@/lib/services/attendanceFacultyService';
import { createSessions, getSessionsByDate } from '@/lib/services/sessionService';


interface SessionInput {
  sessionNumber: number;
  name: string;
}


interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionCount: number;
  date: string;
}


interface WarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onManage: () => void;
  existingCount: number;
  date: string;
}


const SuccessModal = ({ isOpen, onClose, sessionCount, date }: SuccessModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative bg-gradient-to-br from-slate-900/95 to-purple-900/95 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scaleIn">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400/20 to-emerald-500/20 border-2 border-green-400/50 flex items-center justify-center animate-pulse">
            <svg
              className="w-10 h-10 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent mb-3">
          Sessions Created Successfully!
        </h2>

        {/* Message */}
        <p className="text-center text-white/80 mb-6">
          Successfully created <span className="font-semibold text-purple-300">{sessionCount} session(s)</span> for{' '}
          <span className="font-semibold text-purple-300">
            {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </p>

        {/* Button */}
        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-2xl shadow-lg transform hover:-translate-y-0.5 transition-all duration-300"
        >
          Continue
        </button>
      </div>
    </div>
  );
};


const WarningModal = ({ isOpen, onClose, onManage, existingCount, date }: WarningModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative bg-gradient-to-br from-slate-900/95 to-purple-900/95 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scaleIn">
        {/* Warning Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400/20 to-pink-500/20 border-2 border-purple-400/50 flex items-center justify-center animate-pulse">
            <svg
              className="w-10 h-10 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent mb-3">
          Sessions Already Exist!
        </h2>

        {/* Message */}
        <p className="text-center text-white/80 mb-2">
          <span className="font-semibold text-purple-300">{existingCount} session(s)</span> already exist for{' '}
          <span className="font-semibold text-purple-300">
            {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </p>
        <p className="text-center text-white/60 text-sm mb-6">
          You cannot create new sessions for dates that already have sessions. Please manage existing sessions instead.
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-white/5 hover:bg-white/10 border border-white/20 text-white font-semibold py-3 px-6 rounded-2xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onManage}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-2xl shadow-lg transform hover:-translate-y-0.5 transition-all duration-300"
          >
            Manage Sessions
          </button>
        </div>
      </div>
    </div>
  );
};



export default function CreateSessionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();


  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [sessionCount, setSessionCount] = useState<number | string>(1);
  const [sessionInputs, setSessionInputs] = useState<SessionInput[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [existingSessionsCount, setExistingSessionsCount] = useState(0);


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


      // Check if user is attendance faculty
      const isAdmin = await isAttendanceFaculty(
        user?.email || '',
        settings.currentYear
      );
      if (!isAdmin) {
        alert('Access denied. You are not part of the attendance team.');
        router.push('/login');
        return;
      }


      // Set default date to today
      const today = new Date().toISOString().split('T')[0];
      setSelectedDate(today);
      
      // Check for existing sessions on default date
      await checkExistingSessions(today, settings.currentYear);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Failed to load session creation page.');
    } finally {
      setLoading(false);
    }
  };


  const checkExistingSessions = async (date: string, year: string) => {
    if (!date || !year) return;
    
    try {
      const existingSessions = await getSessionsByDate(year, date);
      if (existingSessions.length > 0) {
        setExistingSessionsCount(existingSessions.length);
        setShowWarningModal(true);
      }
    } catch (error) {
      console.error('Failed to check existing sessions:', error);
    }
  };


  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    setError('');
    setIsGenerated(false);
    setSessionInputs([]);
    
    // Check for existing sessions when date changes
    if (currentYear && newDate) {
      await checkExistingSessions(newDate, currentYear);
    }
  };


  const handleGenerateSessions = async () => {
    setError('');


    if (!selectedDate) {
      setError('Please select a date');
      return;
    }


    const count = typeof sessionCount === 'string' ? 1 : sessionCount;
    if (count < 1 || count > 10) {
      setError('Number of sessions must be between 1 and 10');
      return;
    }


    // Double-check for existing sessions before generating
    if (currentYear) {
      const existingSessions = await getSessionsByDate(currentYear, selectedDate);
      if (existingSessions.length > 0) {
        setExistingSessionsCount(existingSessions.length);
        setShowWarningModal(true);
        return;
      }
    }


    // Generate session inputs with default names
    const inputs: SessionInput[] = [];
    for (let i = 1; i <= count; i++) {
      inputs.push({
        sessionNumber: i,
        name: `Session ${i}`,
      });
    }


    setSessionInputs(inputs);
    setIsGenerated(true);
  };


  const handleSessionNameChange = (index: number, newName: string) => {
    setSessionInputs((prev) =>
      prev.map((input, i) => (i === index ? { ...input, name: newName } : input))
    );
  };


  const handleSaveSessions = async () => {
    if (!currentYear || !user?.email) return;


    // Validate all session names
    const emptyNames = sessionInputs.filter((s) => !s.name.trim());
    if (emptyNames.length > 0) {
      setError('All session names must be filled');
      return;
    }


    setSaving(true);
    setError('');


    try {
      const sessionNames = sessionInputs.map((s) => s.name.trim());
      await createSessions(currentYear, selectedDate, sessionNames, user.email);


      // Show success modal instead of alert
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to create sessions:', error);
      setError('Failed to create sessions. Please try again.');
    } finally {
      setSaving(false);
    }
  };


  const handleModalClose = () => {
    setShowSuccessModal(false);
    router.push('/attendance/admin');
  };


  const handleWarningClose = () => {
    setShowWarningModal(false);
    // Clear the date to force user to select a different date
    setSelectedDate('');
  };


  const handleManageSessions = () => {
    router.push('/attendance/admin/sessions/manage');
  };


  const handleReset = () => {
    setIsGenerated(false);
    setSessionInputs([]);
    setError('');
  };


  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading...</p>
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


      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={handleModalClose}
        sessionCount={sessionInputs.length}
        date={selectedDate}
      />


      {/* Warning Modal */}
      <WarningModal
        isOpen={showWarningModal}
        onClose={handleWarningClose}
        onManage={handleManageSessions}
        existingCount={existingSessionsCount}
        date={selectedDate}
      />


      {/* Content Layer */}
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
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
            alt="MegaPlay"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px]"
          />
        </div>

        {/* Title Section */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            Create Sessions
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium">
            Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* Right Section: User Email */}
      <div className="text-right flex-shrink-0">
        <p className="text-[10px] sm:text-sm text-white/80 max-w-[120px] sm:max-w-[200px] md:max-w-xs truncate">
          {user?.email}
        </p>
      </div>
    </div>
  </div>
</header>




        {/* Main Content */}
        <main className="max-w-3xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          {!isGenerated ? (
            // Step 1: Date and Count Input
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white mb-6">
                Session Details
              </h2>


              {error && (
                <div className="mb-6 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/40 text-red-100 text-sm">
                  {error}
                </div>
              )}


              <div className="space-y-6">
                {/* Date Picker */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Select Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-white/60 mt-2">
                    Select the date for which you want to create sessions
                  </p>
                </div>


                {/* Session Count */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Number of Sessions <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={sessionCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setSessionCount('');
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          setSessionCount(Math.min(Math.max(num, 1), 10));
                        }
                      }
                    }}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-white/60 mt-2">
                    How many sessions do you want to create for this date? (Max: 10)
                  </p>
                </div>


                {/* Generate Button */}
                <button
                  onClick={handleGenerateSessions}
                  disabled={!selectedDate}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  Generate Sessions
                </button>
              </div>
            </div>
          ) : (
            // Step 2: Edit Session Names
            <div className="space-y-6">
              {/* Info Card */}
              <div className="bg-purple-500/10 backdrop-blur-xl border border-purple-400/20 rounded-3xl p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
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
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-purple-200 mb-1">
                      Review & Edit Session Names
                    </h3>
                    <p className="text-sm text-purple-300/80">
                      Creating {typeof sessionCount === 'string' ? 1 : sessionCount} session(s) for{' '}
                      <strong>
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString(
                          'en-US',
                          {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }
                        )}
                      </strong>
                      . You can edit the session names below before saving.
                    </p>
                  </div>
                </div>
              </div>


              {error && (
                <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/40 text-red-100 text-sm">
                  {error}
                </div>
              )}


              {/* Session Name Inputs */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                <h2 className="text-2xl font-semibold text-white mb-6">
                  Edit Session Names
                </h2>


                <div className="space-y-4">
                  {sessionInputs.map((session, index) => (
                    <div key={index}>
                      <label className="block text-sm font-medium text-white mb-2">
                        Session {session.sessionNumber}{' '}
                        <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={session.name}
                        onChange={(e) =>
                          handleSessionNameChange(index, e.target.value)
                        }
                        placeholder={`e.g., Morning Practice, Afternoon Rehearsal`}
                        className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>


              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={handleReset}
                  disabled={saving}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/20 text-white font-semibold py-4 px-8 rounded-2xl transition-all disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSaveSessions}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:transform-none"
                >
                  {saving ? 'Saving Sessions...' : 'Save All Sessions'}
                </button>
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
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
