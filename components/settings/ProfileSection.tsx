'use client';

import { useState, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { User, Save, Camera, Loader2 } from 'lucide-react';
import { firstLastFromUserMetadata } from '@/lib/userDisplayName';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export default function ProfileSection({
  firstName,
  lastName,
  setFirstName,
  setLastName,
  accountDisplayName,
}: {
  firstName: string;
  lastName: string;
  setFirstName: Dispatch<SetStateAction<string>>;
  setLastName: Dispatch<SetStateAction<string>>;
  accountDisplayName: string;
}) {
  const { user, refreshUser, profileImageUrl, setProfileImageUrl } = useAuth();
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

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

  // Sync profile name fields when auth metadata changes
  useEffect(() => {
    if (!user) return;
    if (profileLoading) return;
    const { firstName: fn, lastName: ln } = firstLastFromUserMetadata(user.user_metadata);
    setFirstName((prev) => (prev === fn ? prev : fn));
    setLastName((prev) => (prev === ln ? prev : ln));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, profileMetadataKey, user]);

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

  return (
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
  );
}
