'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { getCommitteesForYear, Committee } from '@/lib/services/committeeService';
import { registerStudent, getStudentByEmail, Student } from '@/lib/services/studentService';

export default function StudentRegistrationPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [activeCommittees, setActiveCommittees] = useState<Committee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [hostels, setHostels] = useState<string[]>([]);

  const [existingStudent, setExistingStudent] = useState<Student | null>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const [registrationClosed, setRegistrationClosed] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    regno: '',
    phone: '',
    department: '',
    hostel: '',
    roomNumber: '',
    committee: '',
    category: 'normal' as 'normal' | 'scholarship',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadInitialData();
  }, [user, loading]);

  const loadInitialData = async () => {
    try {
      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        alert('No active year configured. Please contact the administrator.');
        setIsCheckingExisting(false);
        return;
      }

      // Check if registration is open
      if (!settings.registrationOpen) {
        setIsCheckingExisting(false);
        setRegistrationClosed(true);
        return;
      }

      setCurrentYear(settings.currentYear);
      setDepartments(settings.departments || []);
      setHostels(settings.hostels || []);

      // Fetch all committees dynamically from Firestore
      const allCommittees = await getCommitteesForYear(settings.currentYear);
      
      // Filter to only active committees
      const activeComms = allCommittees.filter((c) => 
        c?.isActive && settings.activeCommittees?.includes(c.key)
      );
      
      setActiveCommittees(activeComms);

      // Check if student already registered
      if (user?.email) {
        const existing = await getStudentByEmail(settings.currentYear, user.email);
        if (existing) {
          setExistingStudent(existing);
          
          // Redirect approved students to dashboard
          if (existing.status === 'approved') {
            router.push('/students/dashboard');
            return;
          }
        }
      }

      setIsCheckingExisting(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      alert('Failed to load registration settings.');
      setIsCheckingExisting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleCategoryChange = (category: 'normal' | 'scholarship') => {
    setFormData((prev) => ({ ...prev, category }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.regno.trim()) newErrors.regno = 'Registration number is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    else if (!/^\d{10}$/.test(formData.phone))
      newErrors.phone = 'Phone must be 10 digits';
    if (!formData.department) newErrors.department = 'Department is required';
    if (!formData.hostel) newErrors.hostel = 'Hostel is required';
    if (!formData.roomNumber.trim())
      newErrors.roomNumber = 'Room number is required';
    if (!formData.committee) newErrors.committee = 'Committee is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !currentYear || !user?.email) return;

    setSubmitting(true);

    try {
      await registerStudent(currentYear, {
        name: formData.name.trim(),
        regno: formData.regno.trim().toUpperCase(),
        email: user.email.toLowerCase(),
        phone: formData.phone.trim(),
        department: formData.department,
        hostel: formData.hostel,
        roomNumber: formData.roomNumber.trim(),
        committee: formData.committee,
        category: formData.category,
      });

      // Reload to show status screen
      const registered = await getStudentByEmail(currentYear, user.email);
      setExistingStudent(registered);
      
      // If somehow approved immediately, redirect to dashboard
      if (registered?.status === 'approved') {
        router.push('/students/dashboard');
      }
    } catch (error) {
      console.error('Registration failed:', error);
      alert('Failed to submit registration. Please try again.');
    } finally {
      setSubmitting(false);
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

  const getCommitteeName = (key: string | undefined): string => {
    if (!key) return 'N/A';
    const committee = activeCommittees.find((c) => c?.key === key);
    return committee?.name || key;
  };

  if (loading || isCheckingExisting) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]"></div>
        <div className="absolute top-20 -left-40 w-80 h-80 bg-blue-500/15 rounded-full blur-[110px] animate-pulse"></div>
        <div className="absolute bottom-20 -right-40 w-80 h-80 bg-purple-500/15 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading registration status...</p>
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

  // Registration closed screen
  if (registrationClosed) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#000000]">
        {/* Background System */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.08),transparent_50%)]"></div>
        
        {/* Animated Blobs */}
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-red-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-rose-500/12 rounded-full blur-[110px]"></div>

        {/* Content Layer */}
        <div className="relative z-10">
          <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Logo and Title Section */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0">
          <Image
            src="/klo2.svg"
            alt="MegaPlay"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px] w-10 h-10"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            MegaPlay Registration
          </h1>
          <p className="text-[10px] sm:text-xs text-indigo-400 font-medium truncate">
            Student Portal • Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* User Actions Section */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* Email - Hidden on mobile and small tablets */}
        <div className="hidden lg:block text-right">
          <p className="text-sm text-white/80 max-w-xs truncate">{user.email}</p>
        </div>
        
        {/* Logout Button - Compact on mobile */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {isLoggingOut ? (
            <span className="hidden sm:inline">Logging out...</span>
          ) : (
            <span className="hidden sm:inline">Logout</span>
          )}
          {/* Mobile icon/short text */}
          <span className="sm:hidden">{isLoggingOut ? '...' : 'Logout'}</span>
        </button>
      </div>
    </div>
  </div>
</header>



          <main className="max-w-3xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center shadow-xl bg-red-500/15 border border-red-300/40">
                <svg
                  className="w-12 h-12 text-red-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>

              <h2 className="text-3xl font-bold text-white mb-4">
                Registration Currently Closed
              </h2>

              <p className="text-white/70 text-lg mb-6 max-w-md mx-auto">
                Student registration is not currently accepting new submissions. Please check
                back later or contact the administrator for more information.
              </p>

              <div className="bg-red-500/10 border border-red-400/30 rounded-2xl p-4 text-sm text-red-200 max-w-md mx-auto">
                <p className="font-medium mb-1">📧 Need Help?</p>
                <p className="text-xs text-red-300/80">
                  Contact your faculty coordinator or the MegaPlay admin team for assistance.
                </p>
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

  // If already registered - show status screen for pending/rejected only
  if (existingStudent) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#000000]">
        {/* Background System */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]"></div>
        
        {/* Animated Blobs */}
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-blue-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>

        {/* Content Layer */}
        <div className="relative z-10">
          <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Logo and Title Section */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0">
          <Image
            src="/klo2.svg"
            alt="MegaPlay"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px] w-10 h-10"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            MegaPlay Registration
          </h1>
          <p className="text-[10px] sm:text-xs text-indigo-400 font-medium truncate">
            Student Portal • Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* User Actions Section */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* Email - Hidden on mobile and small tablets */}
        <div className="hidden lg:block text-right">
          <p className="text-sm text-white/80 max-w-xs truncate">{user.email}</p>
        </div>
        
        {/* Logout Button - Compact on mobile */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {isLoggingOut ? (
            <span className="hidden sm:inline">Logging out...</span>
          ) : (
            <span className="hidden sm:inline">Logout</span>
          )}
          {/* Mobile icon/short text */}
          <span className="sm:hidden">{isLoggingOut ? '...' : 'Logout'}</span>
        </button>
      </div>
    </div>
  </div>
</header>


          <main className="max-w-3xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl">
              <div
                className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center shadow-xl ${
                  existingStudent.status === 'rejected'
                    ? 'bg-red-500/15 border border-red-300/40'
                    : 'bg-yellow-500/15 border border-yellow-300/40'
                }`}
              >
                {existingStudent.status === 'rejected' ? (
                  <svg
                    className="w-10 h-10 text-red-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.4}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-10 h-10 text-yellow-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.4}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
              </div>

              <h2 className="text-3xl font-bold text-white mb-3 text-center">
                {existingStudent.status === 'rejected'
                  ? 'Registration Rejected'
                  : 'Registration Submitted'}
              </h2>

              <p className="text-white/70 text-lg mb-6 text-center">
                {existingStudent.status === 'rejected' ? (
                  <>
                    Your registration was not approved. Please contact the faculty coordinator
                    for more information.
                  </>
                ) : (
                  <>
                    Your registration for{' '}
                    <strong>{getCommitteeName(existingStudent.committee)}</strong> committee
                    is pending approval.
                  </>
                )}
              </p>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Name:</span>
                  <span className="text-white font-medium">{existingStudent.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Reg No:</span>
                  <span className="text-white font-medium">{existingStudent.regno}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Department:</span>
                  <span className="text-white font-medium">{existingStudent.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Committee:</span>
                  <span className="text-white font-medium">
                    {getCommitteeName(existingStudent.committee)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Category:</span>
                  <span className="text-white font-medium capitalize">
                    {existingStudent.category}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Status:</span>
                  <span
                    className={`font-semibold capitalize ${
                      existingStudent.status === 'rejected'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                    }`}
                  >
                    {existingStudent.status}
                  </span>
                </div>
              </div>

              <p className="text-white/50 text-xs text-center mt-6">
                {existingStudent.status === 'pending' &&
                  'Please wait for the faculty coordinator to review your registration.'}
              </p>
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

  // Registration form (only shown if NOT registered AND registration is OPEN)
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#000000]">
      {/* Background System */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%)]"></div>
      
      {/* Animated Blobs */}
      <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-blue-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/8 rounded-full blur-[90px]"></div>

      {/* Content Layer */}
      <div className="relative z-10">
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Logo and Title Section */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0">
          <Image
            src="/klo2.svg"
            alt="MegaPlay"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px] w-10 h-10"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            MegaPlay Registration
          </h1>
          <p className="text-[10px] sm:text-xs text-indigo-400 font-medium truncate">
            Student Portal • Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* User Actions Section */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* Email - Hidden on mobile and small tablets */}
        <div className="hidden lg:block text-right">
          <p className="text-sm text-white/80 max-w-xs truncate">{user.email}</p>
        </div>
        
        {/* Logout Button - Compact on mobile */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {isLoggingOut ? (
            <span className="hidden sm:inline">Logging out...</span>
          ) : (
            <span className="hidden sm:inline">Logout</span>
          )}
          {/* Mobile icon/short text */}
          <span className="sm:hidden">{isLoggingOut ? '...' : 'Logout'}</span>
        </button>
      </div>
    </div>
  </div>
</header>


        <main className="max-w-3xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          {activeCommittees.length === 0 && (
            <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="text-yellow-200 text-sm">
                No committees are currently available for registration. Please contact the administrator.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white mb-6">
                Student Registration Form
              </h2>

              {/* Personal Information */}
              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Personal Information
                </h3>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Full Name"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-300 mt-1">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Registration Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    name="regno"
                    value={formData.regno}
                    onChange={handleChange}
                    placeholder="URK23CS7128"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                  />
                  {errors.regno && (
                    <p className="text-xs text-red-300 mt-1">{errors.regno}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={user.email || ''}
                    disabled
                    className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white/70 cursor-not-allowed"
                  />
                  <p className="text-xs text-white/50 mt-1">Auto-filled from your login</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Phone Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="9876543210"
                    maxLength={10}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {errors.phone && (
                    <p className="text-xs text-red-300 mt-1">{errors.phone}</p>
                  )}
                </div>
              </div>

              {/* Academic Information */}
              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Academic Information
                </h3>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Department <span className="text-red-400">*</span>
                  </label>
                  <select
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  {errors.department && (
                    <p className="text-xs text-red-300 mt-1">{errors.department}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Hostel <span className="text-red-400">*</span>
                    </label>
                    <select
                      name="hostel"
                      value={formData.hostel}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="">Select Hostel</option>
                      {hostels.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    {errors.hostel && (
                      <p className="text-xs text-red-300 mt-1">{errors.hostel}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Room Number <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="roomNumber"
                      value={formData.roomNumber}
                      onChange={handleChange}
                      placeholder="101"
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {errors.roomNumber && (
                      <p className="text-xs text-red-300 mt-1">{errors.roomNumber}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Committee Selection */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Committee & Category
                </h3>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Select Committee <span className="text-red-400">*</span>
                  </label>
                  <select
                    name="committee"
                    value={formData.committee}
                    onChange={handleChange}
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                    disabled={activeCommittees.length === 0}
                  >
                    <option value="">Select Committee</option>
                    {activeCommittees.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                        {c.description && ` - ${c.description}`}
                      </option>
                    ))}
                  </select>
                  {errors.committee && (
                    <p className="text-xs text-red-300 mt-1">{errors.committee}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-3">
                    Attendance Category <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('normal')}
                      className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
                        formData.category === 'normal'
                          ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-100'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Normal (OD)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('scholarship')}
                      className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
                        formData.category === 'scholarship'
                          ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-100'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Scholarship
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || activeCommittees.length === 0}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Submitting Registration...
                </span>
              ) : (
                'Submit Registration'
              )}
            </button>
          </form>
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
 