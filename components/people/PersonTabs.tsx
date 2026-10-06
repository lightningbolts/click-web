'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  Download,
  ExternalLink,
  FileText,
  Hand,
  History,
  Image as ImageIcon,
  Link as LinkIcon,
  MapPin,
  Pin,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/ds/EmptyState';
import { IconButton } from '@/components/ds/IconButton';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Skeleton } from '@/components/ds/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ds/Tabs';
import { useProfileTabsData } from '@/components/userProfile/useProfileTabsData';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { fetchPins } from '@/lib/chat/conversationApi';
import { knownSinceLabel } from '@/lib/connections/priorConnectionMeta';
import type { ConnectionEncounterRow } from '@/lib/dashboard/connectionEncounters';
import { threadHref } from '@/lib/shell/appNav';
import { encounterMetricPills, formatEncounterWhen } from '@/lib/userProfile/profileDisplay';
import { formatFileSize } from '@/lib/userProfile/profileMediaItems';
import type { SharedConnectionPayload } from '@/lib/userProfile/formatSharedConnection';

export const PERSON_TABS = ['timeline', 'pinned', 'media', 'links', 'files'] as const;
export type PersonTab = (typeof PERSON_TABS)[number];

const LABEL: Record<PersonTab, string> = {
  timeline: 'Timeline',
  pinned: 'Pinned',
  media: 'Media',
  links: 'Links',
  files: 'Files',
};

const EMPTY_MESSAGES: never[] = [];

function Row({ icon: Icon, title, meta, trailing }: { icon: LucideIcon; title: string; meta?: string; trailing?: React.ReactNode }) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-selection text-accent">
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-body-strong block truncate text-fg">{title}</span>
        {meta ? <span className="type-meta block truncate text-fg-tertiary">{meta}</span> : null}
      </span>
      {trailing}
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul aria-busy className="flex flex-col gap-2 py-2">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex h-14 items-center gap-3">
          <Skeleton rounded="full" className="size-9" />
          <Skeleton className="h-4 w-48" />
        </li>
      ))}
    </ul>
  );
}

function TimelinePanel({
  encounters,
  shared,
  isPrior,
}: {
  encounters: ConnectionEncounterRow[];
  shared: SharedConnectionPayload | null;
  isPrior: boolean;
}) {
  if (isPrior && encounters.length === 0) {
    return (
      <ul className="divide-y divide-hairline">
        <Row
          icon={Hand}
          title={shared?.connection_method === 'contacts' || shared?.connection_method === 'prior' ? 'Added from Contacts' : 'Added by Search'}
          meta={`Known since ${knownSinceLabel(shared?.known_since)}`}
        />
      </ul>
    );
  }
  if (encounters.length === 0) {
    return <EmptyState icon={History} title="No moments yet" body="Each time you Click in person, it lands here." headingLevel="h3" />;
  }
  return (
    <ul className="divide-y divide-hairline">
      {encounters.map((e, i) => {
        const metrics = encounterMetricPills(e).map((m) => m.label).slice(0, 3);
        return (
          <Row
            key={e.id}
            icon={i === encounters.length - 1 ? Sparkles : MapPin}
            title={e.locationName ?? e.displayLocation ?? (i === encounters.length - 1 ? 'First Click' : 'Clicked again')}
            meta={[formatEncounterWhen(e.encounteredAt), ...metrics].join(' · ')}
          />
        );
      })}
    </ul>
  );
}

/**
 * The relationship's shared history (spec §7.3): Timeline · Pinned · Media · Links · Files,
 * kept in `?tab=` so each is linkable.
 */
export function PersonTabs({
  userId,
  currentUserId,
  connectionId,
  encounters,
  shared,
  isPrior,
}: {
  userId: string;
  currentUserId: string | null;
  connectionId: string | null;
  encounters: ConnectionEncounterRow[];
  shared: SharedConnectionPayload | null;
  isPrior: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: PersonTab = (PERSON_TABS as readonly string[]).includes(raw ?? '') ? (raw as PersonTab) : 'timeline';

  const connectionUserIds = currentUserId ? [currentUserId, userId] : [userId];
  const t = useProfileTabsData({
    getAuthHeaders: getFreshAuthHeaders,
    currentUserId,
    requestedUserId: userId,
    chatId: null,
    groupId: null,
    effectiveConnectionId: connectionId,
    connectionUserIds,
    decryptedMessages: EMPTY_MESSAGES,
  });

  const pins = useSWR(tab === 'pinned' && t.resolvedChatId ? ['pins', t.resolvedChatId] : null, ([, id]) => fetchPins(id));
  const byId = new Map(t.chatTextMessages.map((m) => [m.id, m]));

  const select = (next: string) => {
    const q = new URLSearchParams(params.toString());
    if (next === 'timeline') q.delete('tab');
    else q.set('tab', next);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={select}>
      <TabsList aria-label="Shared with them">
        {PERSON_TABS.map((key) => (
          <TabsTrigger key={key} value={key}>
            {LABEL[key]}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="timeline" className="pt-2">
        <TimelinePanel encounters={encounters} shared={shared} isPrior={isPrior} />
      </TabsContent>

      <TabsContent value="pinned" className="pt-2">
        {pins.isLoading || (pins.data?.length && t.chatMessagesLoading) ? (
          <ListSkeleton />
        ) : !pins.data?.length ? (
          <EmptyState icon={Pin} title="Nothing pinned" body="Pin a message in your chat to keep it here." headingLevel="h3" />
        ) : (
          <ul className="divide-y divide-hairline">
            {pins.data.map((p) => {
              const message = byId.get(p.message_id);
              return (
                <li key={p.message_id}>
                  <Link
                    href={connectionId ? `${threadHref(connectionId)}?m=${encodeURIComponent(p.message_id)}` : '#'}
                    className="-mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 py-2 hover:bg-hover"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-selection text-accent">
                      <Pin size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="type-body block truncate text-fg">{message?.content.trim() || 'Pinned message'}</span>
                      <span className="type-meta block text-fg-tertiary">
                        Pinned {new Date(p.pinned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="media" className="pt-3">
        {t.cryptoUnlockError ? (
          <InlineNotice variant="warning" className="mb-3">
            {t.cryptoUnlockError}
          </InlineNotice>
        ) : null}
        {t.mediaItems.length === 0 && t.tabsLoading ? (
          <div className="grid grid-cols-3 gap-[3px]" aria-busy>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} rounded="sm" className="aspect-square" shimmer />
            ))}
          </div>
        ) : t.mediaItems.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No shared media" body="Photos and voice notes from your chat show up here." headingLevel="h3" />
        ) : (
          <>
            {t.imageItems.length > 0 ? (
              <ul className="grid grid-cols-3 gap-[3px] overflow-hidden rounded-md">
                {t.imageItems.map((m) => (
                  <li key={m.id} className="aspect-square bg-fill-subtle">
                    {t.resolvedMediaUrls[m.id] ? (
                      <button type="button" className="block size-full" aria-label="Open photo" onClick={() => t.openMediaItem(m)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.resolvedMediaUrls[m.id]} alt={m.caption ?? ''} decoding="async" loading="lazy" className="size-full object-cover" />
                      </button>
                    ) : (
                      <span className="type-meta flex size-full items-center justify-center text-fg-tertiary">Encrypted</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {t.audioItems.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {t.audioItems.map((m) => (
                  <li key={m.id} className="rounded-md bg-surface p-3">
                    <div className="flex items-center justify-between">
                      <span className="type-body-strong text-fg">Voice note</span>
                      {t.resolvedMediaUrls[m.id] ? (
                        <IconButton icon={Download} aria-label="Download voice note" size="sm" onClick={() => void t.downloadMediaItem(m)} />
                      ) : null}
                    </div>
                    {t.resolvedMediaUrls[m.id] ? (
                      <audio controls preload="metadata" src={t.resolvedMediaUrls[m.id]} className="mt-2 w-full" />
                    ) : (
                      <p className="type-meta mt-1 text-fg-tertiary">Encrypted</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </TabsContent>

      <TabsContent value="links" className="pt-2">
        {t.linkItems.length === 0 && t.chatMessagesLoading ? (
          <ListSkeleton />
        ) : t.linkItems.length === 0 ? (
          <EmptyState icon={LinkIcon} title="No shared links" body="Links from your chat show up here." headingLevel="h3" />
        ) : (
          <ul className="divide-y divide-hairline">
            {t.linkItems.map((l) => {
              let host = l.url;
              try {
                host = new URL(l.url).hostname.replace(/^www\./, '');
              } catch {
                /* keep the raw url */
              }
              return (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="-mx-2 flex min-h-14 items-center gap-3 rounded-md px-2 py-2 hover:bg-hover">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-selection text-accent">
                      <LinkIcon size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="type-body-strong block truncate text-fg">{host}</span>
                      <span className="type-meta block truncate text-fg-tertiary">{l.url}</span>
                    </span>
                    <ExternalLink size={16} className="shrink-0 text-fg-tertiary" aria-hidden />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="files" className="pt-2">
        {t.fileItems.length === 0 && t.tabsLoading ? (
          <ListSkeleton />
        ) : t.fileItems.length === 0 ? (
          <EmptyState icon={FileText} title="No shared files" body="Attachments from your chat show up here." headingLevel="h3" />
        ) : (
          <ul className="divide-y divide-hairline">
            {t.fileItems.map((f) => (
              <Row
                key={f.id}
                icon={FileText}
                title={f.fileName}
                meta={`${formatFileSize(f.sizeBytes)} · ${f.timestamp}`}
                trailing={
                  <span className="flex shrink-0 gap-1">
                    <IconButton icon={ExternalLink} aria-label={`Open ${f.fileName}`} size="sm" onClick={() => void t.openFileItem(f)} />
                    <IconButton icon={Download} aria-label={`Download ${f.fileName}`} size="sm" onClick={() => void t.downloadFileItem(f)} />
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
