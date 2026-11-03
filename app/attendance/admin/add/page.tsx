'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings } from '@/lib/services/settingsService';
import { getCommitteesForYear, Committee } from '@/lib/services/committeeService';
import { registerStudent, getStudentByEmail } from '@/lib/services/studentService';
import { isAttendanceFaculty } from '@/lib/services/attendanceFacultyService';

// Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type: 'success' | 'error';
}

const Modal = ({ isOpen, onClose, title, message, type }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl animate-[scale-in_0.2s_ease-out]">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {type === 'success' ? (
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400/60 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-400/60 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-2xl font-bold text-white text-center mb-3">
          {title}
        </h3>

        {/* Message */}
        <p className="text-white/80 text-center mb-8 leading-relaxed">
          {message}
        </p>

        {/* Button */}
        <button
          onClick={onClose}
          className={`w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
            type === 'success'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white'
              : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white'
          }`}
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default function AttendanceAdminStudentAddPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [activeCommittees, setActiveCommittees] = useState<Committee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [hostels, setHostels] = useState<string[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success',
  });

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
      
      if (!settings?.currentYear) {
        showModal('Error', 'No active year configured.', 'error');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }

      // Check if user is attendance admin
      const isAdmin = await isAttendanceFaculty(
        user?.email || '',
        settings.currentYear
      );
      
      if (!isAdmin) {
        showModal('Access Denied', 'You are not part of the attendance team.', 'error');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }

      setIsAuthorized(true);
      setCurrentYear(settings.currentYear);
      setDepartments(settings.departments || []);
      setHostels(settings.hostels || []);

      // Fetch all committees
      const allCommittees = await getCommitteesForYear(settings.currentYear);
      const activeComms = allCommittees.filter((c) => 
        c?.isActive && settings.activeCommittees?.includes(c.key)
      );
      setActiveCommittees(activeComms);
    } catch (error) {
      console.error('Failed to load settings:', error);
      showModal('Error', 'Failed to load configuration.', 'error');
    }
  };

  const showModal = (title: string, message: string, type: 'success' | 'error') => {
    setModalState({
      isOpen: true,
      title,
      message,
      type,
    });
  };

  const closeModal = () => {
    setModalState({
      ...modalState,
      isOpen: false,
    });
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

    try {
      // Check if student already exists
      const existing = await getStudentByEmail(currentYear, formData.email.toLowerCase());
      if (existing) {
        showModal(
          'Student Already Exists',
          'A student with this email already exists for this year.',
          'error'
        );
        setSubmitting(false);
        return;
      }

      // Register student with specified status
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

      showModal(
        'Success!',
        `Student "${formData.name}" has been added successfully with status: ${formData.status}`,
        'success'
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
      showModal(
        'Error',
        'Failed to add student. Please try again.',
        'error'
      );
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

  if (!user || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        
        <div className="relative z-10 text-center">
          <p className="text-red-400 mb-4 text-lg">Unauthorized Access</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-xl font-semibold transition-all"
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

      {/* Modal */}
      <Modal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between gap-2">
              {/* Left Section */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="flex items-center justify-center flex-shrink-0">
                  <Image
                    src="/klo2.svg"
                    alt="Logo"
                    width={45}
                    height={45}
                    className="drop-shadow-2xl sm:w-[55px] sm:h-[55px]"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
                    Add Student
                  </h1>
                  <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
                    Attendance Admin Portal • Year {currentYear || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Right Section */}
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                <button
                  onClick={() => router.push('/attendance/admin')}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white/5 hover:bg-white/10 border border-white/20 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all whitespace-nowrap"
                >
                  <span className="hidden sm:inline">← Back to Dashboard</span>
                  <span className="sm:hidden">← Back</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-[fadeInUp_0.7s_ease-out]">
          <div className="bg-purple-500/10 border border-purple-400/30 rounded-2xl p-4 mb-6 flex items-start gap-3">
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
            <div className="text-sm text-purple-200">
              <p className="font-medium mb-1">Attendance Admin Override</p>
              <p className="text-purple-300/80 text-xs">
                This portal allows you to add students even when registration is closed.
                Students added here can have their approval status set immediately.
              </p>
            </div>
          </div>

          {activeCommittees.length === 0 && (
            <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <svg
                className="w-5 h-5 text-yellow-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-yellow-200 text-sm">
                No active committees configured. Please configure committees first.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-semibold text-white mb-6">
                Student Information
              </h2>

              {/* Personal Information */}
              <div className="space-y-4 mb-8">
                <h3 className="text-base sm:text-lg font-medium text-white/90 border-b border-white/10 pb-2">
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

              {/* Committee Selection */}
              <div className="space-y-4 mb-8">
                <h3 className="text-base sm:text-lg font-medium text-white/90 border-b border-white/10 pb-2">
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
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
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
                  <div className="flex gap-3 sm:gap-4">
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

              {/* Approval Status */}
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Approval Status
                </h3>

                <div>
                  <label className="block text-sm font-medium text-white mb-3">
                    Initial Status <span className="text-red-400">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => handleStatusChange('approved')}
                      className={`flex-1 px-3 sm:px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
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
                      className={`flex-1 px-3 sm:px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
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
                      className={`flex-1 px-3 sm:px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
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
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
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
