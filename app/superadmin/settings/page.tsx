'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isSuperAdmin } from '@/lib/utils/roleCheck';
import { 
  getAppSettings, 
  updateAppSettings, 
  AppSettings,
  addDepartment,
  removeDepartment,
  addHostel,
  removeHostel,
  removeActiveCommittee,
} from '@/lib/services/settingsService';
import { 
  getBaseCommittees,
  addBaseCommittee,
  updateBaseCommittee,
  deleteBaseCommittee,
  BaseCommittee,
  createYearCommittees,
  getCommitteesForYear,
  deleteYearCommittee,
  deleteYearCommitteeWithData,      
  deleteBaseCommitteeWithAllData,
} from '@/lib/services/committeeService';

export default function SuperAdminSettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Form state
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [activeCommittees, setActiveCommittees] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [hostels, setHostels] = useState<string[]>([]);
  const [baseCommittees, setBaseCommittees] = useState<BaseCommittee[]>([]);

  // Input fields for adding new items
  const [newDepartment, setNewDepartment] = useState('');
  const [newHostel, setNewHostel] = useState('');

  // Committee modal states
  const [showAddCommitteeModal, setShowAddCommitteeModal] = useState(false);
  const [editingCommittee, setEditingCommittee] = useState<BaseCommittee | null>(null);
  const [committeeFormData, setCommitteeFormData] = useState({
    key: '',
    name: '',
    description: ''
  });

  // Loading states for individual operations
  const [addingDepartment, setAddingDepartment] = useState(false);
  const [removingDepartment, setRemovingDepartment] = useState<string | null>(null);
  const [addingHostel, setAddingHostel] = useState(false);
  const [removingHostel, setRemovingHostel] = useState<string | null>(null);
  const [submittingCommittee, setSubmittingCommittee] = useState(false);
  const [removingCommittee, setRemovingCommittee] = useState<string | null>(null);
  const [activatingCommittees, setActivatingCommittees] = useState<string[]>([]);
  const [deactivatingCommittees, setDeactivatingCommittees] = useState<string[]>([]);
  const [togglingRegistration, setTogglingRegistration] = useState(false);

  // Error states
  const [departmentError, setDepartmentError] = useState('');
  const [hostelError, setHostelError] = useState('');
  const [committeeError, setCommitteeError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!isSuperAdmin(user.email)) {
      router.push('/login');
      return;
    }
    loadSettings();
  }, [user, authLoading]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [settingsData, committeesData] = await Promise.all([
        getAppSettings(),
        getBaseCommittees(),
      ]);
      
      if (settingsData) {
        setSettings(settingsData);
        setRegistrationOpen(settingsData.registrationOpen ?? false);
        setActiveCommittees(settingsData.activeCommittees || []);
        setDepartments(settingsData.departments || []);
        setHostels(settingsData.hostels || []);
      }

      setBaseCommittees(Array.isArray(committeesData) ? committeesData : []);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRegistration = async () => {
    if (!user?.email) return;

    const newState = !registrationOpen;
    setTogglingRegistration(true);

    try {
      const result = await updateAppSettings({
        registrationOpen: newState,
        lastModifiedBy: user.email,
      });

      if (result.success) {
        setRegistrationOpen(newState);
        alert(`✅ Registration ${newState ? 'OPENED' : 'CLOSED'} successfully!`);
      } else {
        alert('Failed to update registration status');
      }
    } catch (error) {
      console.error('Failed to toggle registration:', error);
      alert('Failed to update registration status');
    } finally {
      setTogglingRegistration(false);
    }
  };

  const handleActivateCommitteeForYear = async (committeeKey: string) => {
    if (!settings?.currentYear) {
      alert('❌ No current year found in settings');
      return;
    }

    const committee = baseCommittees.find(c => c.key === committeeKey);
    if (!committee) return;

    if (!confirm(`Activate "${committee.name}" for year ${settings.currentYear}?`)) {
      return;
    }

    setActivatingCommittees(prev => [...prev, committeeKey]);

    try {
      await createYearCommittees(settings.currentYear, [committeeKey]);
      
      const updatedActiveCommittees = [...new Set([...activeCommittees, committeeKey])];
      setActiveCommittees(updatedActiveCommittees);
      
      await updateAppSettings({
        activeCommittees: updatedActiveCommittees,
        lastModifiedBy: user?.email || 'system',
      });

      alert(`✅ Committee "${committee.name}" activated for year ${settings.currentYear}!`);
      await loadSettings();
    } catch (error) {
      console.error('Failed to activate committee:', error);
      alert('❌ Failed to activate committee for year');
    } finally {
      setActivatingCommittees(prev => prev.filter(k => k !== committeeKey));
    }
  };

  const handleDeactivateCommitteeForYear = async (committeeKey: string) => {
    if (!settings?.currentYear) {
      alert('❌ No current year found in settings');
      return;
    }

    const committee = baseCommittees.find(c => c.key === committeeKey);
    if (!committee) return;

    const yearCommittees = await getCommitteesForYear(settings.currentYear);
    const committeeData = yearCommittees.find(c => c.key === committeeKey);
    
    const warningMessage = committeeData?.facultyEmails && committeeData.facultyEmails.length > 0
      ? `⚠️ WARNING: Committee "${committee.name}" has ${committeeData.facultyEmails.length} faculty member(s) assigned.\n\nDeactivating will:\n• Delete the committee\n• Remove ALL student registrations\n• Remove faculty assignments\n• This action cannot be undone!\n\nAre you sure?`
      : `Deactivate "${committee.name}" for year ${settings.currentYear}?\n\nThis will delete:\n• Committee data\n• All student registrations\n• Faculty assignments\n\nContinue?`;

    if (!confirm(warningMessage)) {
      return;
    }

    setDeactivatingCommittees(prev => [...prev, committeeKey]);

    try {
      const result = await deleteYearCommitteeWithData(committeeKey, settings.currentYear);
      
      if (result.success) {
        await removeActiveCommittee(committeeKey, user?.email || 'system');
        setActiveCommittees(prev => prev.filter(k => k !== committeeKey));

        const summary = `✅ Committee "${committee.name}" deactivated successfully!\n\n` +
          `📊 Deletion Summary:\n` +
          `• Students removed: ${result.studentsDeleted || 0}\n` +
          `• Faculties affected: ${result.facultiesAffected || 0}`;
        
        alert(summary);
        await loadSettings();
      } else {
        alert(`❌ ${result.error || 'Failed to deactivate committee'}`);
      }
    } catch (error) {
      console.error('Failed to deactivate committee:', error);
      alert('❌ Failed to deactivate committee');
    } finally {
      setDeactivatingCommittees(prev => prev.filter(k => k !== committeeKey));
    }
  };

  const handleDeleteCommittee = async (key: string, name: string) => {
    if (!confirm(
      `⚠️ DANGER: DELETE "${name}" PERMANENTLY?\n\n` +
      `This will delete from ALL years:\n` +
      `• Base committee template\n` +
      `• All committee instances\n` +
      `• ALL student registrations\n` +
      `• ALL faculty assignments\n\n` +
      `🔴 THIS ACTION CANNOT BE UNDONE! 🔴\n\n` +
      `Type DELETE in the next prompt to confirm.`
    )) {
      return;
    }

    const confirmation = prompt('Type DELETE to confirm permanent deletion:');
    if (confirmation !== 'DELETE') {
      alert('❌ Deletion cancelled');
      return;
    }

    setRemovingCommittee(key);
    setCommitteeError('');
    
    try {
      if (activeCommittees.includes(key)) {
        await removeActiveCommittee(key, user?.email || 'system');
      }

      const result = await deleteBaseCommitteeWithAllData(key);
      
      if (result.success) {
        setActiveCommittees(prev => prev.filter(k => k !== key));
        
        const summary = `✅ Committee "${name}" PERMANENTLY DELETED!\n\n` +
          `📊 Complete Deletion Summary:\n` +
          `• Years affected: ${result.yearsAffected?.length || 0} (${result.yearsAffected?.join(', ') || 'none'})\n` +
          `• Total students deleted: ${result.totalStudentsDeleted || 0}\n` +
          `• Total faculties affected: ${result.totalFacultiesAffected || 0}\n` +
          `• Base template deleted: Yes`;
        
        alert(summary);
        await loadSettings();
      } else {
        alert(`❌ ${result.error || 'Failed to delete committee'}`);
      }
    } catch (error) {
      console.error('Failed to delete committee:', error);
      alert('❌ Failed to delete committee. Please try again.');
    } finally {
      setRemovingCommittee(null);
    }
  };

  const handleAddDepartment = async () => {
    if (!user?.email) return;
    if (!newDepartment.trim()) {
      setDepartmentError('Please enter a department name');
      return;
    }

    setAddingDepartment(true);
    setDepartmentError('');

    try {
      const result = await addDepartment(newDepartment.trim(), user.email);

      if (result.success) {
        setNewDepartment('');
        await loadSettings();
        alert('✅ Department added successfully!');
      } else {
        setDepartmentError(result.error || 'Failed to add department');
      }
    } catch (error) {
      console.error('Failed to add department:', error);
      setDepartmentError('Failed to add department');
    } finally {
      setAddingDepartment(false);
    }
  };

  const handleRemoveDepartment = async (dept: string) => {
    if (!user?.email) return;
    if (!confirm(`Remove department "${dept}"?`)) return;

    setRemovingDepartment(dept);

    try {
      const result = await removeDepartment(dept, user.email);

      if (result.success) {
        await loadSettings();
        alert('✅ Department removed successfully!');
      } else {
        alert(result.error || 'Failed to remove department');
      }
    } catch (error) {
      console.error('Failed to remove department:', error);
      alert('Failed to remove department');
    } finally {
      setRemovingDepartment(null);
    }
  };

  const handleAddHostel = async () => {
    if (!user?.email) return;
    if (!newHostel.trim()) {
      setHostelError('Please enter a hostel name');
      return;
    }

    setAddingHostel(true);
    setHostelError('');

    try {
      const result = await addHostel(newHostel.trim(), user.email);

      if (result.success) {
        setNewHostel('');
        await loadSettings();
        alert('✅ Hostel added successfully!');
      } else {
        setHostelError(result.error || 'Failed to add hostel');
      }
    } catch (error) {
      console.error('Failed to add hostel:', error);
      setHostelError('Failed to add hostel');
    } finally {
      setAddingHostel(false);
    }
  };

  const handleRemoveHostel = async (hostel: string) => {
    if (!user?.email) return;
    if (!confirm(`Remove hostel "${hostel}"?`)) return;

    setRemovingHostel(hostel);

    try {
      const result = await removeHostel(hostel, user.email);

      if (result.success) {
        await loadSettings();
        alert('✅ Hostel removed successfully!');
      } else {
        alert(result.error || 'Failed to remove hostel');
      }
    } catch (error) {
      console.error('Failed to remove hostel:', error);
      alert('Failed to remove hostel');
    } finally {
      setRemovingHostel(null);
    }
  };

  const handleAddCommittee = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!committeeFormData.key.trim() || !committeeFormData.name.trim()) {
      setCommitteeError('Committee key and name are required');
      return;
    }

    const keyRegex = /^[a-z0-9_]+$/;
    if (!keyRegex.test(committeeFormData.key)) {
      setCommitteeError('Key must be lowercase with no spaces (use underscores)');
      return;
    }

    if (baseCommittees.some(c => c.key === committeeFormData.key)) {
      setCommitteeError('A committee with this key already exists');
      return;
    }

    setSubmittingCommittee(true);
    setCommitteeError('');

    try {
      const result = await addBaseCommittee(
        committeeFormData.key.trim(),
        committeeFormData.name.trim(),
        committeeFormData.description.trim(),
        user?.email || undefined
      );
      
      if (result.success) {
        setShowAddCommitteeModal(false);
        setCommitteeFormData({ key: '', name: '', description: '' });
        await loadSettings();
        alert('✅ Committee added successfully!');
      } else {
        setCommitteeError(result.error || 'Failed to add committee');
      }
    } catch (error) {
      console.error('Failed to add committee:', error);
      setCommitteeError('Failed to add committee. Please try again.');
    } finally {
      setSubmittingCommittee(false);
    }
  };

  const handleUpdateCommittee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCommittee) return;

    if (!committeeFormData.name.trim()) {
      setCommitteeError('Committee name is required');
      return;
    }

    setSubmittingCommittee(true);
    setCommitteeError('');
    
    try {
      const result = await updateBaseCommittee(editingCommittee.key, {
        name: committeeFormData.name.trim(),
        description: committeeFormData.description.trim(),
      });
      
      if (result.success) {
        setEditingCommittee(null);
        setCommitteeFormData({ key: '', name: '', description: '' });
        await loadSettings();
        alert('✅ Committee updated successfully!');
      } else {
        setCommitteeError(result.error || 'Failed to update committee');
      }
    } catch (error) {
      console.error('Failed to update committee:', error);
      setCommitteeError('Failed to update committee. Please try again.');
    } finally {
      setSubmittingCommittee(false);
    }
  };

  const openEditCommitteeModal = (committee: BaseCommittee) => {
    setEditingCommittee(committee);
    setCommitteeFormData({
      key: committee.key,
      name: committee.name,
      description: committee.description || '',
    });
    setCommitteeError('');
  };

  const closeCommitteeModal = () => {
    setShowAddCommitteeModal(false);
    setEditingCommittee(null);
    setCommitteeFormData({ key: '', name: '', description: '' });
    setCommitteeError('');
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
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
        <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
        <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
        <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/8 rounded-full blur-[90px]"></div>
        
        <div className="relative z-10 text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading settings...</p>
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
      {/* Left Section: Back Button, Logo, and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Back Button */}
        <button
          onClick={() => router.push('/superadmin')}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all flex-shrink-0"
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
            alt="Logo"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px]"
          />
        </div>

        {/* Title Section */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            <span className="hidden sm:inline">Registration Settings</span>
            <span className="sm:hidden">Settings</span>
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">SuperAdmin Control Panel • </span>
            {settings?.currentYear || 'System Config'}
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
        {/* User Info Card - Hidden on mobile */}
        {user && (
          <div className="hidden lg:flex items-center gap-2 sm:gap-3 text-xs sm:text-sm bg-white/5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl backdrop-blur-sm border border-white/10">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center text-white font-semibold text-[10px] sm:text-xs shadow-lg flex-shrink-0">
              {user.displayName?.charAt(0)?.toUpperCase() || 'S'}
            </div>
            <span className="text-white/90 font-medium max-w-[120px] xl:max-w-[200px] truncate">
              {user.displayName || user.email}
            </span>
            <span className="px-2 py-0.5 sm:py-1 bg-purple-500/20 text-purple-300 border border-purple-400/30 text-[10px] sm:text-xs rounded-full font-medium whitespace-nowrap">
              SUPERADMIN
            </span>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {isLoggingOut ? (
            <>
              <span className="hidden sm:inline">Logging out...</span>
              <span className="sm:hidden">...</span>
            </>
          ) : (
            'Logout'
          )}
        </button>
      </div>
    </div>
  </div>
</header>


        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 animate-[fadeInUp_0.7s_ease-out]">
          {/* Registration Toggle */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent mb-3">
                  Student Registration Control
                </h2>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${registrationOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                  <p className="text-base sm:text-lg text-white/80">
                    {registrationOpen
                      ? 'Registration is currently OPEN. Students can submit their forms.'
                      : 'Registration is currently CLOSED. Students cannot submit forms.'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleRegistration}
                disabled={togglingRegistration}
                className={`relative inline-flex h-14 w-28 items-center rounded-full transition-all duration-300 shadow-2xl hover:scale-105 disabled:opacity-50 ${
                  registrationOpen
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                    : 'bg-gradient-to-r from-red-500 to-rose-600'
                }`}
              >
                <span
                  className={`inline-block h-11 w-11 transform rounded-full bg-white shadow-2xl transition-transform duration-300 ${
                    registrationOpen ? 'translate-x-14' : 'translate-x-1.5'
                  }`}
                >
                  {registrationOpen ? (
                    <svg className="w-11 h-11 p-2 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-11 h-11 p-2 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </span>
              </button>
            </div>

            <div className="mt-6 px-4 sm:px-6 py-4 sm:py-5 bg-white/5 border border-white/10 rounded-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/50 mb-1">Current Status</p>
                  <p className={`text-lg font-bold ${
                    registrationOpen ? 'text-emerald-300' : 'text-red-300'
                  }`}>
                    {registrationOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/50 mb-1">Last Modified By</p>
                  <p className="text-sm text-white/80 font-medium">
                    {settings?.lastModifiedBy || 'Unknown'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Committee Management */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6 mb-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent mb-2">
                  Committee Management
                </h2>
                <p className="text-white/70 text-sm">
                  Manage base committees • {activeCommittees.length} active for {settings?.currentYear || 'current year'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/30 rounded-2xl px-6 py-4 text-center">
                  <p className="text-xs text-purple-300 mb-1">Total Committees</p>
                  <p className="text-3xl sm:text-4xl font-bold text-white">{baseCommittees.length}</p>
                </div>
                <button
                  onClick={() => setShowAddCommitteeModal(true)}
                  className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="hidden sm:inline">Add Committee</span>
                  <span className="sm:hidden">Add</span>
                </button>
              </div>
            </div>

            {baseCommittees.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {baseCommittees.map((committee) => {
                  const isActive = activeCommittees.includes(committee.key);
                  const isRemoving = removingCommittee === committee.key;
                  const isActivating = activatingCommittees.includes(committee.key);
                  const isDeactivating = deactivatingCommittees.includes(committee.key);

                  return (
                    <div
                      key={committee.key}
                      className={`group relative p-5 rounded-2xl border-2 transition-all duration-300 ${
                        isActive
                          ? 'bg-purple-500/20 border-purple-400/60 shadow-lg shadow-purple-500/20'
                          : 'bg-white/5 border-white/20 hover:border-white/30 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {isActive && (
                              <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                            <h4 className={`font-semibold transition-colors ${
                              isActive ? 'text-purple-100' : 'text-white/90'
                            }`}>
                              {committee.name}
                            </h4>
                          </div>
                          <p className="text-xs font-mono text-white/50">
                            key: {committee.key}
                          </p>
                        </div>
                      </div>

                      {committee.description && (
                        <p className="text-xs text-white/60 mb-4 leading-relaxed line-clamp-2">
                          {committee.description}
                        </p>
                      )}

                      <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditCommitteeModal(committee)}
                            className="flex-1 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-100 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCommittee(committee.key, committee.name)}
                            disabled={isRemoving}
                            className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-100 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {isRemoving ? (
                              <>
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Deleting...
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                              </>
                            )}
                          </button>
                        </div>
                        
                        {settings?.currentYear && (
                          <>
                            {!isActive ? (
                              <button
                                onClick={() => handleActivateCommitteeForYear(committee.key)}
                                disabled={isActivating}
                                className="w-full px-3 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-400/30 text-purple-100 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {isActivating ? (
                                  <>
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Activating...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span className="hidden sm:inline">Activate for {settings.currentYear}</span>
                                    <span className="sm:hidden">Activate</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeactivateCommitteeForYear(committee.key)}
                                disabled={isDeactivating}
                                className="w-full px-3 py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 hover:from-orange-500/30 hover:to-red-500/30 border border-orange-400/30 text-orange-100 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                {isDeactivating ? (
                                  <>
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Deactivating...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                    <span className="hidden sm:inline">Deactivate from {settings.currentYear}</span>
                                    <span className="sm:hidden">Deactivate</span>
                                  </>
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 sm:py-16 bg-white/5 rounded-2xl border-2 border-dashed border-white/20">
                <div className="w-16 sm:w-20 h-16 sm:h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <svg className="w-8 sm:w-10 h-8 sm:h-10 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">No Committee Templates Yet</h3>
                <p className="text-white/60 mb-4 sm:mb-6 text-sm sm:text-base">Create your first committee template to get started</p>
                <button
                  onClick={() => setShowAddCommitteeModal(true)}
                  className="px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-300 rounded-2xl font-medium transition-all"
                >
                  Add First Committee
                </button>
              </div>
            )}
          </div>

          {/* Departments */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">Departments</h2>
                <p className="text-xs sm:text-sm text-white/70">
                  Manage available departments for student registration
                </p>
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <input
                type="text"
                value={newDepartment}
                onChange={(e) => {
                  setNewDepartment(e.target.value);
                  setDepartmentError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDepartment()}
                placeholder="Add new department..."
                className="flex-1 bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                disabled={addingDepartment}
              />
              <button
                onClick={handleAddDepartment}
                disabled={addingDepartment || !newDepartment.trim()}
                className="px-6 sm:px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl shadow-2xl transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {addingDepartment ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="hidden sm:inline">Adding...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Add</span>
                  </>
                )}
              </button>
            </div>

            {departmentError && (
              <div className="mb-4 bg-red-500/10 border border-red-400/20 rounded-2xl p-4">
                <p className="text-sm text-red-200 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {departmentError}
                </p>
              </div>
            )}

            {departments.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {departments.map((dept) => (
                  <div
                    key={dept}
                    className="group relative px-5 py-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 rounded-2xl text-sm text-white font-medium flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                  >
                    <span className="text-purple-300">📚</span>
                    {dept}
                    <button
                      onClick={() => handleRemoveDepartment(dept)}
                      disabled={removingDepartment === dept}
                      className="w-6 h-6 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-300 hover:text-red-200 flex items-center justify-center transition-all disabled:opacity-50 opacity-0 group-hover:opacity-100"
                      title={`Remove ${dept}`}
                    >
                      {removingDepartment === dept ? (
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white/5 rounded-2xl border-2 border-dashed border-white/20">
                <svg className="w-12 h-12 text-white/30 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <p className="text-sm text-white/60">No departments added yet</p>
              </div>
            )}
          </div>

          {/* Hostels */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">Hostels</h2>
                <p className="text-xs sm:text-sm text-white/70">
                  Manage available hostels for student registration
                </p>
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <input
                type="text"
                value={newHostel}
                onChange={(e) => {
                  setNewHostel(e.target.value);
                  setHostelError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddHostel()}
                placeholder="Add new hostel..."
                className="flex-1 bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                disabled={addingHostel}
              />
              <button
                onClick={handleAddHostel}
                disabled={addingHostel || !newHostel.trim()}
                className="px-6 sm:px-8 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white font-semibold rounded-2xl shadow-2xl transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {addingHostel ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="hidden sm:inline">Adding...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Add</span>
                  </>
                )}
              </button>
            </div>

            {hostelError && (
              <div className="mb-4 bg-red-500/10 border border-red-400/20 rounded-2xl p-4">
                <p className="text-sm text-red-200 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {hostelError}
                </p>
              </div>
            )}

            {hostels.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {hostels.map((hostel) => (
                  <div
                    key={hostel}
                    className="group relative px-5 py-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 rounded-2xl text-sm text-white font-medium flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                  >
                    <span className="text-blue-300">🏠</span>
                    {hostel}
                    <button
                      onClick={() => handleRemoveHostel(hostel)}
                      disabled={removingHostel === hostel}
                      className="w-6 h-6 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-300 hover:text-red-200 flex items-center justify-center transition-all disabled:opacity-50 opacity-0 group-hover:opacity-100"
                      title={`Remove ${hostel}`}
                    >
                      {removingHostel === hostel ? (
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white/5 rounded-2xl border-2 border-dashed border-white/20">
                <svg className="w-12 h-12 text-white/30 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <p className="text-sm text-white/60">No hostels added yet</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Committee Add/Edit Modal */}
      {(showAddCommitteeModal || editingCommittee) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-3xl border border-white/10 max-w-2xl w-full shadow-2xl">
            <div className="p-6 sm:p-8 border-b border-white/10">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                {editingCommittee ? 'Edit Committee Template' : 'Add Committee Template'}
              </h2>
              <p className="text-white/70 text-sm sm:text-base">
                {editingCommittee 
                  ? 'Update the committee information below'
                  : 'Create a new committee template that will be available across all years'}
              </p>
            </div>

            <form onSubmit={editingCommittee ? handleUpdateCommittee : handleAddCommittee} className="p-6 sm:p-8 space-y-6">
              {!editingCommittee && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Committee Key (ID) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={committeeFormData.key}
                    onChange={(e) => {
                      setCommitteeFormData({ ...committeeFormData, key: e.target.value.toLowerCase() });
                      setCommitteeError('');
                    }}
                    placeholder="e.g., photography, dance, music"
                    className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                    required
                    disabled={submittingCommittee}
                  />
                  <p className="text-xs text-white/50 mt-2">
                    Lowercase only, use underscores instead of spaces. This cannot be changed later.
                  </p>
                </div>
              )}

              {editingCommittee && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-sm text-white/60 mb-1">Committee Key (cannot be changed)</p>
                  <p className="text-white font-mono font-semibold">{committeeFormData.key}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Committee Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={committeeFormData.name}
                  onChange={(e) => {
                    setCommitteeFormData({ ...committeeFormData, name: e.target.value });
                    setCommitteeError('');
                  }}
                  placeholder="e.g., Photography Committee"
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                  disabled={submittingCommittee}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={committeeFormData.description}
                  onChange={(e) => setCommitteeFormData({ ...committeeFormData, description: e.target.value })}
                  placeholder="Brief description of the committee..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  disabled={submittingCommittee}
                />
              </div>

              {committeeError && (
                <div className="bg-red-500/10 border border-red-400/20 rounded-2xl p-4">
                  <p className="text-sm text-red-200">{committeeError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeCommitteeModal}
                  disabled={submittingCommittee}
                  className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-medium transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCommittee || !committeeFormData.name.trim() || (!editingCommittee && !committeeFormData.key.trim())}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submittingCommittee ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {editingCommittee ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {editingCommittee ? 'Update Committee' : 'Add Committee'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
