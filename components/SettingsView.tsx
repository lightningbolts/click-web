'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { User, Lock, Trash2, Save, AlertTriangle, RefreshCw, Tag, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { InterestGrid, INTEREST_CATEGORIES } from '@/components/InterestTagging';

export default function SettingsView() {
  const { user, signOut, refreshUser } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });
  const [deleteError, setDeleteError] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  // Interest tags state
  const [tags, setTags] = useState<string[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsMessage, setTagsMessage] = useState({ type: '', text: '' });
  const [tagsDirty, setTagsDirty] = useState(false);
  const [customInterestInput, setCustomInterestInput] = useState('');

  // Reset initialization when user changes
  useEffect(() => {
    if (user) {
      const currentName = user.user_metadata?.full_name || '';
      if (!profileLoading && currentName !== fullName) {
        setFullName(currentName);
      }
      // Load tags from user_metadata
      const metaTags = user.user_metadata?.tags;
      if (metaTags && Array.isArray(metaTags)) {
        setTags(metaTags);
      }
      setIsInitialized(true);
    }
  }, [user?.user_metadata?.full_name, user?.user_metadata?.tags]);

  const toggleTag = (tag: string) => {
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    setTags(next);
    setTagsDirty(true);
  };

  const addCustomInterest = () => {
    const raw = customInterestInput.trim();
    if (!raw) return;
    const exists = tags.some((t) => t.toLowerCase() === raw.toLowerCase());
    if (!exists) {
      setTags([...tags, raw]);
      setTagsDirty(true);
    }
    setCustomInterestInput('');
  };

  const removeCustomInterest = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    setTagsDirty(true);
  };

  const predefinedTags = new Set(
    INTEREST_CATEGORIES.flatMap((category) => [category.label, ...category.subs]).map((t) => t.toLowerCase())
  );
  const customSelectedTags = tags.filter((tag) => !predefinedTags.has(tag.toLowerCase()));

  const handleSaveTags = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;

    setTagsLoading(true);
    setTagsMessage({ type: '', text: '' });

    try {
      // Build interest history log (tracks changes over time)
      const existingHistory = user.user_metadata?.interest_history || [];
      const historyEntry = {
        previous: user.user_metadata?.tags || [],
        updated: tags,
        at: new Date().toISOString(),
      };
      const interest_history = [...existingHistory, historyEntry].slice(-50); // Keep last 50 changes

      // Save to user_metadata (primary, always works)
      const { error } = await supabase.auth.updateUser({
        data: { tags, interest_history },
      });

      if (error) {
        setTagsMessage({ type: 'error', text: error.message });
      } else {
        // Best-effort DB save
        try {
          await supabase.from('users').update({ tags }).eq('id', user.id);
        } catch { /* column may not exist */ }

        await refreshUser();
        setTagsDirty(false);
        setTagsMessage({ type: 'success', text: `Saved ${tags.length} interests!` });
      }
    } catch (err: any) {
      setTagsMessage({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setTagsLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMessage({ type: '', text: '' });

    const supabase = getSupabaseClient();
    if (!supabase) {
      setProfileMessage({ type: 'error', text: 'Supabase client not initialized' });
      setProfileLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
        },
      });

      if (error) {
        setProfileMessage({ type: 'error', text: error.message });
      } else {
        await refreshUser();
        setProfileMessage({ type: 'success', text: `Profile updated to "${fullName.trim()}"!` });
        console.log('Profile updated successfully:', data.user?.user_metadata);
      }
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || 'An unexpected error occurred' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage({ type: '', text: '' });

    const supabase = getSupabaseClient();
    if (!supabase) {
      setPasswordMessage({ type: 'error', text: 'Supabase client not initialized' });
      setPasswordLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setPasswordMessage({ type: 'error', text: error.message });
      } else {
        setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'An unexpected error occurred' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const expectedFullName = (fullName || user?.user_metadata?.full_name || '').trim();
    if (!expectedFullName) {
      setDeleteError('Set your full name in Profile Settings before deleting your account.');
      return;
    }
    if (deleteConfirmName.trim() !== expectedFullName) {
      setDeleteError('Full name does not match. Please type your full name exactly to confirm deletion.');
      return;
    }

    setDeleteLoading(true);
    setDeleteError('');

    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      await signOut();
      router.push('/');
    } catch (error: any) {
      setDeleteError(error.message);
      setDeleteLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <h2 className="text-3xl font-bold mb-6">Settings</h2>

      {/* Profile Settings */}
      <div className="glass p-8 rounded-3xl border border-zinc-800">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center">
            <User className="w-6 h-6 text-[#8338EC]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Profile Settings</h3>
            <p className="text-zinc-400 text-sm">Update your personal information</p>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
              placeholder="Your Name"
            />
          </div>

          {profileMessage.text && (
            <div className={`p-3 rounded-xl text-sm ${profileMessage.type === 'error'
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-green-500/10 text-green-400 border border-green-500/20'
              }`}>
              {profileMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={profileLoading}
            className="flex items-center gap-2 px-6 py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            {profileLoading ? (
              'Saving...'
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </form>
      </div>

      {/* My Interests */}
      <div className="glass p-8 rounded-3xl border border-zinc-800">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center">
            <Tag className="w-6 h-6 text-[#8338EC]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">My Interests</h3>
            <p className="text-zinc-400 text-sm">
              Select categories/subcategories and add your own custom interests.
            </p>
          </div>
        </div>

        {/* Current tags summary */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5 mt-4">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#8338EC]/15 border border-[#8338EC]/30 text-[#8338EC]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <InterestGrid
          selected={tags}
          expandedCategory={expandedCategory}
          onToggleTag={toggleTag}
          onToggleExpand={(cat) => setExpandedCategory(expandedCategory === cat ? null : cat)}
          maxTags={undefined}
        />

        <div className="mt-5 space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Custom interests</p>
          <div className="flex gap-2">
            <input
              value={customInterestInput}
              onChange={(e) => setCustomInterestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomInterest();
                }
              }}
              placeholder="Add your own interest"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#8338EC]"
            />
            <button
              onClick={addCustomInterest}
              disabled={customInterestInput.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[#8338EC]/40 px-3 py-2 text-sm text-[#caa8ff] hover:bg-[#8338EC]/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          {customSelectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customSelectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#3A86FF]/35 bg-[#3A86FF]/10 px-2 py-1 text-xs text-[#9bc8ff]"
                >
                  {tag}
                  <button
                    onClick={() => removeCustomInterest(tag)}
                    className="rounded p-0.5 hover:bg-white/10"
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {tagsMessage.text && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${tagsMessage.type === 'error'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-green-500/10 text-green-400 border border-green-500/20'
            }`}>
            {tagsMessage.text}
          </div>
        )}

        <button
          onClick={handleSaveTags}
          disabled={tagsLoading || !tagsDirty}
          className="mt-4 flex items-center gap-2 px-6 py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          {tagsLoading ? (
            'Saving...'
          ) : (
            <>
              <Save className="w-4 h-4" />
              {tagsDirty ? 'Save Interests' : 'Saved'}
            </>
          )}
        </button>
      </div>

      {/* Security Settings */}
      <div className="glass p-8 rounded-3xl border border-zinc-800">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[#8338EC]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Security</h3>
            <p className="text-zinc-400 text-sm">Update your password</p>
          </div>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
              placeholder="••••••••"
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Confirm New Password</label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#8338EC] transition-colors"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          {passwordMessage.text && (
            <div className={`p-3 rounded-xl text-sm ${passwordMessage.type === 'error'
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-green-500/10 text-green-400 border border-green-500/20'
              }`}>
              {passwordMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={passwordLoading}
            className="flex items-center gap-2 px-6 py-3 bg-[#8338EC] hover:bg-[#9d4eff] rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            {passwordLoading ? (
              'Updating...'
            ) : (
              <>
                <Save className="w-4 h-4" />
                Update Password
              </>
            )}
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="glass p-8 rounded-3xl border border-red-900/30">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-red-500">Danger Zone</h3>
            <p className="text-zinc-400 text-sm">Irreversible account actions</p>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => {
              setShowDeleteConfirm(true);
              setDeleteConfirmName('');
              setDeleteError('');
            }}
            className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl font-semibold transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        ) : (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
            <h4 className="font-bold text-red-500 mb-2">Are you absolutely sure?</h4>
            <p className="text-zinc-400 text-sm mb-4">
              This action cannot be undone. This will permanently delete your account and remove your data from our servers.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-zinc-200">
                Type your full name to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => {
                  setDeleteConfirmName(e.target.value);
                  if (deleteError) setDeleteError('');
                }}
                placeholder={(fullName || user?.user_metadata?.full_name || '').trim() || 'Set full name above first'}
                className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700 rounded-xl focus:outline-none focus:border-red-500/70 transition-colors"
                disabled={deleteLoading}
              />
              {(fullName || user?.user_metadata?.full_name || '').trim() && (
                <p className="text-xs text-zinc-500 mt-2">
                  Must match exactly: {(fullName || user?.user_metadata?.full_name || '').trim()}
                </p>
              )}
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !(fullName || user?.user_metadata?.full_name || '').trim() || deleteConfirmName.trim() !== (fullName || user?.user_metadata?.full_name || '').trim()}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
