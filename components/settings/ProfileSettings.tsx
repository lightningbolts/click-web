'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { TextArea, TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { AVATAR_IMAGE_ACCEPT, AVATAR_IMAGE_MIME_TYPES, USER_AVATAR_ENDPOINT } from '@/lib/uploads/constants';
import { useImageUpload } from '@/lib/uploads/useImageUpload';
import type { ProfileSettings as Saved } from '@/lib/server/settings/loadSettings';
import { SettingsSaveBar } from './SettingsSaveBar';

export const PROFILE_BIO_MAX = 160;
const FORM_ID = 'settings-profile-form';

type Draft = Pick<Saved, 'firstName' | 'lastName' | 'bio'> & { birthday: string };

const draftOf = (s: Saved): Draft => ({ firstName: s.firstName, lastName: s.lastName, bio: s.bio, birthday: s.birthday ?? '' });

/** Profile (spec §7.8): photo with Change / Remove, name, bio and birthday. Saves as one form. */
export function ProfileSettings({ userId, initial }: { userId: string; initial: Saved }) {
  const router = useRouter();
  const { refreshUser, setProfileImageUrl } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<Draft>(() => draftOf(initial));
  const [draft, setDraft] = useState<Draft>(saved);
  const [image, setImage] = useState(initial.image);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);

  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k].trim() !== saved[k].trim());
  const name = [draft.firstName, draft.lastName].map((s) => s.trim()).filter(Boolean).join(' ');

  const { uploading, upload } = useImageUpload({
    endpoint: USER_AVATAR_ENDPOINT,
    acceptedMimeTypes: AVATAR_IMAGE_MIME_TYPES,
    onSuccess: (url) => {
      setImage(url);
      setProfileImageUrl(url);
      void refreshUser();
      router.refresh();
      toast.success('Photo updated');
    },
  });

  const removePhoto = async () => {
    const ok = await confirm({
      title: 'Remove your photo?',
      message: 'People will see your initials instead.',
      confirmLabel: 'Remove photo',
      cancelLabel: 'Keep photo',
      destructive: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await authedJson(USER_AVATAR_ENDPOINT, { method: 'DELETE', fallback: 'Couldn’t remove your photo.' });
      setImage(null);
      setProfileImageUrl(null);
      void refreshUser();
      router.refresh();
      toast.success('Photo removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t remove your photo.');
    } finally {
      setRemoving(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = draft.firstName.trim();
    if (!first) {
      setFirstNameError('Add your first name.');
      document.getElementById('settings-first-name')?.focus();
      return;
    }
    setSaving(true);
    try {
      const last = draft.lastName.trim();
      await authedJson(`/api/users/${userId}/profile`, {
        method: 'PATCH',
        body: {
          first_name: first,
          last_name: last,
          bio: draft.bio.trim() || null,
          ...(draft.birthday && draft.birthday !== saved.birthday ? { birthday: draft.birthday } : {}),
        },
        fallback: 'Couldn’t save your profile.',
      });
      // Auth metadata carries the name too (older clients read it from there).
      const full = [first, last].filter(Boolean).join(' ');
      await getSupabaseClient()?.auth.updateUser({ data: { first_name: first, last_name: last, full_name: full, name: full } });
      const next = { ...draft, firstName: first, lastName: last, bio: draft.bio.trim() };
      setSaved(next);
      setDraft(next);
      void refreshUser();
      router.refresh();
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }));
    if (k === 'firstName') setFirstNameError(null);
  };

  return (
    <>
      <section aria-label="Photo" className="flex items-center gap-5">
        <span className="relative">
          <Avatar seed={userId} name={name || null} src={image} size={96} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Change photo"
            className="press absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-action text-on-action ring-[3px] ring-bg disabled:opacity-60"
          >
            <Camera size={16} strokeWidth={2} aria-hidden />
          </button>
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
            Change photo
          </Button>
          {image ? (
            <Button size="sm" variant="plain" className="text-destructive" loading={removing} onClick={() => void removePhoto()}>
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={AVATAR_IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
      </section>

      <form id={FORM_ID} onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="settings-first-name"
            label="First name"
            autoComplete="given-name"
            value={draft.firstName}
            onChange={set('firstName')}
            onBlur={() => setFirstNameError(draft.firstName.trim() ? null : 'Add your first name.')}
            error={firstNameError}
            required
          />
          <TextField label="Last name" autoComplete="family-name" value={draft.lastName} onChange={set('lastName')} />
        </div>
        <TextArea
          label="Bio"
          value={draft.bio}
          onChange={set('bio')}
          maxLength={PROFILE_BIO_MAX}
          rows={3}
          placeholder="A line about you"
          help="Shown on your profile to your Clicks."
          count={`${draft.bio.length}/${PROFILE_BIO_MAX}`}
        />
        <TextField
          label="Birthday"
          type="date"
          value={draft.birthday}
          onChange={set('birthday')}
          help="Never shown to anyone. Click is for people 13 and older."
          className="sm:max-w-60"
        />
        <SettingsSaveBar formId={FORM_ID} dirty={dirty} saving={saving} onDiscard={() => setDraft(saved)} />
      </form>
      {confirmDialog}
    </>
  );
}
