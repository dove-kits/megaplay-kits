'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  getBaseCommittees, 
  addBaseCommittee, 
  updateBaseCommittee, 
  deleteBaseCommittee,
  BaseCommittee 
} from '@/lib/services/committeeService';
import { useAuth } from '@/context/AuthContext';
import { isSuperAdmin } from '@/lib/utils/roleCheck';

export default function BaseCommitteesManagement() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  
  const [committees, setCommittees] = useState<BaseCommittee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCommittee, setEditingCommittee] = useState<BaseCommittee | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    description: ''
  });

  // Operation states
  const [submitting, setSubmitting] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Authentication check
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!isSuperAdmin(user.email)) {
      alert('Access denied. SuperAdmin access required.');
      router.push('/login');
      return;
    }
    loadCommittees();
  }, [user, authLoading]);

  const loadCommittees = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBaseCommittees();
      setCommittees(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load committees:', error);
      setError('Failed to load committees');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.key.trim() || !formData.name.trim()) {
      setError('Committee key and name are required');
      return;
    }

    // Validate key format
    const keyRegex = /^[a-z0-9_]+$/;
    if (!keyRegex.test(formData.key)) {
      setError('Key must be lowercase with no spaces (use underscores)');
      return;
    }

    // Check for duplicate
    if (committees.some(c => c.key === formData.key)) {
      setError('A committee with this key already exists');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const result = await addBaseCommittee(
        formData.key.trim(),
        formData.name.trim(),
        formData.description.trim(),
        user?.email || undefined
      );
      
      if (result.success) {
        setShowAddModal(false);
        setFormData({ key: '', name: '', description: '' });
        await loadCommittees();
        alert('✅ Committee added successfully!');
      } else {
        setError(result.error || 'Failed to add committee');
      }
    } catch (error) {
      console.error('Failed to add committee:', error);
      setError('Failed to add committee. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCommittee) return;

    if (!formData.name.trim()) {
      setError('Committee name is required');
      return;
    }

    setSubmitting(true);
    setError('');
    
    try {
      const result = await updateBaseCommittee(editingCommittee.key, {
        name: formData.name.trim(),
        description: formData.description.trim(),
      });
      
      if (result.success) {
        setEditingCommittee(null);
        setFormData({ key: '', name: '', description: '' });
        await loadCommittees();
        alert('✅ Committee updated successfully!');
      } else {
        setError(result.error || 'Failed to update committee');
      }
    } catch (error) {
      console.error('Failed to update committee:', error);
      setError('Failed to update committee. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (key: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will affect all years using this committee.`)) {
      return;
    }

    setDeletingKey(key);
    setError('');
    
    try {
      const result = await deleteBaseCommittee(key);
      if (result.success) {
        await loadCommittees();
        alert('✅ Committee deleted successfully!');
      } else {
        setError(result.error || 'Failed to delete committee');
        alert(result.error || 'Failed to delete committee');
      }
    } catch (error) {
      console.error('Failed to delete committee:', error);
      setError('Failed to delete committee. Please try again.');
      alert('Failed to delete committee. Please try again.');
    } finally {
      setDeletingKey(null);
    }
  };

  const openEditModal = (committee: BaseCommittee) => {
    setEditingCommittee(committee);
    setFormData({
      key: committee.key,
      name: committee.name,
      description: committee.description || '',
    });
    setError('');
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingCommittee(null);
    setFormData({ key: '', name: '', description: '' });
    setError('');
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
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading committee management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      {/* Header */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/superadmin')}
              className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <svg
                className="w-5 h-5 text-white"
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
            <div className="flex items-center justify-center">
              <Image
                src="/klo2.svg"
                alt="MegaPlay"
                width={55}
                height={55}
                className="drop-shadow-2xl"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
                Base Committee Management
              </h1>
              <p className="text-xs text-emerald-400 font-medium">
                SuperAdmin • Central Committee Templates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3 text-sm bg-white/5 px-4 py-2 rounded-2xl backdrop-blur-sm border border-white/10">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold text-xs shadow-lg">
                  {user.displayName?.charAt(0)?.toUpperCase() || 'S'}
                </div>
                <span className="text-white/90 font-medium max-w-[200px] truncate">
                  {user.displayName || user.email}
                </span>
                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-medium">
                  SUPERADMIN
                </span>
              </div>
            )}

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="group relative px-6 py-2.5 rounded-2xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-100 hover:text-red-50 font-medium text-sm transition-all duration-300 flex items-center gap-2 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:-translate-y-0.5 disabled:opacity-50"
            >
              {isLoggingOut ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Logging out...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                  </svg>
                  Logout
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Header Section */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent mb-2">
                Committee Templates
              </h2>
              <p className="text-white/70">
                Manage centralized committee definitions used across all academic years
              </p>
              <div className="mt-4 flex items-center gap-4">
                <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl">
                  <span className="text-emerald-300 font-semibold text-lg">{committees.length}</span>
                  <span className="text-emerald-300/70 text-sm ml-2">Total Committees</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-4 px-8 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 flex items-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Committee Template
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && !showAddModal && !editingCommittee && (
          <div className="bg-red-500/10 border border-red-400/20 rounded-2xl p-4 mb-6">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        {/* Committees Grid */}
        {committees.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-16 text-center shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Committee Templates Yet</h3>
            <p className="text-white/60 mb-6">Create your first committee template to get started</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 rounded-2xl font-medium transition-all"
            >
              Add First Committee
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {committees.map((committee) => (
              <div
                key={committee.key}
                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl hover:bg-white/10 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-1 group-hover:text-emerald-300 transition-colors">
                      {committee.name}
                    </h3>
                    <p className="text-xs font-mono text-white/50">
                      key: {committee.key}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                </div>

                {committee.description && (
                  <p className="text-sm text-white/70 mb-4 line-clamp-2">
                    {committee.description}
                  </p>
                )}

                {!committee.description && (
                  <p className="text-sm text-white/40 italic mb-4">
                    No description provided
                  </p>
                )}

                <div className="flex gap-2 pt-4 border-t border-white/10">
                  <button
                    onClick={() => openEditModal(committee)}
                    className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-100 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(committee.key, committee.name)}
                    disabled={deletingKey === committee.key}
                    className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-100 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {deletingKey === committee.key ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      {(showAddModal || editingCommittee) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl max-w-2xl w-full shadow-2xl">
            <div className="p-8 border-b border-white/10">
              <h2 className="text-3xl font-bold text-white mb-2">
                {editingCommittee ? 'Edit Committee Template' : 'Add Committee Template'}
              </h2>
              <p className="text-white/70">
                {editingCommittee 
                  ? 'Update the committee information below'
                  : 'Create a new committee template that will be available across all years'}
              </p>
            </div>

            <form onSubmit={editingCommittee ? handleUpdate : handleAdd} className="p-8 space-y-6">
              {!editingCommittee && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Committee Key (ID) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.key}
                    onChange={(e) => {
                      setFormData({ ...formData, key: e.target.value.toLowerCase() });
                      setError('');
                    }}
                    placeholder="e.g., photography, dance, music"
                    className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    required
                    disabled={submitting}
                  />
                  <p className="text-xs text-white/50 mt-2">
                    Lowercase only, use underscores instead of spaces. This cannot be changed later.
                  </p>
                </div>
              )}

              {editingCommittee && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-sm text-white/60 mb-1">Committee Key (cannot be changed)</p>
                  <p className="text-white font-mono font-semibold">{formData.key}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Committee Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    setError('');
                  }}
                  placeholder="e.g., Photography Committee"
                  className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the committee..."
                  rows={3}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  disabled={submitting}
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-400/20 rounded-2xl p-4">
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl font-medium transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.name.trim() || (!editingCommittee && !formData.key.trim())}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
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
    </div>
  );
}
