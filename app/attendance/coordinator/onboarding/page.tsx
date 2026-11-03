'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { isCoordinator } from '@/lib/services/coordinatorService';
import { registerStudent, getStudentByEmail, Student } from '@/lib/services/studentService';

export default function CoordinatorOnboardingPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [hostels, setHostels] = useState<string[]>([]);

  const [existingStudent, setExistingStudent] = useState<Student | null>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const [isCoordinatorVerified, setIsCoordinatorVerified] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    regno: '',
    phone: '',
    department: '',
    hostel: '',
    roomNumber: '',
    category: 'normal' as 'normal' | 'scholarship',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

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
        router.push('/login');
        return;
      }

      setCurrentYear(settings.currentYear);
      setDepartments(settings.departments || []);
      setHostels(settings.hostels || []);

      if (!user?.email) {
        router.push('/login');
        return;
      }

      // Verify user is actually a coordinator
      const isCoord = await isCoordinator(user.email, settings.currentYear);
      if (!isCoord) {
        alert('Access denied. You are not assigned as a coordinator.');
        router.push('/login');
        return;
      }

      setIsCoordinatorVerified(true);

      // Check if coordinator already has student profile
      const existing = await getStudentByEmail(settings.currentYear, user.email);
      if (existing) {
        // Already completed onboarding - redirect to coordinator portal
        setExistingStudent(existing);
        router.push('/attendance/coordinator/dashboard');
        return;
      }

      setIsCheckingExisting(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      alert('Failed to load onboarding page.');
      router.push('/login');
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !currentYear || !user?.email) return;

    setSubmitting(true);

    try {
      // ✨ Register coordinator as student with 'attendance' committee and 'approved' status
      await registerStudent(currentYear, {
        name: formData.name.trim(),
        regno: formData.regno.trim().toUpperCase(),
        email: user.email.toLowerCase(),
        phone: formData.phone.trim(),
        department: formData.department,
        hostel: formData.hostel,
        roomNumber: formData.roomNumber.trim(),
        committee: 'attendance', // ✨ Auto-set to attendance
        category: formData.category,
        status: 'approved', // ✨ Auto-approved (no manual approval needed)
      });

      // Show success modal
      setShowSuccessModal(true);

      // Redirect to coordinator portal after 2 seconds
      setTimeout(() => {
        router.push('/attendance/coordinator/dashboard');
      }, 2000);
    } catch (error) {
      console.error('Onboarding failed:', error);
      alert('Failed to complete onboarding. Please try again.');
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

  if (loading || isCheckingExisting) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px] animate-pulse"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading coordinator onboarding...</p>
        </div>
      </div>
    );
  }

  if (!user || !isCoordinatorVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        
        <p className="relative z-10 text-white">Redirecting to login...</p>
      </div>
    );
  }

  // Registration form
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
        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 border border-white/10 rounded-3xl p-8 max-w-md mx-4 shadow-2xl animate-[scale-in_0.2s_ease-out]">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-emerald-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-2">
                Onboarding Complete!
              </h3>
              <p className="text-white/70 text-center mb-6">
                Your coordinator profile has been created successfully. Redirecting to attendance portal...
              </p>
              <div className="flex justify-center">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          </div>
        )}

        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              {/* Left Section */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center shadow-2xl flex-shrink-0">
                  <Image
                    src="/klo2.svg"
                    alt="Logo"
                    width={28}
                    height={28}
                    className="drop-shadow-lg sm:w-[32px] sm:h-[32px]"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
                    Coordinator Onboarding
                  </h1>
                  <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
                    Complete Your Profile • Year {currentYear || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs sm:text-sm text-white/80 max-w-[150px] truncate">{user.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {isLoggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-[fadeInUp_0.7s_ease-out]">
          {/* Info Banner */}
          <div className="bg-purple-500/10 border border-purple-400/30 rounded-2xl p-4 sm:p-5 mb-6 flex items-start gap-3">
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6 text-purple-300 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <h3 className="text-purple-200 font-semibold mb-1 text-sm sm:text-base">
                Welcome, Attendance Coordinator!
              </h3>
              <p className="text-purple-200/80 text-xs sm:text-sm leading-relaxed">
                You've been assigned as an <strong>Attendance Coordinator</strong>. Please complete your profile below to access the attendance marking portal. Your committee will be automatically set to <strong>"Attendance"</strong> and your account will be approved immediately.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-6">
                Complete Your Profile
              </h2>

              {/* Personal Information */}
              <div className="space-y-4 mb-8">
                <h3 className="text-base sm:text-lg font-medium text-white/90 border-b border-white/10 pb-2">
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
                    placeholder="John Doe"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                    placeholder="21EUCS001"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase"
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
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {errors.phone && (
                    <p className="text-xs text-red-300 mt-1">{errors.phone}</p>
                  )}
                </div>
              </div>

              {/* Academic Information */}
              <div className="space-y-4 mb-8">
                <h3 className="text-base sm:text-lg font-medium text-white/90 border-b border-white/10 pb-2">
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
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Hostel <span className="text-red-400">*</span>
                    </label>
                    <select
                      name="hostel"
                      value={formData.hostel}
                      onChange={handleChange}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
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
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {errors.roomNumber && (
                      <p className="text-xs text-red-300 mt-1">{errors.roomNumber}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Committee & Category */}
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Assignment Details
                </h3>

                {/* Committee (Read-only) */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Committee
                  </label>
                  <div className="w-full bg-purple-500/10 border border-purple-400/30 rounded-2xl px-4 py-3 flex items-center justify-between">
                    <span className="text-purple-200 font-medium">Attendance</span>
                    <span className="px-3 py-1 bg-purple-500/20 border border-purple-400/40 rounded-lg text-xs text-purple-200">
                      Auto-assigned
                    </span>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Your committee is automatically set to Attendance
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-3">
                    Attendance Category <span className="text-red-400">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('normal')}
                      className={`flex-1 px-3 sm:px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
                        formData.category === 'normal'
                          ? 'bg-purple-500/20 border-purple-400/60 text-purple-100'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Normal (OD)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('scholarship')}
                      className={`flex-1 px-3 sm:px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
                        formData.category === 'scholarship'
                          ? 'bg-purple-500/20 border-purple-400/60 text-purple-100'
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
              disabled={submitting}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="hidden sm:inline">Completing Onboarding...</span>
                  <span className="sm:hidden">Processing...</span>
                </span>
              ) : (
                <>
                  <span className="hidden sm:inline">Complete Onboarding & Access Portal</span>
                  <span className="sm:hidden">Complete Onboarding</span>
                </>
              )}
            </button>
          </form>
        </main>
      </div>

      <style jsx global>{`
        @keyframes scale-in {
          from {
            transform: scale(0.9);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        
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
