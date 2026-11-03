'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';

import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { getCommitteesForYear, Committee } from '@/lib/services/committeeService';
import { registerStudent, getStudentByEmail } from '@/lib/services/studentService';

export default function SuperAdminStudentAddPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [activeCommittees, setActiveCommittees] = useState<Committee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [hostels, setHostels] = useState<string[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    regno: '',
    email: '',
    phone: '',
    department: '',
    hostel: '',
    roomNumber: '',
    committee: '',
    category: 'normal' as 'normal' | 'scholarship',
    status: 'approved' as 'pending' | 'approved' | 'rejected',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    checkAuthAndLoadData();
  }, [user, loading]);

  const checkAuthAndLoadData = async () => {
    try {
      const settings = await getAppSettings();
      
      if (!user?.email) {
        router.push('/');
        return;
      }

      setIsAuthorized(true);

      if (!settings?.currentYear) {
        alert('No active year configured.');
        return;
      }

      setCurrentYear(settings.currentYear);
      setDepartments(settings.departments || []);
      setHostels(settings.hostels || []);

      const allCommittees = await getCommitteesForYear(settings.currentYear);
      const activeComms = allCommittees.filter((c) => 
        c?.isActive && settings.activeCommittees?.includes(c.key)
      );
      setActiveCommittees(activeComms);
    } catch (error) {
      console.error('Failed to load settings:', error);
      alert('Failed to load configuration.');
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const auth = getAuth();
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoggingOut(false);
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

  const handleStatusChange = (status: 'pending' | 'approved' | 'rejected') => {
    setFormData((prev) => ({ ...prev, status }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.regno.trim()) newErrors.regno = 'Registration number is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      newErrors.email = 'Invalid email format';
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

    if (!validateForm() || !currentYear) return;

    setSubmitting(true);
    setSuccessMessage('');

    try {
      const existing = await getStudentByEmail(currentYear, formData.email.toLowerCase());
      if (existing) {
        alert('A student with this email already exists for this year.');
        setSubmitting(false);
        return;
      }

      await registerStudent(currentYear, {
        name: formData.name.trim(),
        regno: formData.regno.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        department: formData.department,
        hostel: formData.hostel,
        roomNumber: formData.roomNumber.trim(),
        committee: formData.committee,
        category: formData.category,
        status: formData.status,
      });

      setSuccessMessage(
        `Student "${formData.name}" added successfully with status: ${formData.status}`
      );

      // Reset form
      setFormData({
        name: '',
        regno: '',
        email: '',
        phone: '',
        department: '',
        hostel: '',
        roomNumber: '',
        committee: '',
        category: 'normal',
        status: 'approved',
      });
    } catch (error) {
      console.error('Failed to add student:', error);
      alert('Failed to add student. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getCommitteeName = (key: string): string => {
    const committee = activeCommittees.find((c) => c?.key === key);
    return committee?.name || key;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-400/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-400 mb-4 text-lg font-semibold">Unauthorized Access</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-2xl font-medium transition-all"
          >
            Go Home
          </button>
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
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Left Section: Back Button, Logo, and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Back Button */}
        <button
          onClick={() => router.push('/superadmin')}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
          title="Back to Dashboard"
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
            Add Student
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">Superadmin Portal • </span>
            Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        {/* User Info Card - Hidden on mobile */}
        {user && (
          <div className="hidden lg:flex items-center gap-2 sm:gap-3 text-xs sm:text-sm bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-[10px] sm:text-xs shadow-lg flex-shrink-0">
              {user.email?.charAt(0)?.toUpperCase() || 'S'}
            </div>
            <div className="text-right min-w-0">
              <p className="text-xs sm:text-sm text-white/90 font-medium truncate max-w-[120px] xl:max-w-[150px]">
                {user.email}
              </p>
              <p className="text-[10px] sm:text-xs text-white/50">SuperAdmin</p>
            </div>
          </div>
        )}
        
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


        <main className="max-w-3xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          {successMessage && (
            <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-2xl p-4 mb-6 flex items-center gap-3 shadow-lg shadow-emerald-500/10">
              <svg
                className="w-5 h-5 text-emerald-300 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-emerald-100 text-sm font-medium">{successMessage}</p>
            </div>
          )}

          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-400/30 rounded-2xl p-4 mb-6 flex items-start gap-3 shadow-lg">
            <svg
              className="w-5 h-5 text-purple-300 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div className="text-sm text-purple-100">
              <p className="font-medium mb-1">Superadmin Override</p>
              <p className="text-purple-200/80 text-xs">
                This portal allows you to add students even when registration is closed for
                regular users. Students added here can have their approval status set
                immediately.
              </p>
            </div>
          </div>

          {activeCommittees.length === 0 && (
            <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-2xl p-4 mb-6 flex items-center gap-3 shadow-lg">
              <svg
                className="w-5 h-5 text-yellow-300 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-yellow-100 text-sm">
                No active committees configured. Please configure committees first.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-2xl font-semibold text-white mb-6">
                Student Information
              </h2>

              {/* Personal Information */}
              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Personal Details
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
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="student@karunya.edu.in"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {errors.email && (
                    <p className="text-xs text-red-300 mt-1">{errors.email}</p>
                  )}
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
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
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
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
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

              {/* Committee Selection */}
              <div className="space-y-4 mb-8">
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
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
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
                          ? 'bg-purple-500/20 border-purple-400/60 text-purple-100'
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
                          ? 'bg-purple-500/20 border-purple-400/60 text-purple-100'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      Scholarship
                    </button>
                  </div>
                </div>
              </div>

              {/* Approval Status */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Approval Status
                </h3>

                <div>
                  <label className="block text-sm font-medium text-white mb-3">
                    Initial Status <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleStatusChange('approved')}
                      className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
                        formData.status === 'approved'
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      ✓ Approved
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange('pending')}
                      className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
                        formData.status === 'pending'
                          ? 'bg-yellow-500/20 border-yellow-400/60 text-yellow-100'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      ⏳ Pending
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange('rejected')}
                      className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
                        formData.status === 'rejected'
                          ? 'bg-red-500/20 border-red-400/60 text-red-100'
                          : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      ✗ Rejected
                    </button>
                  </div>
                  <p className="text-xs text-white/50 mt-2">
                    Set the initial approval status for this student
                  </p>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || activeCommittees.length === 0}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
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
                  Adding Student...
                </span>
              ) : (
                'Add Student'
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
