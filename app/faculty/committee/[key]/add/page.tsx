// app/committee/[key]/add/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService';
import { getCommitteesForYear, Committee } from '@/lib/services/committeeService';
import { getFacultiesByYear } from '@/lib/services/facultyService';
import { registerStudent, getStudentByEmail } from '@/lib/services/studentService';

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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl animate-[scale-in_0.2s_ease-out]">
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
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default function CommitteeFacultyAddStudentPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const committeeKey = params.key as string;

  const [currentYear, setCurrentYear] = useState<string | null>(null);
  const [committee, setCommittee] = useState<Committee | null>(null);
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
    if (committeeKey) {
      checkAuthAndLoadData();
    }
  }, [user, loading, committeeKey, router]);

  const showModal = (title: string, message: string, type: 'success' | 'error') => {
    setModalState({
      isOpen: true,
      title,
      message,
      type,
    });
  };

  const closeModal = () => {
    setModalState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  };

  const checkAuthAndLoadData = async () => {
    try {
      const settings = await getAppSettings();
      if (!settings?.currentYear) {
        showModal('Error', 'No active year configured.', 'error');
        setTimeout(() => router.push('/login'), 2000);
        return;
      }

      setCurrentYear(settings.currentYear);
      setDepartments(settings.departments || []);
      setHostels(settings.hostels || []);

      // Get committees for this year
      const allCommittees = await getCommitteesForYear(settings.currentYear);
      const foundCommittee = allCommittees.find((c) => c?.key === committeeKey);

      if (!foundCommittee) {
        showModal('Error', `Committee "${committeeKey}" not found for this year.`, 'error');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }
      setCommittee(foundCommittee);

      // Faculty authorization and committee assignment
      const faculties = await getFacultiesByYear(settings.currentYear);
      if (!Array.isArray(faculties) || faculties.length === 0) {
        showModal('Access Denied', 'Unable to load faculty data.', 'error');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      const faculty = faculties.find((f) => f?.email === user?.email);
      if (!faculty) {
        showModal('Access Denied', 'You are not assigned to any committees.', 'error');
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      const committees = Array.isArray(faculty.committees) ? faculty.committees : [];
      if (!committees.includes(committeeKey)) {
        showModal(
          'Access Denied',
          'You are not authorized to add students to this committee.',
          'error'
        );
        setTimeout(() => router.push('/faculty/dashboard'), 2000);
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error('Failed to load settings:', error);
      showModal('Error', 'Failed to load configuration.', 'error');
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !currentYear || !committee) return;

    setSubmitting(true);

    try {
      // Check if student already exists (per year)
      const existing = await getStudentByEmail(
        currentYear,
        formData.email.trim().toLowerCase()
      );
      if (existing) {
        showModal(
          'Student Already Exists',
          'A student with this email already exists for this year.',
          'error'
        );
        setSubmitting(false);
        return;
      }

      // Register student with committee locked to this page's committee
      await registerStudent(currentYear, {
        name: formData.name.trim(),
        regno: formData.regno.trim().toUpperCase(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        department: formData.department,
        hostel: formData.hostel,
        roomNumber: formData.roomNumber.trim(),
        committee: committee.key,
        category: formData.category,
        status: formData.status,
      });

      showModal(
        'Success!',
        `Student "${formData.name}" has been added to ${committee.name} with status: ${formData.status}.`,
        'success'
      );

      // Reset form (keep committee via state)
      setFormData({
        name: '',
        regno: '',
        email: '',
        phone: '',
        department: '',
        hostel: '',
        roomNumber: '',
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="absolute top-20 -left-40 w-80 h-80 bg-purple-500/15 rounded-full blur-[110px] animate-pulse"></div>
        <div className="absolute bottom-20 -right-40 w-80 h-80 bg-pink-500/15 rounded-full blur-[110px] animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAuthorized || !committee) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#000000]">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.08),transparent_50%)]"></div>
        
        <div className="relative z-10 text-center">
          <p className="text-red-400 mb-4">Unauthorized Access</p>
          <button
            onClick={() => router.push('/faculty/dashboard')}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl"
          >
            Go to Faculty Dashboard
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
        {/* Modal */}
        <Modal
          isOpen={modalState.isOpen}
          onClose={closeModal}
          title={modalState.title}
          message={modalState.message}
          type={modalState.type}
        />

        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Left Section: Back Button, Logo, and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/faculty/committee/${committeeKey}/dashboard`)}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
          title="Back to Committee Dashboard"
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
            <span className="hidden sm:inline">Add Student to </span>
            <span className="sm:hidden">Add to </span>
            {committee.name}
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">Committee Faculty Portal • </span>
            Year {currentYear || 'N/A'}
          </p>
        </div>
      </div>

      {/* Right Section: User Email */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <p className="text-[10px] sm:text-xs text-white/70 hidden md:block max-w-[150px] lg:max-w-[200px] truncate">
          {user?.email}
        </p>
      </div>
    </div>
  </div>
</header>


        <main className="max-w-3xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-400/30 rounded-2xl p-4 mb-6 flex items-start gap-3">
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
              <p className="font-medium mb-1">Committee Faculty Override</p>
              <p className="text-purple-300/80 text-xs">
                Student self-registration may be closed, but you can still add
                students directly to this committee and set their initial approval status.
              </p>
            </div>
          </div>

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
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="" className="bg-slate-800 text-white">
                      Select Department
                    </option>
                    {departments.map((dept) => (
                      <option
                        key={dept}
                        value={dept}
                        className="bg-slate-800 text-white"
                      >
                        {dept}
                      </option>
                    ))}
                  </select>
                  {errors.department && (
                    <p className="text-xs text-red-300 mt-1">
                      {errors.department}
                    </p>
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
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 [&>option]:bg-slate-800 [&>option]:text-white"
                    >
                      <option value="" className="bg-slate-800 text-white">
                        Select Hostel
                      </option>
                      {hostels.map((h) => (
                        <option
                          key={h}
                          value={h}
                          className="bg-slate-800 text-white"
                        >
                          {h}
                        </option>
                      ))}
                    </select>
                    {errors.hostel && (
                      <p className="text-xs text-red-300 mt-1">
                        {errors.hostel}
                      </p>
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
                      <p className="text-xs text-red-300 mt-1">
                        {errors.roomNumber}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Committee & Category */}
              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-medium text-white/90 border-b border-white/10 pb-2">
                  Committee & Category
                </h3>

                {/* Locked committee info */}
                <div className="bg-white/5 border border-white/15 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/60">Committee</p>
                    <p className="text-sm text-white font-semibold">
                      {committee.name}
                    </p>
                    {committee.description && (
                      <p className="text-xs text-white/50 mt-0.5">
                        {committee.description}
                      </p>
                    )}
                  </div>
                  <span className="px-3 py-1 text-xs rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/40">
                    Locked
                  </span>
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
                    Set the initial approval status for this student.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
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
