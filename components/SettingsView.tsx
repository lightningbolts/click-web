'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { motion } from 'framer-motion';
import * as Switch from '@radix-ui/react-switch';
import { User, Lock, Trash2, Save, AlertTriangle, RefreshCw, Tag, Plus, X, Bell, MessageCircle, Phone, MapPin, Map, Shield, Camera, Loader2, Calendar, Users, Radio, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { InterestGrid, INTEREST_CATEGORIES } from '@/components/InterestTagging';
import {
  PERSONALITY_REQUIRED_TAG_COUNT,
  PERSONALITY_TRAITS,
  canonicalizePersonalityTags,
} from '@/lib/personality/taxonomy';
import type { NotificationPreferences } from '@/lib/notifications/preferences';
import { displayNameFromUserMetadata, firstLastFromUserMetadata } from '@/lib/userDisplayName';

interface SettingsViewProps {
  notificationPreferences: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<{ success: boolean; error?: string }>;
}

export default function SettingsView({
  notificationPreferences,
  onSaveNotificationPreferences,
}: SettingsViewProps) {
  const { user, signOut, refreshUser, profileImageUrl, setProfileImageUrl } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
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
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);
  const [personalityDirty, setPersonalityDirty] = useState(false);
  const [personalityLoading, setPersonalityLoading] = useState(false);
  const [personalityMessage, setPersonalityMessage] = useState({ type: '', text: '' });
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState({ type: '', text: '' });
  const [browserPermission, setBrowserPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('unsupported');

  const [locationPrefs, setLocationPrefs] = useState({
    location_connection_snap_enabled: true,
    location_show_on_map_enabled: true,
    location_include_in_insights_enabled: true,
  });
  const [locationPrefsLoading, setLocationPrefsLoading] = useState(false);
  const [locationPrefsMessage, setLocationPrefsMessage] = useState({ type: '', text: '' });

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const browserNotificationsSupported = typeof window !== 'undefined' && 'Notification' in window;

  const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

  const accountDisplayName = useMemo(
    () => (displayNameFromUserMetadata(user?.user_metadata) || '').trim(),
    [user?.user_metadata],
  );

  /** Combined display string from the profile form fields, or saved metadata. */
  const profileFormDisplayName = useMemo(
    () =>
      [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' ').trim() ||
      accountDisplayName,
    [firstName, lastName, accountDisplayName],
  );

  const profileMetadataKey = useMemo(() => {
    const m = user?.user_metadata as Record<string, unknown> | undefined;
    if (!m) return '';
    return JSON.stringify({
      first_name: m.first_name,
      last_name: m.last_name,
      full_name: m.full_name,
      name: m.name,
    });
  }, [user?.user_metadata]);

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
            location_connection_snap_enabled: data.location_connection_snap_enabled ?? true,
            location_show_on_map_enabled: data.location_show_on_map_enabled ?? true,
            location_include_in_insights_enabled: data.location_include_in_insights_enabled ?? true,
          });
        }
      });
  }, [user?.id]);

  // Sync profile name fields when auth metadata changes
  useEffect(() => {
    if (!user) return;
    if (profileLoading) return;
    const { firstName: fn, lastName: ln } = firstLastFromUserMetadata(user.user_metadata);
    setFirstName((prev) => (prev === fn ? prev : fn));
    setLastName((prev) => (prev === ln ? prev : ln));
  }, [profileLoading, profileMetadataKey, user]);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_interests')
        .select('tags')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) return;
      if (data?.tags && Array.isArray(data.tags)) {
        setTags(data.tags);
      } else {
        setTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('personality_tags')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) return;
      const loaded = Array.isArray(data?.personality_tags)
        ? canonicalizePersonalityTags(data.personality_tags as string[])
        : [];
      setPersonalityTags(loaded);
      setPersonalityDirty(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
      const { data: prior, error: priorErr } = await supabase
        .from('user_interests')
        .select('tags')
        .eq('user_id', user.id)
        .maybeSingle();
      if (priorErr) {
        setTagsMessage({ type: 'error', text: priorErr.message });
        return;
      }
      const previousTags = prior?.tags && Array.isArray(prior.tags) ? prior.tags : [];

      const existingHistory = user.user_metadata?.interest_history || [];
      const historyEntry = {
        previous: previousTags,
        updated: tags,
        at: new Date().toISOString(),
      };
      const interest_history = [...existingHistory, historyEntry].slice(-50);

      const updatedAt = Date.now();
      const { error: rowErr } = await supabase.from('user_interests').upsert(
        { user_id: user.id, tags, updated_at: updatedAt },
        { onConflict: 'user_id' },
      );

      if (rowErr) {
        setTagsMessage({ type: 'error', text: rowErr.message });
        return;
      }

      const { error: authErr } = await supabase.auth.updateUser({
        data: { interest_history },
      });

      if (authErr) {
        setTagsMessage({ type: 'error', text: authErr.message });
      } else {
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

  const togglePersonality = (trait: string) => {
    setPersonalityTags((prev) => {
      const canonical = canonicalizePersonalityTags(prev);
      const next = canonical.includes(trait)
        ? canonical.filter((t) => t !== trait)
        : canonical.length < PERSONALITY_REQUIRED_TAG_COUNT
          ? [...canonical, trait]
          : canonical;
      setPersonalityDirty(true);
      return next;
    });
  };

  const handleSavePersonality = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;
    const toSave = canonicalizePersonalityTags(personalityTags);
    if (toSave.length !== PERSONALITY_REQUIRED_TAG_COUNT) {
      setPersonalityMessage({
        type: 'error',
        text: `Pick exactly ${PERSONALITY_REQUIRED_TAG_COUNT} traits.`,
      });
      return;
    }
    setPersonalityLoading(true);
    setPersonalityMessage({ type: '', text: '' });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setPersonalityMessage({ type: 'error', text: 'Session expired. Sign in again.' });
        return;
      }
      const res = await fetch(`/api/users/${user.id}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ personality_tags: toSave }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPersonalityMessage({
          type: 'error',
          text: typeof body.error === 'string' ? body.error : 'Could not save personality traits.',
        });
        return;
      }
      setPersonalityTags(toSave);
      setPersonalityDirty(false);
      setPersonalityMessage({ type: 'success', text: `Saved ${PERSONALITY_REQUIRED_TAG_COUNT} personality traits.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      setPersonalityMessage({ type: 'error', text: message });
    } finally {
      setPersonalityLoading(false);
    }
  };

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      setProfileMessage({ type: 'error', text: 'Please choose an image file.' });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setProfileMessage({ type: 'error', text: 'Image must be under 2 MB.' });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setProfileMessage({ type: 'error', text: 'Supabase client not initialized' });
      return;
    }

    const previousImage = profileImageUrl;
    const objectPath = `${user.id}/${Date.now()}.png`;

    setAvatarUploading(true);
    setProfileMessage({ type: '', text: '' });

    try {
      const { error: uploadError } = await supabase.storage.from('avatars').upload(objectPath, file, {
        upsert: true,
        contentType: file.type || 'image/png',
      });
      if (uploadError) {
        setProfileMessage({ type: 'error', text: uploadError.message });
        return;
      }

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(objectPath);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) {
        setProfileMessage({ type: 'error', text: 'Could not resolve public URL for avatar.' });
        return;
      }

      setProfileImageUrl(publicUrl);

      const { error: dbError } = await supabase.from('users').update({ image: publicUrl }).eq('id', user.id);
      if (dbError) {
        setProfileImageUrl(previousImage ?? null);
        setProfileMessage({ type: 'error', text: dbError.message });
        return;
      }

      await refreshUser();
      setProfileMessage({ type: 'success', text: 'Profile photo updated.' });
    } catch (err: unknown) {
      setProfileImageUrl(previousImage ?? null);
      const message = err instanceof Error ? err.message : 'Upload failed';
      setProfileMessage({ type: 'error', text: message });
    } finally {
      setAvatarUploading(false);
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
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn) {
        setProfileMessage({ type: 'error', text: 'First name is required.' });
        setProfileLoading(false);
        return;
      }
      const full_name = [fn, ln].filter(Boolean).join(' ').trim();
      const { data, error } = await supabase.auth.updateUser({
        data: {
          first_name: fn,
          last_name: ln,
          full_name,
          name: full_name,
        },
      });

      if (error) {
        setProfileMessage({ type: 'error', text: error.message });
      } else {
        await refreshUser();
        setProfileMessage({ type: 'success', text: `Profile updated to ${full_name}!` });
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
    const expectedFullName = profileFormDisplayName.trim();
    if (!expectedFullName) {
      setDeleteError('Set your name in Profile Settings before deleting your account.');
      return;
    }
    if (deleteConfirmName.trim() !== expectedFullName) {
      setDeleteError('Name does not match. Type your first and last name exactly as shown to confirm deletion.');
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
      <h2 className="mb-6 text-3xl font-bold text-on-surface">Settings</h2>

      {/* Profile Settings */}
      <div className="fc-card border border-border-hard p-8">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-border-hard bg-on-primary-container">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Profile Settings</h3>
            <p className="text-on-surface-variant text-sm">Update your personal information</p>
          </div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <input
            ref={avatarFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleAvatarFileSelected}
          />
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <button
                type="button"
                disabled={avatarUploading}
                onClick={() => avatarFileInputRef.current?.click()}
                className="relative h-20 w-20 rounded-2xl border border-border-hard bg-surface overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                aria-label="Change profile photo"
              >
                {profileImageUrl ? (
                  <img src={profileImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#630ed4] to-purple-600 text-lg font-bold text-on-surface">
                    {(accountDisplayName || user?.email || 'U').trim().slice(0, 2).toUpperCase() || 'U'}
                  </div>
                )}
                <span
                  className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
                    avatarUploading ? 'opacity-100' : 'opacity-0 hover:opacity-100'
                  }`}
                >
                  {avatarUploading ? (
                    <Loader2 className="h-7 w-7 text-on-surface animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-7 w-7 text-on-surface" aria-hidden />
                  )}
                </span>
              </button>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-on-surface">Profile photo</p>
              <p className="text-xs text-on-surface-variant mt-1">JPG or PNG, max 2 MB. Opens your photo library.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-first-name" className="block text-sm font-medium mb-2">
                First name
              </label>
              <input
                id="settings-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
                className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors"
                placeholder="First name"
              />
            </div>
            <div>
              <label htmlFor="settings-last-name" className="block text-sm font-medium mb-2">
                Last name
              </label>
              <input
                id="settings-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors"
                placeholder="Last name"
              />
            </div>
          </div>

          {profileMessage.text && (
            <div className={`p-3 rounded-xl text-sm ${profileMessage.type === 'error'
                ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
                : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
              }`}>
              {profileMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={profileLoading}
            className="flex items-center gap-2 px-6 py-3 bg-[#630ed4] hover:bg-[#732ee4] rounded-xl font-semibold transition-colors disabled:opacity-50"
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
      <div className="fc-card p-8 rounded-[16px] border border-border-hard">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-[#630ed4]/10 flex items-center justify-center">
            <Tag className="w-6 h-6 text-[#630ed4]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">My Interests</h3>
            <p className="text-on-surface-variant text-sm">
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
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#630ed4]/15 border border-[#630ed4]/30 text-[#630ed4]"
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
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">Custom interests</p>
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
              className="flex-1 rounded-lg border border-border-hard bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
            />
            <button
              onClick={addCustomInterest}
              disabled={customInterestInput.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[#630ed4]/40 px-3 py-2 text-sm text-primary hover:bg-[#630ed4]/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          {customSelectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customSelectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#3A86FF]/35 bg-[#3A86FF]/10 px-2 py-1 text-xs text-primary"
                >
                  {tag}
                  <button
                    onClick={() => removeCustomInterest(tag)}
                    className="rounded p-0.5 hover:bg-surface-container"
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
              ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
              : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
            }`}>
            {tagsMessage.text}
          </div>
        )}

        <button
          onClick={handleSaveTags}
          disabled={tagsLoading || !tagsDirty}
          className="mt-4 flex items-center gap-2 px-6 py-3 bg-[#630ed4] hover:bg-[#732ee4] rounded-xl font-semibold transition-colors disabled:opacity-50"
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

      <div className="fc-card p-8 rounded-[16px] border border-border-hard">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#630ed4]/10 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-[#630ed4]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Personality</h3>
            <p className="text-on-surface-variant text-sm">
              Pick exactly {PERSONALITY_REQUIRED_TAG_COUNT} traits.
            </p>
          </div>
        </div>
        <p className="mb-3 text-xs text-on-surface-variant">
          {personalityTags.length} of {PERSONALITY_REQUIRED_TAG_COUNT} selected
        </p>
        <div className="flex flex-wrap gap-2">
          {PERSONALITY_TRAITS.map((trait) => {
            const selected = personalityTags.includes(trait);
            const disabled = !selected && personalityTags.length >= PERSONALITY_REQUIRED_TAG_COUNT;
            return (
              <button
                key={trait}
                type="button"
                disabled={disabled}
                onClick={() => togglePersonality(trait)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  selected
                    ? 'border-[#630ed4] bg-[#630ed4]/15 text-[#630ed4]'
                    : 'border-border-hard text-on-surface hover:bg-surface-container disabled:opacity-40'
                }`}
              >
                {trait}
              </button>
            );
          })}
        </div>
        {personalityMessage.text && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${personalityMessage.type === 'error'
              ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
              : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
            }`}>
            {personalityMessage.text}
          </div>
        )}
        <button
          onClick={() => { void handleSavePersonality(); }}
          disabled={personalityLoading || !personalityDirty || personalityTags.length !== PERSONALITY_REQUIRED_TAG_COUNT}
          className="mt-4 flex items-center gap-2 px-6 py-3 bg-[#630ed4] hover:bg-[#732ee4] rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          {personalityLoading ? 'Saving...' : (
            <>
              <Save className="w-4 h-4" />
              {personalityDirty ? 'Save personality' : 'Saved'}
            </>
          )}
        </button>
      </div>

      <div className="fc-card p-8 rounded-[16px] border border-border-hard">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#630ed4]/10 flex items-center justify-center">
            <Bell className="w-6 h-6 text-[#630ed4]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Notifications</h3>
            <p className="text-on-surface-variant text-sm">Control browser alerts for messages and incoming calls.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-border-hard bg-surface-container px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-on-surface">Browser permission</p>
              <p className="mt-1 text-xs text-on-surface-variant">Current status for system notifications in this browser.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                browserPermission === 'granted'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                  : browserPermission === 'denied'
                    ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
                    : 'bg-surface-container text-on-surface-variant border border-border-hard'
              }`}>
                {permissionLabel}
              </span>
              {browserNotificationsSupported && browserPermission !== 'granted' ? (
                <button
                  onClick={() => { void requestBrowserPermission(); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-border-hard px-3 py-2 text-xs text-on-surface hover:bg-surface-container"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Request
                </button>
              ) : null}
            </div>
          </div>

          <NotificationToggleRow
            icon={<MessageCircle className="w-4 h-4 text-[#630ed4]" />}
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

          <NotificationToggleRow
            icon={<Calendar className="w-4 h-4 text-[#630ed4]" />}
            title="Event reminders"
            description="Day-of and 30-minutes-before alerts for events you created."
            checked={notificationPreferences.eventReminderPushEnabled}
            disabled={notificationLoading}
            onChange={(checked) => { void handleNotificationToggle('eventReminderPushEnabled', checked); }}
          />

          <NotificationToggleRow
            icon={<Users className="w-4 h-4 text-[#630ed4]" />}
            title="Availability matches"
            description="When a connection posts a matching intent and overlapping timeframe."
            checked={notificationPreferences.availabilityMatchPushEnabled}
            disabled={notificationLoading}
            onChange={(checked) => { void handleNotificationToggle('availabilityMatchPushEnabled', checked); }}
          />

          <NotificationToggleRow
            icon={<Radio className="w-4 h-4 text-[#630ed4]" />}
            title="Hub messages"
            description="Community hub chat alerts when you are a participant."
            checked={notificationPreferences.hubMessagePushEnabled}
            disabled={notificationLoading}
            onChange={(checked) => { void handleNotificationToggle('hubMessagePushEnabled', checked); }}
          />
        </div>

        {notificationMessage.text && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${notificationMessage.type === 'error'
              ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
              : notificationMessage.type === 'warning'
                ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20'
                : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
            }`}>
            {notificationMessage.text}
          </div>
        )}

        <p className="mt-4 text-xs text-on-surface-variant">
          Browser alerts work while this dashboard is open in the browser. Closed-tab web push is not configured here.
        </p>
      </div>

      {/* Your Data: location privacy */}
      <div className="fc-card p-8 rounded-[16px] border border-border-hard">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#630ed4]/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-[#630ed4]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Your Data</h3>
            <p className="text-on-surface-variant text-sm">Location is enabled by default so your map and anonymous trends work right away. Turn off anything you do not want. Ghost mode (on mobile) overrides these when active.</p>
          </div>
        </div>

        <div className="space-y-4">
          <LocationPrefToggleRow
            icon={<MapPin className="w-4 h-4 text-[#630ed4]" />}
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
            icon={<Map className="w-4 h-4 text-[#630ed4]" />}
            title="Show on my Memory Map"
            description="Personal only, never shared with others"
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
            icon={<Shield className="w-4 h-4 text-[#630ed4]" />}
            title="Include in business insights"
            description="Anonymous venue/campus trends are on by default. Turn this off if you do not want to be included."
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
            ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
            : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
          }`}>
            {locationPrefsMessage.text}
          </div>
        )}
      </div>

      {/* Security Settings */}
      <div className="fc-card p-8 rounded-[16px] border border-border-hard">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#630ed4]/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[#630ed4]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Security</h3>
            <p className="text-on-surface-variant text-sm">Update your password</p>
          </div>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors"
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
              className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-primary transition-colors"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          {passwordMessage.text && (
            <div className={`p-3 rounded-xl text-sm ${passwordMessage.type === 'error'
                ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
                : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
              }`}>
              {passwordMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={passwordLoading}
            className="flex items-center gap-2 px-6 py-3 bg-[#630ed4] hover:bg-[#732ee4] rounded-xl font-semibold transition-colors disabled:opacity-50"
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
      <div className="fc-card p-8 rounded-[16px] border border-red-900/30">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-red-500">Danger Zone</h3>
            <p className="text-on-surface-variant text-sm">Irreversible account actions</p>
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
            <p className="text-on-surface-variant text-sm mb-4">
              This action cannot be undone. This will permanently delete your account and remove your data from our servers.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-on-surface">
                Type your name to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => {
                  setDeleteConfirmName(e.target.value);
                  if (deleteError) setDeleteError('');
                }}
                placeholder={profileFormDisplayName.trim() || 'Set your name in Profile Settings first'}
                className="w-full px-4 py-3 bg-surface border border-border-hard rounded-xl focus:outline-none focus:border-red-500/70 transition-colors"
                disabled={deleteLoading}
              />
              {profileFormDisplayName.trim() && (
                <p className="text-xs text-on-surface-variant mt-2">
                  Must match exactly: {profileFormDisplayName.trim()}
                </p>
              )}
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={
                  deleteLoading ||
                  !profileFormDisplayName.trim() ||
                  deleteConfirmName.trim() !== profileFormDisplayName.trim()
                }
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-on-surface rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                className="px-6 py-3 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl font-semibold transition-colors"
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
    <div className="flex flex-col gap-4 rounded-2xl border border-border-hard bg-surface-container px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface border border-white/5">
            {icon}
          </span>
          <span>{title}</span>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
      </div>
      <div className="flex shrink-0 justify-end">
        <Switch.Root
          checked={checked}
          onCheckedChange={(c) => { void onChange(c); }}
          disabled={disabled}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border-hard bg-surface-container outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="flex flex-col gap-4 rounded-2xl border border-border-hard bg-surface-container px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface border border-white/5">
            {icon}
          </span>
          <span>{title}</span>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
      </div>

      <div className="flex shrink-0 justify-end">
        <Switch.Root
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border-hard bg-surface-container outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
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
