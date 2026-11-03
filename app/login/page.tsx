'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePWAInstall } from '../../context/PWAInstallContext';
import { useRouter } from 'next/navigation';
import { isSuperAdmin } from '@/lib/utils/roleCheck';
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService';
import { isAttendanceFaculty } from '@/lib/services/attendanceFacultyService';
import { isCoordinator } from '@/lib/services/coordinatorService';
import { getStudentByEmail } from '@/lib/services/studentService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import Image from 'next/image';

// ---------- MAIN LOGIN PAGE LOGIC ----------
export default function LoginPage() {
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const { user, loading, signInWithGoogle } = useAuth();
  const { showInstallPrompt, isInstallable, isPWAInstalled } = usePWAInstall();
  const router = useRouter();

  // ---------- Faculty detection ----------
  const checkIsFaculty = useCallback(async (rawEmail: string | null | undefined): Promise<boolean> => {
    if (!rawEmail) return false;

    try {
      const email = rawEmail.toLowerCase();
      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        console.warn('No currentYear in settings while checking faculty');
        return false;
      }

      const year = settings.currentYear;
      const colName = getYearCollectionName('faculties', year);
      const facultyRef = doc(db, colName, email);
      console.log('Checking faculty doc path:', colName, email);
      const facultyDoc = await getDoc(facultyRef);
      console.log('Faculty doc exists:', facultyDoc.exists());

      return facultyDoc.exists();
    } catch (error) {
      console.error('Faculty check failed:', error);
      return false;
    }
  }, []);

  const checkAndRedirect = useCallback(
    async (currentUser: any) => {
      if (!currentUser?.email) return;

      const email = currentUser.email.toLowerCase();

      try {
        // ✨ Show PWA install prompt ONLY if not installed and installable
        if (!isPWAInstalled && isInstallable) {
          setTimeout(() => {
            console.log('Showing PWA install prompt after login');
            showInstallPrompt();
          }, 1500); // 1.5 second delay for better UX
        } else if (isPWAInstalled) {
          console.log('PWA already installed, skipping prompt');
        } else {
          console.log('PWA not installable yet');
        }

        // 1. SuperAdmin → /superadmin
        if (isSuperAdmin(email)) {
          router.push('/superadmin');
          return;
        }

        // 2. Get current year for role checks
        const settings = await getAppSettings();
        if (!settings?.currentYear) {
          console.warn('No currentYear in settings');
          router.push('/students');
          return;
        }

        const currentYear = settings.currentYear;

        // 3. Check if Attendance Faculty → /attendance/admin
        const isAttendanceAdmin = await isAttendanceFaculty(email, currentYear);
        if (isAttendanceAdmin) {
          router.push('/attendance/admin');
          return;
        }

        // 4. ✨ NEW: Check if Coordinator
        const isCoord = await isCoordinator(email, currentYear);
        if (isCoord) {
          // Check if coordinator has completed student profile
          const studentRecord = await getStudentByEmail(currentYear, email);
          
          if (!studentRecord) {
            // Coordinator exists but NO student profile → Redirect to onboarding
            console.log('Coordinator found but no student profile. Redirecting to onboarding...');
            router.push('/attendance/coordinator/onboarding');
            return;
          }

          // ✨ Coordinator has student profile → Check if it's attendance coordinator
          // You can check by committee name or a flag like isAttendanceCoordinator
          if (studentRecord.committee && (studentRecord.committee === 'attendance' || studentRecord.committee.toLowerCase() === 'attendance')) {
            // Redirect to coordinator portal
            router.push('/attendance/coordinator/dashboard');
            return;
          }

          // If coordinator but committee is not "attendance", still allow coordinator access
          // (This handles edge cases where coordinator might be assigned to another committee)
          router.push('/attendance/mark');
          return;
        }

        // 5. Check if Faculty for current year → /faculty/dashboard
        const isFaculty = await checkIsFaculty(email);
        if (isFaculty) {
          router.push('/faculty/dashboard');
          return;
        }

        // 6. ✨ UPDATED: Check if student exists and is approved
        const studentRecord = await getStudentByEmail(currentYear, email);
        if (studentRecord) {
          if (studentRecord.status === 'approved') {
            // Approved student → Dashboard
            router.push('/students/dashboard');
            return;
          } else {
            // Pending/Rejected student → Registration page (shows status)
            router.push('/students');
            return;
          }
        }

        // 7. Default → Students registration
        router.push('/students');
      } catch (err) {
        console.error('Redirect check failed:', err);
        setError('Failed to verify access. Please try again.');
      }
    },
    [router, checkIsFaculty, isInstallable, isPWAInstalled, showInstallPrompt]
  );

  useEffect(() => {
    const run = async () => {
      if (!loading && user) {
        await checkAndRedirect(user);
      }
    };
    run();
  }, [user, loading, checkAndRedirect]);

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;

    setError('');
    setIsSigningIn(true);

    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message ||
          'Failed to sign in with Google. Please ensure you are using a Karunya email (@karunya.edu, @karunya.edu.in, @kate.academy, @kate.education).'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (user) return <RedirectingScreen userEmail={user.email || ''} />;

  return (
    <LoginScreen
      error={error}
      isSigningIn={isSigningIn}
      onSignIn={handleGoogleSignIn}
    />
  );
}

// ---------- SHARED BACKGROUND ----------
function BackgroundShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#02030a] relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at center, rgba(30,64,175,0.45) 0%, rgba(15,23,42,0.9) 35%, rgba(3,7,18,1) 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <AnimatedBlobs />
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 sm:px-6 py-10">
        {children}
      </div>
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
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

function AnimatedBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute -left-40 top-10 w-[520px] h-[520px] rounded-[60%] opacity-35"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(59,130,246,0.7) 0%, transparent 60%)',
          filter: 'blur(90px)',
        }}
      />
      <div
        className="absolute right-[-120px] bottom-[-40px] w-[620px] h-[620px] rounded-[60%] opacity-45"
        style={{
          background:
            'radial-gradient(circle at 70% 60%, rgba(147,51,234,0.9) 0%, transparent 65%)',
          filter: 'blur(110px)',
        }}
      />
    </div>
  );
}

// ---------- LOADING SCREEN ----------
function LoadingScreen() {
  return (
    <BackgroundShell>
      <div className="w-full max-w-[460px] animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
        <div className="rounded-[32px] bg-[radial-gradient(circle_at_top,#111827,#020617)] border border-white/10 shadow-[0_24px_120px_rgba(0,0,0,0.9)] px-12 py-14 flex flex-col items-center">
          <div className="w-28 h-28 mb-8 rounded-3xl bg-[#020617] border border-white/15 shadow-[0_20px_70px_rgba(0,0,0,0.9)] flex items-center justify-center">
            <Image
              src="/klo2.svg"
              alt="MegaPlay"
              width={88}
              height={88}
              className="w-22 h-22 object-contain drop-shadow-2xl"
              priority
            />
          </div>
          <div className="w-3/4 h-4 rounded-full bg-white/10 mb-3 animate-pulse" />
          <div className="w-1/2 h-3 rounded-full bg-white/5 animate-pulse" />
        </div>
      </div>
    </BackgroundShell>
  );
}

// ---------- UPDATED REDIRECTING SCREEN ----------
function RedirectingScreen({ userEmail }: { userEmail: string }) {
  const isSuperAdminUser = isSuperAdmin(userEmail.toLowerCase());

  return (
    <BackgroundShell>
      <div className="w-full max-w-[460px] animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
        <div className="rounded-[32px] bg-[radial-gradient(circle_at_top,#022c22,#020617)] border border-emerald-400/40 shadow-[0_24px_120px_rgba(16,185,129,0.5)] px-12 py-14 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-500/15 border border-emerald-300/40 flex items-center justify-center shadow-[0_15px_45px_rgba(16,185,129,0.6)]">
            <svg
              className="w-10 h-10 text-emerald-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.4}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-emerald-50 mb-2">
            Success
          </h2>
          <p className="text-emerald-100/80 text-sm">
            {isSuperAdminUser
              ? 'Redirecting to SuperAdmin Dashboard...'
              : 'Checking role and redirecting...'}
          </p>
        </div>
      </div>
    </BackgroundShell>
  );
}

// ---------- MAIN LOGIN CARD ----------
function LoginScreen({
  error,
  isSigningIn,
  onSignIn,
}: {
  error: string;
  isSigningIn: boolean;
  onSignIn: () => void;
}) {
  return (
    <BackgroundShell>
      <div className="w-full max-w-[460px] animate-[fadeInUp_0.7s_ease-out_forwards] opacity-0">
        <div className="rounded-[44px] bg-[radial-gradient(circle_at_top,#111827,#020617)] border border-white/10 shadow-[0_30px_160px_rgba(0,0,0,1)] px-12 py-14 flex flex-col items-center text-center">
          {/* Logo */}
          <div className="w-28 h-28 mb-8 rounded-3xl bg-[#020617] border border-white/18 shadow-[0_22px_80px_rgba(0,0,0,0.95)] flex items-center justify-center">
            <Image
              src="/klo2.svg"
              alt="MegaPlay"
              width={92}
              height={92}
              className="w-24 h-24 object-contain drop-shadow-[0_0_30px_rgba(0,0,0,0.9)]"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="text-[34px] leading-none font-semibold text-white mb-3 tracking-tight">
            MegaPlay
          </h1>
          <p className="text-[15px] text-slate-200/90 leading-relaxed mb-8 max-w-sm">
            Secure access for <strong>MegaPlay Attendance</strong>
            <br />
            and Management System
          </p>

          {/* Error */}
          {error && (
            <div className="w-full mb-6 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-400/40 text-left">
              <p className="text-xs text-red-100 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Button */}
          <button
            onClick={onSignIn}
            disabled={isSigningIn}
            className="group relative w-full h-[62px] rounded-[999px] overflow-hidden bg-gradient-to-b from-slate-500/80 to-slate-700/90 border border-white/15 shadow-[0_18px_60px_rgba(15,23,42,0.9)] flex items-center justify-center transition-all duration-250 hover:translate-y-[-1px] hover:shadow-[0_24px_80px_rgba(15,23,42,1)] active:translate-y-[1px] disabled:opacity-60 disabled:translate-y-0 cursor-pointer"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#ffffff40,transparent_55%)] opacity-70 pointer-events-none" />
            <div className="absolute left-4 w-40 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                <span className="text-lg font-bold text-slate-900">G</span>
              </div>
            </div>
            <span className="text-[15px] font-semibold text-white tracking-wide">
              {isSigningIn ? 'Signing in…' : 'Sign in with Google'}
            </span>
          </button>

          {/* Divider */}
          <div className="w-full mt-10 mb-4 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          {/* Footer */}
          <p className="text-[12px] text-slate-300/80 mb-1">
            Authorized for @karunya.edu • @karunya.edu.in • @kate.academy • @kate.education
          </p>
          <p className="text-[11px] text-slate-400/80">
            © 2025 Karunya Institute of Technology and Sciences
          </p>
        </div>
      </div>
    </BackgroundShell>
  );
}
