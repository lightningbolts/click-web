'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  X,
  Loader2,
  MapPin,
  Image as ImageIcon,
  Link as LinkIcon,
  Paperclip,
  History,
} from 'lucide-react';
import { buildProfileConnectionLines } from '@/lib/userProfile/formatSharedConnection';
import { computeClickDropRevealTtlIso } from '@/lib/collaboration/clickDropReveal';
import { beaconHeroImageUrl } from '@/lib/ui/beaconHeroImageUrl';
import { PriorConnectionBadge } from '@/components/profile/PriorConnectionBadge';
import { FcButton } from '@/components/fc';
import { originEncounter, parseConnectionEncounters } from '@/lib/dashboard/connectionEncounters';
import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';
import useSWR, { useSWRConfig } from 'swr';
import Image from 'next/image';
import { authFailureMessage } from '@/lib/auth/freshAuthHeaders';
import { isPriorSource } from '@/lib/insights/analytics';
import { uploadChatMediaBlob } from '@/lib/chat/chatMediaStorage';
import { stableKeysForStringList } from '@/lib/react/stableKeysForStringList';
import type {
  BeaconPreviewItem,
  CollaborationSessionResponse,
  DecryptedProfileMessage,
  UserProfilePayload,
} from '@/lib/userProfile/profileModalTypes';
import {
  ageFromBirthday,
  coerceSharedConnection,
  displayName,
} from '@/lib/userProfile/profileDisplay';
import { metaString } from '@/lib/userProfile/profileMediaItems';
import { ProfileLoadingSkeleton } from '@/components/userProfile/ProfileModalPrimitives';
import { useProfileTabsData } from '@/components/userProfile/useProfileTabsData';
import { MediaTab } from '@/components/userProfile/MediaTab';
import { LinksTab } from '@/components/userProfile/LinksTab';
import { FilesTab } from '@/components/userProfile/FilesTab';
import { BeaconsTab, type BeaconDetailState } from '@/components/userProfile/BeaconsTab';
import { TimelineTab } from '@/components/userProfile/TimelineTab';

export type { AvailabilityIntentRow };
export type { UserProfilePayload, DecryptedProfileMessage } from '@/lib/userProfile/profileModalTypes';

type UserProfileModalProps = {
  userId: string | null;
  getAuthHeaders: () => Promise<HeadersInit>;
  onClose: () => void;
  currentUserId?: string | null;
  /**
   * When true (own profile only), the sheet cannot be dismissed until birthday is saved to
   * `public.users` — backdrop taps and the header close control are disabled.
   */
  forceOwnProfileBirthdayCompletion?: boolean;
  /** Optional parent context for call sites opening from a specific chat row. */
  connectionId?: string | null;
  /** When set, tabs resolve via chatId query (group or 1:1). */
  chatId?: string | null;
  /** Group clique id — enables group master key unwrap for Media/Links/Files. */
  groupId?: string | null;
  /**
   * Locally-decrypted chat messages scanned client-side for `http(s)://` URLs.
   * Required for the Links subtab — the server cannot parse links because
   * message content is end-to-end encrypted.
   */
  decryptedMessages?: DecryptedProfileMessage[];
};

type ProfileTabKey = 'timeline' | 'media' | 'links' | 'files' | 'beacons';

export default function UserProfileModal({
  userId,
  getAuthHeaders,
  onClose,
  currentUserId = null,
  forceOwnProfileBirthdayCompletion = false,
  connectionId = null,
  chatId = null,
  groupId = null,
  decryptedMessages = [],
}: UserProfileModalProps) {
  const { mutate } = useSWRConfig();
  const rollInputRef = useRef<HTMLInputElement>(null);
  const requestedUserId = userId?.trim() || null;
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('timeline');
  const [birthdayDraft, setBirthdayDraft] = useState('');
  const [birthdaySaveError, setBirthdaySaveError] = useState<string | null>(null);
  const [birthdaySaving, setBirthdaySaving] = useState(false);
  const [rollStatus, setRollStatus] = useState<'idle' | 'opening' | 'uploading' | 'done' | 'error'>('idle');
  const [priorRespondBusy, setPriorRespondBusy] = useState(false);
  const [priorRespondError, setPriorRespondError] = useState<string | null>(null);
  const profileConnectionQuery = connectionId?.trim()
    ? `?connectionId=${encodeURIComponent(connectionId.trim())}`
    : '';
  const profilePath = requestedUserId
    ? `/api/users/${encodeURIComponent(requestedUserId)}/profile${profileConnectionQuery}`
    : null;
  const { data, error } = useSWR<UserProfilePayload>(
    profilePath,
    async (path: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          authFailureMessage(
            res.status,
            typeof json?.error === 'string' && json.error.trim()
              ? json.error
              : res.statusText || 'Failed to load profile',
          ),
        );
      }
      return json as UserProfilePayload;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );

  const profileData = useMemo(() => {
    if (!requestedUserId || !data?.user?.id) return null;
    return data.user.id === requestedUserId ? data : null;
  }, [data, requestedUserId]);

  const interestTagKeys = useMemo(() => {
    if (!profileData) return [];
    return stableKeysForStringList(profileData.tags, `interest:${profileData.user.id}`);
  }, [profileData]);

  const sharedInterestTagKeys = useMemo(() => {
    if (!profileData) return [];
    return stableKeysForStringList(profileData.sharedInterestTags ?? [], `shared:${profileData.user.id}`);
  }, [profileData]);

  const effectiveConnectionId = useMemo(() => {
    const fromProfile = (profileData?.sharedConnection as Record<string, unknown> | null)?.id;
    if (typeof fromProfile === 'string' && fromProfile.trim()) return fromProfile.trim();
    const fromProp = connectionId?.trim();
    return fromProp || null;
  }, [connectionId, profileData?.sharedConnection]);

  const connectionUserIds = useMemo(() => {
    const raw = (profileData?.sharedConnection as Record<string, unknown> | null)?.user_ids;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0);
  }, [profileData?.sharedConnection]);

  const {
    tabsLoading,
    chatMessagesLoading,
    cryptoUnlockError,
    mediaItems,
    imageItems,
    audioItems,
    fileItems,
    beaconItems,
    linkItems,
    resolvedMediaUrls,
    recommendationPayload,
    openMediaItem,
    downloadMediaItem,
    openFileItem,
    downloadFileItem,
  } = useProfileTabsData({
    getAuthHeaders,
    currentUserId,
    requestedUserId,
    chatId,
    groupId,
    effectiveConnectionId,
    connectionUserIds,
    decryptedMessages,
  });

  const [recommendationDismissed, setRecommendationDismissed] = useState(false);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [beaconDetail, setBeaconDetail] = useState<BeaconDetailState | null>(null);

  const openBeaconDetail = useCallback(
    async (beaconId: string, fallback?: BeaconPreviewItem) => {
      setBeaconDetail({
        beaconId,
        loading: true,
        error: null,
        title: fallback?.title ?? 'Event',
        description: fallback?.description,
        location: fallback?.locationLabel,
        schedule: fallback?.scheduleLabel,
        imageUrl: fallback?.imageUrl,
      });
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/beacons/${encodeURIComponent(beaconId)}`, { headers });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Fallback to chat metadata so expired / out-of-scope beacons still open.
          if (fallback) {
            setBeaconDetail({
              beaconId,
              loading: false,
              error: null,
              title: fallback.title,
              description: fallback.description,
              location: fallback.locationLabel,
              schedule: fallback.scheduleLabel,
              imageUrl: fallback.imageUrl,
            });
            return;
          }
          throw new Error(
            typeof json?.error === 'string' && json.error.trim()
              ? json.error
              : 'Could not load beacon',
          );
        }
        const beacon = (json as { beacon?: Record<string, unknown>; expired?: boolean }).beacon;
        const expired = Boolean((json as { expired?: boolean }).expired);
        const meta =
          beacon && typeof beacon.metadata === 'object' && beacon.metadata != null
            ? (beacon.metadata as Record<string, unknown>)
            : null;
        setBeaconDetail({
          beaconId,
          loading: false,
          error: null,
          title: metaString(meta, 'title', 'event_title', 'eventTitle', 'label', 'name') ?? fallback?.title ?? 'Event',
          description: metaString(meta, 'description', 'body') ?? fallback?.description,
          location:
            metaString(meta, 'formatted_address', 'formattedAddress', 'location_name', 'locationName') ??
            fallback?.locationLabel,
          schedule: metaString(meta, 'schedule_label', 'scheduleLabel') ?? fallback?.scheduleLabel,
          expired,
          imageUrl: beaconHeroImageUrl(meta) ?? fallback?.imageUrl,
        });
      } catch (e) {
        if (fallback) {
          setBeaconDetail({
            beaconId,
            loading: false,
            error: null,
            title: fallback.title,
            description: fallback.description,
            location: fallback.locationLabel,
            schedule: fallback.scheduleLabel,
            imageUrl: fallback.imageUrl,
          });
          return;
        }
        setBeaconDetail({
          beaconId,
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load beacon',
          title: 'Event',
        });
      }
    },
    [getAuthHeaders],
  );

  const jsonHeaders = useCallback(async () => {
    const headers = new Headers(await getAuthHeaders());
    headers.set('Content-Type', 'application/json');
    return headers;
  }, [getAuthHeaders]);

  const openCollaborationSession = useCallback(async () => {
    if (!effectiveConnectionId) {
      throw new Error('Missing connection for Click Drop');
    }
    const headers = await jsonHeaders();
    const res = await fetch(`/api/connections/${encodeURIComponent(effectiveConnectionId)}/collaboration-session`, {
      method: 'POST',
      headers,
    });
    const body = (await res.json().catch(() => ({}))) as CollaborationSessionResponse;
    if (!res.ok) {
      throw new Error('Could not open Click Drop');
    }
    const encounterId = typeof body.encounter_id === 'string' ? body.encounter_id.trim() : '';
    const collaborationTtl = typeof body.collaboration_ttl === 'string' ? body.collaboration_ttl.trim() : '';
    if (!encounterId || !collaborationTtl) {
      throw new Error('Click Drop session was incomplete');
    }
    return { encounterId, collaborationTtl };
  }, [effectiveConnectionId, jsonHeaders]);

  const openRollPicker = useCallback(() => {
    if (!effectiveConnectionId || !currentUserId?.trim()) return;
    if (rollStatus === 'opening' || rollStatus === 'uploading') return;
    rollInputRef.current?.click();
  }, [currentUserId, effectiveConnectionId, rollStatus]);

  const onRollPhotoSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/') || !effectiveConnectionId || !currentUserId?.trim()) {
        setRollStatus('error');
        return;
      }

      setRollStatus('opening');
      try {
        const session = await openCollaborationSession();
        setRollStatus('uploading');
        const { publicUrl } = await uploadChatMediaBlob(currentUserId.trim(), file, file.type);
        const headers = await jsonHeaders();
        const messageRes = await fetch('/api/chat/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            connectionId: effectiveConnectionId,
            content: ' ',
            message_type: 'image',
            metadata: {
              media_url: publicUrl,
              original_mime_type: file.type || 'image/jpeg',
              disposable_roll: true,
              encounter_id: session.encounterId,
              collaboration_ttl: computeClickDropRevealTtlIso(),
            },
          }),
        });
        if (!messageRes.ok) {
          throw new Error('Could not send Click Drop photo');
        }
        setRollStatus('done');
      } catch {
        setRollStatus('error');
      }
    },
    [currentUserId, effectiveConnectionId, jsonHeaders, openCollaborationSession],
  );

  useEffect(() => {
    // Reset derived state whenever the sheet opens for a new user.
    if (!requestedUserId) return;
    setActiveTab('timeline');
    setBirthdayDraft('');
    setBirthdaySaveError(null);
    setBirthdaySaving(false);
    setRollStatus('idle');
    setRecommendationDismissed(false);
    setBeaconDetail(null);
  }, [requestedUserId]);

  useEffect(() => {
    if (!forceOwnProfileBirthdayCompletion || !profileData?.user) return;
    const u = profileData.user;
    const existing = u.birthday?.trim();
    if (existing) {
      setBirthdayDraft(existing.slice(0, 10));
    } else {
      setBirthdayDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOwnProfileBirthdayCompletion, profileData?.user?.birthday, profileData?.user?.id]);

  const open = !!requestedUserId;
  const errorMessage = error instanceof Error ? error.message : error ? 'Failed to load' : null;
  const loading = Boolean(requestedUserId) && !profileData && !errorMessage;

  const momentLines = useMemo(() => {
    const sc = profileData?.sharedConnection;
    const payload = coerceSharedConnection(sc);
    if (!payload) return null;
    return buildProfileConnectionLines(payload);
  }, [profileData?.sharedConnection]);

  const hasMoment =
    !!momentLines &&
    Object.values(momentLines).some((v) => typeof v === 'string' && v.trim().length > 0);

  const encounterTimeline = useMemo(() => {
    const raw = profileData?.sharedConnection;
    if (!raw || typeof raw !== 'object') return null;
    const conn = raw as Record<string, unknown>;
    const rows = parseConnectionEncounters(conn);
    const origin = originEncounter(conn);
    return { rows, originId: origin?.id ?? null };
  }, [profileData?.sharedConnection]);

  const sharedPayload = useMemo(
    () => coerceSharedConnection(profileData?.sharedConnection),
    [profileData?.sharedConnection],
  );
  const isPriorConnection = isPriorSource(sharedPayload?.source);
  const priorSourceLabel =
    sharedPayload?.connection_method === 'prior' || sharedPayload?.connection_method === 'contacts'
      ? 'Added from Contacts'
      : 'Added by Search';
  const priorConfirmed =
    sharedPayload?.confirmed_by_a === true && sharedPayload?.confirmed_by_b === true;
  const canRespondPrior =
    isPriorConnection &&
    sharedPayload?.status === 'pending' &&
    !!currentUserId &&
    (sharedPayload.responder_id === currentUserId ||
      (sharedPayload.initiator_id !== currentUserId &&
        Array.isArray((profileData?.sharedConnection as Record<string, unknown> | null)?.user_ids) &&
        ((profileData?.sharedConnection as Record<string, unknown>).user_ids as unknown[]).includes(
          currentUserId,
        )));

  const respondToPrior = async (action: 'accept' | 'decline') => {
    const connectionIdToRespond = sharedPayload?.id;
    if (!connectionIdToRespond) return;
    setPriorRespondBusy(true);
    setPriorRespondError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/connections/prior/respond', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionIdToRespond, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : 'Could not update request');
      }
      if (profilePath) await mutate(profilePath);
    } catch (err) {
      setPriorRespondError(err instanceof Error ? err.message : 'Could not update request');
    } finally {
      setPriorRespondBusy(false);
    }
  };

  const blockingBirthday =
    forceOwnProfileBirthdayCompletion &&
    !!profileData &&
    (profileData.user.birthday == null || !String(profileData.user.birthday).trim());
  const rollBusy = rollStatus === 'opening' || rollStatus === 'uploading';
  const canOpenDisposableRoll = Boolean(effectiveConnectionId && currentUserId?.trim() && !blockingBirthday);

  const saveOwnBirthday = async () => {
    if (!requestedUserId || !profilePath) return;
    setBirthdaySaveError(null);
    const raw = birthdayDraft.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setBirthdaySaveError('Use format YYYY-MM-DD.');
      return;
    }
    const age = ageFromBirthday(raw);
    if (age == null || age < 13) {
      setBirthdaySaveError('You must be at least 13 years old.');
      return;
    }
    setBirthdaySaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(profilePath, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthday: raw.slice(0, 10) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' && json.error.trim()
            ? json.error.trim()
            : res.statusText || 'Could not save',
        );
      }
      await mutate(profilePath);
      onClose();
    } catch (e) {
      setBirthdaySaveError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBirthdaySaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={requestedUserId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6 transform-gpu translate-z-0 will-change-[opacity]"
          onClick={blockingBirthday ? () => {} : onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.85 }}
            className="fc-card relative flex w-full max-w-md max-h-[min(88vh,640px)] flex-col overflow-hidden text-on-surface transform-gpu translate-z-0"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-profile-modal-title"
          >
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border-hard bg-surface px-4 py-3 sm:px-5">
              <h2 id="user-profile-modal-title" className="text-lg font-bold text-on-surface">
                {blockingBirthday ? 'Add your birthday' : 'Profile'}
              </h2>
              {!blockingBirthday ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-[8px] border border-border-hard p-2 text-on-surface-variant hover:text-on-surface"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <span className="w-10" aria-hidden />
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-5">
              {blockingBirthday && (
                <div className="mb-5 rounded-[16px] border border-border-hard bg-surface-container p-4">
                  <p className="mb-3 text-sm font-medium text-on-surface">
                    To keep Click age-appropriate, please confirm your date of birth. This modal stays open until you save.
                  </p>
                  <label className="mb-1.5 block text-sm font-medium text-on-surface" htmlFor="profile-gate-birthday">
                    Birthday
                  </label>
                  <input
                    id="profile-gate-birthday"
                    type="date"
                    autoComplete="bday"
                    value={birthdayDraft}
                    onChange={(e) => setBirthdayDraft(e.target.value)}
                    className="fc-input h-10 w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    max={new Date().toISOString().slice(0, 10)}
                  />
                  {birthdaySaveError ? (
                    <p className="mt-2 text-xs font-medium text-error">{birthdaySaveError}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={birthdaySaving}
                    onClick={() => {
                      void saveOwnBirthday();
                    }}
                    className="fc-btn-primary mt-4 w-full py-2.5 disabled:opacity-50"
                  >
                    {birthdaySaving ? 'Saving…' : 'Save birthday'}
                  </button>
                </div>
              )}
              {loading && <ProfileLoadingSkeleton />}
              {errorMessage && !loading && (
                <p className="py-6 text-center text-sm font-medium text-error">{errorMessage}</p>
              )}
              {profileData && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-5"
                >
                  <div className="flex flex-col items-center gap-3">
                    {profileData.user.image ? (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border border-border-hard transform-gpu translate-z-0">
                        <Image
                          src={profileData.user.image}
                          alt=""
                          width={96}
                          height={96}
                          priority
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-24 w-24 items-center justify-center rounded-full border border-border-hard bg-primary text-3xl font-bold text-on-primary"
                      >
                        {displayName(profileData.user).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xl font-bold text-on-surface">
                        {displayName(profileData.user)}
                        {ageFromBirthday(profileData.user.birthday) != null && (
                          <span className="font-medium text-on-surface-variant">, {ageFromBirthday(profileData.user.birthday)}</span>
                        )}
                      </p>
                      {profileData.user.email && (
                        <p className="mt-1 text-xs font-medium text-on-surface-variant">{profileData.user.email}</p>
                      )}
                      {isPriorConnection ? (
                        <div className="mt-2 flex justify-center">
                          <PriorConnectionBadge />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {canRespondPrior && (
                    <section className="grid grid-cols-2 gap-2" aria-label="Prior connection request">
                      <FcButton
                        variant="primary"
                        disabled={priorRespondBusy}
                        onClick={() => void respondToPrior('accept')}
                      >
                        Accept
                      </FcButton>
                      <FcButton
                        variant="secondary"
                        disabled={priorRespondBusy}
                        onClick={() => void respondToPrior('decline')}
                      >
                        Decline
                      </FcButton>
                      {priorRespondError ? (
                        <p className="col-span-2 text-sm text-error">{priorRespondError}</p>
                      ) : null}
                    </section>
                  )}
                  {canOpenDisposableRoll && (
                    <section aria-label="Profile actions" className="grid grid-cols-1 gap-2">
                      <input
                        ref={rollInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        capture="environment"
                        className="hidden"
                        onChange={onRollPhotoSelected}
                      />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={openRollPicker}
                        disabled={rollBusy}
                        className="flex w-full items-center gap-3 rounded-[16px] border border-border-hard bg-surface-container px-4 py-3 text-left transition-colors hover:border-primary disabled:cursor-wait disabled:opacity-70"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-border-hard bg-on-primary-container text-primary">
                          {rollBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-on-surface">Click Drop</span>
                          <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">
                            {rollStatus === 'uploading'
                              ? 'Dropping your photo into the shared roll...'
                              : rollStatus === 'done'
                                ? 'Captured to the roll.'
                                : 'Open the camera for a time-locked shared drop.'}
                          </span>
                        </span>
                      </motion.button>
                      {rollStatus === 'error' && (
                        <p className="text-xs font-medium text-error">Couldn&apos;t open Click Drop — try again.</p>
                      )}
                    </section>
                  )}

                  {/*
                    Five-tab secondary nav mirroring the KMP [ProfileBottomSheet]
                    subtabs: Timeline · Media · Links · Files · Beacons.
                  */}
                  <nav
                    role="tablist"
                    aria-label="Profile sections"
                    className="grid grid-cols-5 gap-1 rounded-[12px] border border-border-hard bg-surface-container p-1"
                  >
                    {(
                      [
                        { key: 'timeline', label: 'Timeline', Icon: History },
                        { key: 'beacons', label: 'Beacons', Icon: MapPin },
                        { key: 'media', label: 'Media', Icon: ImageIcon },
                        { key: 'links', label: 'Links', Icon: LinkIcon },
                        { key: 'files', label: 'Files', Icon: Paperclip },
                      ] as const
                    ).map(({ key, label, Icon }) => {
                      const selected = activeTab === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => setActiveTab(key)}
                          className={`flex items-center justify-center gap-1.5 rounded-[8px] px-1.5 py-2 text-[11px] font-semibold transition-colors sm:text-xs ${
                            selected
                              ? 'bg-primary text-on-primary'
                              : 'text-on-surface-variant hover:bg-surface hover:text-on-surface'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          <span className="hidden sm:inline">{label}</span>
                        </button>
                      );
                    })}
                  </nav>

                  {activeTab === 'media' && (
                    <MediaTab
                      cryptoUnlockError={cryptoUnlockError}
                      mediaItems={mediaItems}
                      imageItems={imageItems}
                      audioItems={audioItems}
                      tabsLoading={tabsLoading}
                      resolvedMediaUrls={resolvedMediaUrls}
                      openMediaItem={openMediaItem}
                      downloadMediaItem={downloadMediaItem}
                    />
                  )}

                  {activeTab === 'links' && (
                    <LinksTab linkItems={linkItems} chatMessagesLoading={chatMessagesLoading} />
                  )}

                  {activeTab === 'files' && (
                    <FilesTab
                      fileItems={fileItems}
                      tabsLoading={tabsLoading}
                      openFileItem={openFileItem}
                      downloadFileItem={downloadFileItem}
                    />
                  )}

                  {activeTab === 'beacons' && (
                    <BeaconsTab
                      recommendationPayload={recommendationPayload}
                      recommendationDismissed={recommendationDismissed}
                      setRecommendationDismissed={setRecommendationDismissed}
                      rsvpBusy={rsvpBusy}
                      setRsvpBusy={setRsvpBusy}
                      getAuthHeaders={getAuthHeaders}
                      beaconItems={beaconItems}
                      tabsLoading={tabsLoading}
                      openBeaconDetail={openBeaconDetail}
                      beaconDetail={beaconDetail}
                      setBeaconDetail={setBeaconDetail}
                    />
                  )}

                  {activeTab === 'timeline' && (
                    <TimelineTab
                      profileData={profileData}
                      isPriorConnection={isPriorConnection}
                      priorSourceLabel={priorSourceLabel}
                      priorConfirmed={priorConfirmed}
                      sharedPayload={sharedPayload}
                      hasMoment={hasMoment}
                      momentLines={momentLines}
                      encounterTimeline={encounterTimeline}
                      interestTagKeys={interestTagKeys}
                      sharedInterestTagKeys={sharedInterestTagKeys}
                    />
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
