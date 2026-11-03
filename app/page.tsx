"use client";

import { Sparkles, Star, ArrowRight } from "lucide-react";
import { forwardRef, ButtonHTMLAttributes, useEffect, useState } from "react";
import Link from "next/link";
import Image from 'next/image';
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { isSuperAdmin } from '@/lib/utils/roleCheck';
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService';
import { isAttendanceFaculty } from '@/lib/services/attendanceFacultyService';
import { isCoordinator } from '@/lib/services/coordinatorService';
import { getStudentByEmail } from '@/lib/services/studentService';

/* ============================================
   INLINE BUTTON COMPONENT
============================================ */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "hero" | "heroOutline";
  size?: "default" | "lg" | "xl";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "hero", size = "default", children, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      hero:
        "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 shadow-[0_0_30px_rgba(251,191,36,0.4)] hover:shadow-[0_0_50px_rgba(251,191,36,0.6)] hover:scale-105 active:scale-95",
      heroOutline:
        "border-2 border-amber-400 text-amber-400 bg-transparent hover:bg-amber-400/10 hover:scale-105 active:scale-95",
    };

    const sizes = {
      default: "h-10 px-4 py-2 text-sm",
      lg: "h-11 px-8 text-base",
      xl: "h-14 px-10 text-lg",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

/* ============================================
   SNOWFLAKE TYPE
============================================ */
type Snowflake = {
  left: string;
  width: string;
  height: string;
  opacity: number;
  animationDuration: string;
  animationDelay: string;
};

/* ============================================
   HERO SECTION
============================================ */
export default function HeroSection() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardRoute, setDashboardRoute] = useState<string>('/login');

  /* Check if user is faculty */
  const checkIsFaculty = async (email: string): Promise<boolean> => {
    if (!email) return false;

    try {
      const settings = await getAppSettings();
      if (!settings?.currentYear) return false;

      const year = settings.currentYear;
      const colName = getYearCollectionName('faculties', year);
      const facultyRef = doc(db, colName, email.toLowerCase());
      const facultyDoc = await getDoc(facultyRef);

      return facultyDoc.exists();
    } catch (error) {
      console.error('Faculty check failed:', error);
      return false;
    }
  };

  /* Determine the correct dashboard route based on user role */
  const getDashboardRoute = async (currentUser: User): Promise<string> => {
    if (!currentUser?.email) return '/login';

    const email = currentUser.email.toLowerCase();

    try {
      // 1. Check SuperAdmin
      if (isSuperAdmin(email)) {
        return '/superadmin';
      }

      // 2. Get current year for role checks
      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        return '/students';
      }

      const currentYear = settings.currentYear;

      // 3. Check Attendance Faculty
      const isAttendanceAdmin = await isAttendanceFaculty(email, currentYear);
      if (isAttendanceAdmin) {
        return '/attendance/admin';
      }

      // 4. Check Coordinator
      const isCoord = await isCoordinator(email, currentYear);
      if (isCoord) {
        const studentRecord = await getStudentByEmail(currentYear, email);
        
        if (!studentRecord) {
          return '/attendance/coordinator/onboarding';
        }

        if (studentRecord.committee && 
            (studentRecord.committee === 'attendance' || 
             studentRecord.committee.toLowerCase() === 'attendance')) {
          return '/attendance/coordinator/dashboard';
        }

        return '/attendance/mark';
      }

      // 5. Check Faculty
      const isFaculty = await checkIsFaculty(email);
      if (isFaculty) {
        return '/faculty/dashboard';
      }

      // 6. Check Student
      const studentRecord = await getStudentByEmail(currentYear, email);
      if (studentRecord) {
        if (studentRecord.status === 'approved') {
          return '/students/dashboard';
        } else {
          return '/students';
        }
      }

      // 7. Default - Registration
      return '/students';
    } catch (error) {
      console.error('Error determining dashboard route:', error);
      return '/login';
    }
  };

  /* Check authentication status and determine route */
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const route = await getDashboardRoute(currentUser);
        setDashboardRoute(route);
      } else {
        setDashboardRoute('/login');
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /* Generate random snow ONLY on client */
  useEffect(() => {
    const flakes: Snowflake[] = Array.from({ length: 50 }, () => ({
      left: `${Math.random() * 100}%`,
      width: `${2 + Math.random() * 4}px`,
      height: `${2 + Math.random() * 4}px`,
      opacity: 0.3 + Math.random() * 0.7,
      animationDuration: `${10 + Math.random() * 20}s`,
      animationDelay: `${Math.random() * 10}s`,
    }));

    setSnowflakes(flakes);
  }, []);

  return (
    <>
      {/* INLINE GLOBAL STYLES */}
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap");

        .font-display {
          font-family: "Playfair Display", serif;
        }

        .font-sans {
          font-family: "Inter", sans-serif;
        }

        .text-gradient-gold {
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #fbbf24 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes sparkle {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes snow-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0.3;
          }
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-sparkle {
          animation: sparkle 2s ease-in-out infinite;
        }

        .animate-slide-up {
          animation: slide-up 0.8s ease-out forwards;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }

        .animate-snow {
          animation: snow-fall linear infinite;
        }
      `}</style>

      {/* SNOW EFFECT (HYDRATION SAFE) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-10">
        {snowflakes.map((style, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/80 animate-snow"
            style={style}
          />
        ))}
      </div>

      {/* HERO SECTION */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden font-sans">
        {/* Background layers */}
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              "linear-gradient(180deg, hsl(222 47% 4%) 0%, hsl(222 47% 8%) 50%, hsl(222 40% 12%) 100%)",
          }}
        />
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse at center top, rgba(251, 191, 36, 0.12), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(circle at 30% 70%, rgba(239, 68, 68, 0.05), transparent 40%), radial-gradient(circle at 70% 30%, rgba(34, 197, 94, 0.05), transparent 40%)",
          }}
        />

        {/* Decorative icons */}
        <div className="absolute top-20 left-[10%] text-amber-400/40 animate-float">
          <Star className="w-6 h-6" fill="currentColor" />
        </div>

        <div
          className="absolute top-32 right-[15%] text-amber-400/25 animate-float"
          style={{ animationDelay: "1s" }}
        >
          <Star className="w-4 h-4" fill="currentColor" />
        </div>

        <div
          className="absolute top-[45%] left-[5%] text-red-500/30 animate-float"
          style={{ animationDelay: "2s" }}
        >
          <Star className="w-5 h-5" fill="currentColor" />
        </div>

        <div
          className="absolute top-[35%] right-[8%] text-green-500/25 animate-float"
          style={{ animationDelay: "1.5s" }}
        >
          <Star className="w-7 h-7" fill="currentColor" />
        </div>

        <div
          className="absolute bottom-[30%] left-[12%] text-amber-400/20 animate-float"
          style={{ animationDelay: "0.5s" }}
        >
          <Sparkles className="w-8 h-8" />
        </div>

        <div
          className="absolute bottom-[25%] right-[10%] text-red-500/20 animate-float"
          style={{ animationDelay: "2.5s" }}
        >
          <Star className="w-3 h-3" fill="currentColor" />
        </div>

        {/* Content */}
        <div className="relative z-20 text-center px-4 max-w-5xl mx-auto">
          <div
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-400/10 via-amber-400/5 to-amber-400/10 backdrop-blur-sm border border-amber-400/20 mb-10 animate-fade-in-up"
            style={{ animationDelay: "0.1s" }}
          >
            <Star className="w-4 h-4 text-amber-400 animate-sparkle" fill="currentColor" />
            <span className="text-sm text-white/90 font-medium tracking-wide">
              Christmas Special
            </span>
            <Star
              className="w-4 h-4 text-amber-400 animate-sparkle"
              style={{ animationDelay: "0.5s" }}
              fill="currentColor"
            />
          </div>

          <h1
            className="font-display text-7xl md:text-8xl lg:text-[10rem] font-bold tracking-tight mb-8 animate-slide-up leading-none"
            style={{ animationDelay: "0.2s" }}
          >
            <span className="text-gradient-gold">MEGA</span>
            <span className="text-white">PLAY</span>
          </h1>

          <p
            className="text-2xl md:text-3xl text-white/80 max-w-2xl mx-auto mb-14 animate-fade-in-up font-display"
            style={{ animationDelay: "0.4s" }}
          >
            Ready to be Part of the <span className="text-gradient-gold">Magic?</span>
          </p>

          <div className="animate-fade-in-up" style={{ animationDelay: "0.5s" }}>
            {loading ? (
              <Button variant="hero" size="xl" className="text-lg px-12" disabled>
                Loading...
              </Button>
            ) : user ? (
              <Link href={dashboardRoute}>
                <Button variant="hero" size="xl" className="text-lg px-12 group">
                  Go to Dashboard
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button variant="hero" size="xl" className="text-lg px-12 group">
                  Register Now
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            )}
          </div>

          <div
            className="flex flex-wrap justify-center gap-8 mt-14 text-sm text-slate-400 animate-fade-in-up"
            style={{ animationDelay: "0.6s" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              <span>Easy Registration</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
              <span>Choose Your Committee</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <span>Be Part of Something Amazing</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-slate-950 to-transparent z-10" />
      </section>
    </>
  );
}
