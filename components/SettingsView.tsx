'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import * as Switch from '@radix-ui/react-switch';
import { User, Lock, Trash2, Save, AlertTriangle, RefreshCw, Tag, Plus, X, Bell, MessageCircle, Phone, MapPin, Map, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { InterestGrid, INTEREST_CATEGORIES } from '@/components/InterestTagging';
import type { NotificationPreferences } from '@/lib/notifications/preferences';

interface SettingsViewProps {
  notificationPreferences: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<{ success: boolean; error?: string }>;
}

export default function SettingsView({
  notificationPreferences,
  onSaveNotificationPreferences,
}: SettingsViewProps) {
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
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState({ type: '', text: '' });
  const [browserPermission, setBrowserPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('unsupported');

  const [locationPrefs, setLocationPrefs] = useState({
    location_connection_snap_enabled: false,
    location_show_on_map_enabled: false,
    location_include_in_insights_enabled: false,
  });
  const [locationPrefsLoading, setLocationPrefsLoading] = useState(false);
  const [locationPrefsMessage, setLocationPrefsMessage] = useState({ type: '', text: '' });

  const browserNotificationsSupported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (!browserNotificationsSupported) {
      setBrowserPermission('unsupported');
      return;
    }

    setBrowserPermission(Notification.permission);
  }, [browserNotificationsSupported]);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from('users')
      .select('location_connection_snap_enabled, location_show_on_map_enabled, location_include_in_insights_enabled')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setLocationPrefs({
            location_connection_snap_enabled: data.location_connection_snap_enabled ?? false,
            location_show_on_map_enabled: data.location_show_on_map_enabled ?? false,
            location_include_in_insights_enabled: data.location_include_in_insights_enabled ?? false,
          });
        }
      });
  }, [user?.id]);

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

  const requestBrowserPermission = async () => {
    if (!browserNotificationsSupported) {
      setNotificationMessage({ type: 'warning', text: 'Browser notifications are not supported in this browser.' });
      return 'unsupported' as const;
    }

    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
    return permission;
  };

  const handleNotificationToggle = async (
    key: keyof NotificationPreferences,
    enabled: boolean,
  ) => {
    let permissionState = browserPermission;
    if (enabled && permissionState === 'default') {
      permissionState = await requestBrowserPermission();
    }

    setNotificationLoading(true);
    const nextPreferences = {
      ...notificationPreferences,
      [key]: enabled,
    };

    const result = await onSaveNotificationPreferences(nextPreferences);
    setNotificationLoading(false);

    if (!result.success) {
      setNotificationMessage({ type: 'error', text: result.error || 'Could not save notification preferences.' });
      return;
    }

    if (enabled && permissionState === 'denied') {
      setNotificationMessage({
        type: 'warning',
        text: 'Preference saved, but browser notifications are blocked. Enable notifications for this site in your browser settings to receive alerts.',
      });
      return;
    }

    if (enabled && permissionState === 'unsupported') {
      setNotificationMessage({
        type: 'warning',
        text: 'Preference saved, but this browser does not support system notifications.',
      });
      return;
    }

    setNotificationMessage({ type: 'success', text: 'Notification preferences updated.' });
  };

  const permissionLabel =
    browserPermission === 'granted'
      ? 'Allowed'
      : browserPermission === 'denied'
        ? 'Blocked'
        : browserPermission === 'default'
          ? 'Not requested'
          : 'Unsupported';

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

      <div className="glass p-8 rounded-3xl border border-zinc-800">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center">
            <Bell className="w-6 h-6 text-[#8338EC]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Notifications</h3>
            <p className="text-zinc-400 text-sm">Control browser alerts for messages and incoming calls.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Browser permission</p>
              <p className="mt-1 text-xs text-zinc-500">Current status for system notifications in this browser.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                browserPermission === 'granted'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : browserPermission === 'denied'
                    ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}>
                {permissionLabel}
              </span>
              {browserNotificationsSupported && browserPermission !== 'granted' ? (
                <button
                  onClick={() => { void requestBrowserPermission(); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Request
                </button>
              ) : null}
            </div>
          </div>

          <NotificationToggleRow
            icon={<MessageCircle className="w-4 h-4 text-[#8338EC]" />}
            title="Chat push notifications"
            description="Show browser alerts for new messages when you are outside that conversation or the tab is in the background."
            checked={notificationPreferences.messagePushEnabled}
            disabled={notificationLoading}
            onChange={(checked) => { void handleNotificationToggle('messagePushEnabled', checked); }}
          />

          <NotificationToggleRow
            icon={<Phone className="w-4 h-4 text-[#3A86FF]" />}
            title="Incoming call alerts"
            description="Show browser alerts for incoming calls when the dashboard is not frontmost."
            checked={notificationPreferences.callPushEnabled}
            disabled={notificationLoading}
            onChange={(checked) => { void handleNotificationToggle('callPushEnabled', checked); }}
          />
        </div>

        {notificationMessage.text && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${notificationMessage.type === 'error'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : notificationMessage.type === 'warning'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                : 'bg-green-500/10 text-green-400 border border-green-500/20'
            }`}>
            {notificationMessage.text}
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          Browser alerts work while this dashboard is open in the browser. Closed-tab web push is not configured here.
        </p>
      </div>

      {/* Your Data — location privacy */}
      <div className="glass p-8 rounded-3xl border border-zinc-800">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#8338EC]/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-[#8338EC]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Your Data</h3>
            <p className="text-zinc-400 text-sm">Location stays off by default. Turn on only what you want to use. Ghost mode (on mobile) overrides these when active.</p>
          </div>
        </div>

        <div className="space-y-4">
          <LocationPrefToggleRow
            icon={<MapPin className="w-4 h-4 text-[#8338EC]" />}
            title="Connection location snap"
            description="Records GPS at the moment you tap (not continuous tracking)"
            checked={locationPrefs.location_connection_snap_enabled}
            disabled={locationPrefsLoading}
            onChange={async (checked) => {
              setLocationPrefsLoading(true);
              setLocationPrefsMessage({ type: '', text: '' });
              const next = { ...locationPrefs, location_connection_snap_enabled: checked };
              setLocationPrefs(next);
              const supabase = getSupabaseClient();
              if (supabase && user?.id) {
                const { error } = await supabase.from('users').update({ location_connection_snap_enabled: checked }).eq('id', user.id);
                if (error) setLocationPrefsMessage({ type: 'error', text: error.message });
                else setLocationPrefsMessage({ type: 'success', text: 'Saved.' });
              }
              setLocationPrefsLoading(false);
            }}
          />
          <LocationPrefToggleRow
            icon={<Map className="w-4 h-4 text-[#8338EC]" />}
            title="Show on my Memory Map"
            description="Personal only — never shared with others"
            checked={locationPrefs.location_show_on_map_enabled}
            disabled={locationPrefsLoading}
            onChange={async (checked) => {
              setLocationPrefsLoading(true);
              setLocationPrefsMessage({ type: '', text: '' });
              const next = { ...locationPrefs, location_show_on_map_enabled: checked };
              setLocationPrefs(next);
              const supabase = getSupabaseClient();
              if (supabase && user?.id) {
                const { error } = await supabase.from('users').update({ location_show_on_map_enabled: checked }).eq('id', user.id);
                if (error) setLocationPrefsMessage({ type: 'error', text: error.message });
                else setLocationPrefsMessage({ type: 'success', text: 'Saved.' });
              }
              setLocationPrefsLoading(false);
            }}
          />
          <LocationPrefToggleRow
            icon={<Shield className="w-4 h-4 text-[#8338EC]" />}
            title="Include in business insights"
            description="Anonymized — campuses/venues see trends, no personal data"
            checked={locationPrefs.location_include_in_insights_enabled}
            disabled={locationPrefsLoading}
            onChange={async (checked) => {
              setLocationPrefsLoading(true);
              setLocationPrefsMessage({ type: '', text: '' });
              const next = { ...locationPrefs, location_include_in_insights_enabled: checked };
              setLocationPrefs(next);
              const supabase = getSupabaseClient();
              if (supabase && user?.id) {
                const { error } = await supabase.from('users').update({ location_include_in_insights_enabled: checked }).eq('id', user.id);
                if (error) setLocationPrefsMessage({ type: 'error', text: error.message });
                else setLocationPrefsMessage({ type: 'success', text: 'Saved.' });
              }
              setLocationPrefsLoading(false);
            }}
          />
        </div>

        {locationPrefsMessage.text && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${locationPrefsMessage.type === 'error'
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-green-500/10 text-green-400 border border-green-500/20'
          }`}>
            {locationPrefsMessage.text}
          </div>
        )}
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

function LocationPrefToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 border border-white/5">
            {icon}
          </span>
          <span>{title}</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>
      <div className="flex shrink-0 justify-end">
        <Switch.Root
          checked={checked}
          onCheckedChange={(c) => { void onChange(c); }}
          disabled={disabled}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-zinc-700 bg-zinc-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8338EC] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 data-[state=checked]:border-[#8338EC]/50 data-[state=checked]:bg-[#8338EC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Switch.Thumb
            className="absolute left-0.5 top-1/2 h-5 w-5 shrink-0 rounded-full bg-white shadow block transition-[transform] duration-200 ease-out"
            style={{ transform: checked ? 'translate(20px, -50%)' : 'translate(0, -50%)' }}
          />
        </Switch.Root>
      </div>
    </div>
  );
}

function NotificationToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 border border-white/5">
            {icon}
          </span>
          <span>{title}</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>

      <div className="flex shrink-0 justify-end">
        <Switch.Root
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-zinc-700 bg-zinc-900 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8338EC] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 data-[state=checked]:border-[#8338EC]/50 data-[state=checked]:bg-[#8338EC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Switch.Thumb
            className="absolute left-0.5 top-1/2 h-5 w-5 shrink-0 rounded-full bg-white shadow block transition-[transform] duration-200 ease-out"
            style={{
              transform: checked ? 'translate(20px, -50%)' : 'translate(0, -50%)',
            }}
          />
        </Switch.Root>
      </div>
    </div>
  );
}
