'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { TextArea, TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import PlaceHoursEditor from '@/components/places/PlaceHoursEditor';
import { SettingsSaveBar } from '@/components/settings/SettingsSaveBar';
import { ToggleList, ToggleRow } from '@/components/settings/ToggleRows';
import { authedJson } from '@/lib/api/authedJson';
import { categoryLabel } from '@/lib/places/categories';
import type { PlaceHours } from '@/lib/places/types';
import { canWrite } from '@/lib/places/workspace';
import type { WorkspacePlace } from './PlaceWorkspaceContext';

const FORM_ID = 'place-profile-form';
const DESCRIPTION_MAX = 500;

type Draft = { description: string; website: string; addressLine: string; city: string; hours: PlaceHours };

const draftOf = (p: WorkspacePlace): Draft => ({
  description: p.description ?? '',
  website: p.website_url ?? '',
  addressLine: p.address_line ?? '',
  city: p.city ?? '',
  hours: p.hours ?? {},
});

/** Ready to be listed: verified, with the basics people look for. */
export function listingBlocker(p: Pick<WorkspacePlace, 'verification_status' | 'photo_url' | 'description' | 'hours'>): string | null {
  if (p.verification_status !== 'verified') return 'Available once Click verifies your Place.';
  const missing = [!p.photo_url && 'a photo', !p.description && 'a description', !(p.hours && Object.keys(p.hours).length) && 'hours'].filter(Boolean);
  return missing.length ? `Add ${missing.join(', ')} first.` : null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Place profile (spec §9.5): photo, description, hours, website, address, Hub and the owner's
 * Listed switch. Admin-only fields are read-only. Text fields save together with the sticky bar;
 * switches save at once.
 */
export function PlaceProfileForm({ place: initial }: { place: WorkspacePlace }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState(initial);
  const [saved, setSaved] = useState<Draft>(() => draftOf(initial));
  const [draft, setDraft] = useState<Draft>(saved);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writer = canWrite(place.role);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const blocker = listingBlocker(place);

  const patch = async (body: Record<string, unknown>, done: string) => {
    const { place: updated } = await authedJson<{ place: WorkspacePlace }>(`/api/places/${place.id}`, {
      method: 'PATCH',
      body,
      fallback: 'Couldn’t save your Place.',
    });
    setPlace((cur) => ({ ...cur, ...updated }));
    toast.success(done);
    router.refresh();
    return updated;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await patch(
        {
          description: draft.description.trim() || null,
          hours: Object.keys(draft.hours).length ? draft.hours : null,
          website_url: draft.website.trim() || null,
          address_line: draft.addressLine.trim() || null,
          city: draft.city.trim() || null,
        },
        'Profile saved',
      );
      const next = draftOf({ ...place, ...updated });
      setSaved(next);
      setDraft(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save your Place.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key: 'hub_enabled' | 'listed', on: boolean) => {
    const previous = place[key];
    setPlace((cur) => ({ ...cur, [key]: on }));
    try {
      await patch({ [key]: on }, key === 'listed' ? (on ? 'Your Place is live' : 'Taken off the map') : on ? 'Place Hub on' : 'Place Hub off');
    } catch (err) {
      setPlace((cur) => ({ ...cur, [key]: previous }));
      toast.error(err instanceof Error ? err.message : 'Couldn’t save that change.');
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { photo_url } = await authedJson<{ photo_url: string | null }>(`/api/places/${place.id}/photo`, {
        method: 'POST',
        body: { file_b64: await fileToBase64(file), mime_type: file.type },
        fallback: 'Couldn’t upload that photo.',
      });
      setPlace((cur) => ({ ...cur, photo_url }));
      toast.success('Photo updated');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t upload that photo.');
    } finally {
      setUploading(false);
    }
  };

  const set = (k: Exclude<keyof Draft, 'hours'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-8">
        <section aria-labelledby="place-photo" className="flex flex-col gap-3">
          <h2 id="place-photo" className="type-headline text-fg">
            Photo
          </h2>
          <CardVisual seed={place.id} photoUrl={place.photo_url} ratio="16:5" radius="lg" sizes="640px" />
          {writer ? (
            <div>
              <Button variant="secondary" size="sm" icon={ImagePlus} loading={uploading} onClick={() => fileRef.current?.click()}>
                {place.photo_url ? 'Change photo' : 'Add photo'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void upload(file);
                }}
              />
              <p className="type-meta mt-1 text-fg-tertiary">JPEG, PNG or WebP, up to 5 MB.</p>
            </div>
          ) : null}
        </section>

        <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
          <TextArea
            label="Description"
            value={draft.description}
            onChange={set('description')}
            maxLength={DESCRIPTION_MAX}
            rows={4}
            disabled={!writer}
            count={`${draft.description.length}/${DESCRIPTION_MAX}`}
            error={error}
          />
          <fieldset disabled={!writer}>
            <legend className="type-meta mb-2 font-semibold text-fg-secondary">Hours</legend>
            <PlaceHoursEditor value={draft.hours} onChange={(hours) => setDraft((d) => ({ ...d, hours }))} disabled={!writer} />
          </fieldset>
          <TextField label="Website" type="url" placeholder="https://" value={draft.website} onChange={set('website')} disabled={!writer} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Street address" value={draft.addressLine} onChange={set('addressLine')} disabled={!writer} />
            <TextField label="City" value={draft.city} onChange={set('city')} disabled={!writer} />
          </div>
          {writer ? <SettingsSaveBar formId={FORM_ID} dirty={dirty} saving={saving} onDiscard={() => setDraft(saved)} /> : null}
        </form>
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        <ToggleList header="On Click">
          <ToggleRow
            title="Place Hub"
            description="A permanent chat for people who check in."
            checked={place.hub_enabled}
            disabled={!writer}
            onChange={(on) => void toggle('hub_enabled', on)}
          />
          {place.role === 'owner' ? (
            <ToggleRow
              title="Listed on Click"
              description={blocker && !place.listed ? blocker : 'Your pin, Place page and events show to people nearby.'}
              checked={place.listed}
              disabled={Boolean(blocker) && !place.listed}
              onChange={(on) => void toggle('listed', on)}
            />
          ) : null}
        </ToggleList>

        <ListGroup header="Set by Click" footer="Contact Click to change these.">
          <ListRow title="Name" trailing={place.name} />
          <ListRow title="Web address" trailing={place.slug ? `/p/${place.slug}` : 'Not set'} />
          <ListRow title="Category" trailing={place.category ? categoryLabel(place.category) : 'Not set'} />
          <ListRow
            title="Location"
            trailing={place.latitude != null && place.longitude != null ? `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}` : 'Not set'}
          />
          <ListRow title="Check-in radius" trailing={`${place.radius_meters} m`} />
        </ListGroup>
      </div>
    </div>
  );
}
