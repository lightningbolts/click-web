'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CalendarPlus,
  ExternalLink,
  FileText,
  Flag,
  Handshake,
  LogOut,
  PinOff,
  Search,
  Shield,
  ShieldOff,
  Trash2,
  User,
  UserMinus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds/Menu';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { tryDecodeEnvelope, tryDecodeV2AttachmentDescriptor } from '@/lib/chat/attachmentCrypto';
import { MUTE_OPTIONS, muteStatusLabel, type ChatMute, type MessagePin, type PendingHangout } from '@/lib/chat/conversationApi';
import type { DerivedKeys } from '@/lib/chat/crypto';
import type { E2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { extractLinks } from '@/lib/chat/linkify';
import {
  chatAttachmentPathFromSignedUrl,
  isEncryptedMediaFromMetadata,
  mediaPathFromMetadata,
  mediaUrlFromMetadata,
  originalMimeTypeFromMetadata,
  previewLabelForMessage,
} from '@/lib/chat/mediaMetadata';
import { mediaV2Fields } from '@/lib/chat/mediaV2Fields';
import { parsePlan, planIsOver, planWhenText, type HangoutPlan } from '@/lib/chat/plans';
import type { Message } from '@/lib/chat/types';
import { useSecureMedia } from '@/lib/chat/useSecureMedia';
import type { ScheduledItem } from './useConversationExtras';
import type { ConversationActions } from './useConversationActions';

const MEDIA_LIMIT = 9;
const LIST_LIMIT = 5;

function formatShort(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Quick({ icon: Icon, label, onClick, pressed }: { icon: LucideIcon; label: string; onClick?: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="press group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md py-2 text-fg hover:bg-hover"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-fill-subtle text-accent group-aria-pressed:bg-selection">
        <Icon size={18} aria-hidden />
      </span>
      <span className="type-badge font-semibold">{label}</span>
    </button>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 pt-5">
      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <h3 className="type-badge uppercase text-fg-tertiary">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function MediaThumb({
  message,
  mediaChatKey,
  getAuthHeaders,
  getE2eeV2Session,
  onOpen,
}: {
  message: Message;
  mediaChatKey?: DerivedKeys | ArrayBuffer | null;
  getAuthHeaders?: () => Promise<HeadersInit>;
  getE2eeV2Session?: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  onOpen: () => void;
}) {
  const url = mediaUrlFromMetadata(message.metadata);
  const media = useSecureMedia({
    storageUrl: url,
    storagePath: mediaPathFromMetadata(message.metadata) ?? chatAttachmentPathFromSignedUrl(url),
    chatKey: mediaChatKey,
    mimeType: originalMimeTypeFromMetadata(message.metadata),
    isEncryptedMedia: isEncryptedMediaFromMetadata(message.metadata),
    getE2eeV2Session,
    getAuthHeaders,
    v2Metadata: mediaV2Fields(message.metadata, message.chat_id),
  });
  return (
    <button type="button" onClick={onOpen} aria-label="Show photo in conversation" className="press aspect-square overflow-hidden rounded-xs bg-fill-subtle">
      {media.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- decrypted object URL
        <img src={media.src} alt="" loading="lazy" className="size-full object-cover" />
      ) : null}
    </button>
  );
}

/**
 * The conversation's details (spec §7.2): who, four quick actions, what you've shared, and a
 * danger zone. A column beside the thread on wide screens; a sheet over it otherwise.
 */
export function ConversationDetailsPanel({
  connection,
  isGroupClique,
  title,
  subtitle,
  peerUserId,
  currentUserId,
  messages,
  mute,
  onSetMuted,
  pins,
  onUnpin,
  scheduled,
  onCancelScheduled,
  hangouts,
  onAnswerHangout,
  onLogHangout,
  onJumpToMessage,
  onPlan,
  onSearch,
  onOpenProfile,
  onShowMembers,
  members,
  sharedInterests,
  isCore,
  isArchived,
  isBlocked,
  onReport,
  actions,
  mediaChatKey,
  getAuthHeaders,
  getE2eeV2Session,
  onClose,
}: {
  connection: ConnectionRecord;
  isGroupClique: boolean;
  title: string;
  subtitle: string | null;
  peerUserId?: string;
  currentUserId: string;
  messages: Message[];
  mute: ChatMute | null;
  onSetMuted: (muted: boolean, durationMs: number | null) => Promise<void>;
  pins: MessagePin[];
  onUnpin: (messageId: string) => void;
  scheduled: ScheduledItem[];
  onCancelScheduled: (id: string) => Promise<void>;
  hangouts: PendingHangout[];
  onAnswerHangout: (id: string, confirm: boolean) => Promise<void>;
  onLogHangout: () => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
  onPlan: () => void;
  onSearch: () => void;
  onOpenProfile?: (userId: string) => void;
  onShowMembers?: () => void;
  members: { userId: string; label: string; avatarUrl?: string | null }[];
  sharedInterests: string[];
  isCore: boolean;
  isArchived: boolean;
  isBlocked: boolean;
  onReport: () => void;
  actions: ConversationActions;
  mediaChatKey?: DerivedKeys | ArrayBuffer | null;
  getAuthHeaders?: () => Promise<HeadersInit>;
  getE2eeV2Session?: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firstName = title.split(/\s+/)[0] || title;

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const shared = useMemo(() => {
    const plans: { message: Message; plan: HangoutPlan }[] = [];
    const media: Message[] = [];
    const links: { id: string; url: string }[] = [];
    const files: { id: string; name: string }[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const meta = m.metadata as Record<string, unknown> | undefined;
      if (m.message_type === 'image' && meta?.disposable_roll !== true && meta?.gif == null) {
        if (media.length < MEDIA_LIMIT) media.push(m);
      } else if (m.message_type === 'file') {
        const env = tryDecodeEnvelope(m.content.trim()) ?? tryDecodeV2AttachmentDescriptor(m.content.trim());
        if (env && files.length < LIST_LIMIT) files.push({ id: m.id, name: env.name });
      } else if (m.message_type === 'text') {
        const plan = parsePlan(m.metadata);
        if (plan) {
          if (!planIsOver(plan)) plans.push({ message: m, plan });
        } else if (links.length < LIST_LIMIT) {
          for (const url of extractLinks(m.content)) if (links.length < LIST_LIMIT) links.push({ id: m.id, url });
        }
      }
    }
    plans.sort((a, b) => a.plan.startsAt - b.plan.startsAt);
    return { plans, media, links, files };
  }, [messages]);

  const run = async (key: string, task: () => Promise<void>, failure: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await task();
    } catch {
      setNotice(failure);
    } finally {
      setBusy(null);
    }
  };
  const setMute = (muted: boolean, ms: number | null) =>
    void run('mute', () => onSetMuted(muted, ms), 'Couldn’t change notifications. Try again.');

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-testid="conversation-details">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-hairline px-4">
        <h2 className="type-headline text-fg">Details</h2>
        <IconButton icon={X} aria-label="Close details" onClick={onClose} />
      </div>

      <div className="chat-thread-scroll min-h-0 flex-1 pb-6">
        <div className="flex flex-col items-center px-4 pt-6 text-center">
          {isGroupClique ? (
            <span className="flex size-[72px] items-center justify-center rounded-full bg-selection text-accent">
              <Users size={32} aria-hidden />
            </span>
          ) : (
            <Avatar seed={peerUserId ?? connection.id} name={title} src={connection.avatarUrl} size={72} />
          )}
          <p className="type-title-3 mt-3 max-w-full truncate text-fg" title={title}>
            {title}
          </p>
          {subtitle ? <p className="type-meta mt-0.5 text-fg-tertiary">{subtitle}</p> : null}
        </div>

        <div className="mt-4 flex gap-1 px-3">
          {isGroupClique ? (
            <Quick icon={Users} label="Members" onClick={onShowMembers} />
          ) : (
            <Quick icon={User} label="Profile" onClick={peerUserId && onOpenProfile ? () => onOpenProfile(peerUserId) : undefined} />
          )}
          {mute ? (
            <Quick icon={BellOff} label="Unmute" pressed onClick={() => setMute(false, null)} />
          ) : (
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy === 'mute'}
                  className="press group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md py-2 text-fg hover:bg-hover"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-fill-subtle text-accent">
                    <Bell size={18} aria-hidden />
                  </span>
                  <span className="type-badge font-semibold">Mute</span>
                </button>
              </MenuTrigger>
              <MenuContent align="center">
                {MUTE_OPTIONS.map((o) => (
                  <MenuItem key={o.label} onSelect={() => setMute(true, o.ms)}>
                    {o.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          )}
          <Quick icon={Search} label="Search" onClick={onSearch} />
          <Quick icon={CalendarPlus} label="Plan" onClick={onPlan} />
        </div>
        {mute ? <p className="type-meta mt-2 text-center text-fg-tertiary">{muteStatusLabel(mute)}</p> : null}

        {notice ? (
          <div className="px-4 pt-4">
            <InlineNotice variant="destructive" live>
              {notice}
            </InlineNotice>
          </div>
        ) : null}

        {!isGroupClique && sharedInterests.length > 0 ? (
          <Section title="Shared interests">
            <ul className="flex flex-wrap gap-1.5">
              {sharedInterests.map((t) => (
                <li key={t} className="type-meta rounded-pill bg-selection px-2.5 py-1 font-semibold text-accent">
                  {t}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {hangouts.length > 0 || !isGroupClique ? (
          <Section title="Hangouts">
            {hangouts.length === 0 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="type-meta text-fg-secondary">Spent time together without tapping phones? Log it and they confirm.</p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Handshake}
                  loading={busy === 'log-hangout'}
                  onClick={() => void run('log-hangout', onLogHangout, 'Couldn’t log the hangout. Try again.')}
                >
                  Log
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {hangouts.map((h) => (
                  <li key={h.id} className="rounded-md bg-surface p-3">
                    <p className="type-body-strong text-fg">
                      {h.location_name ?? 'Hangout'} · {new Date(h.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {h.confirmed_by_me ? (
                      <p className="type-meta mt-1 text-fg-tertiary">Waiting for {firstName} to confirm.</p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" loading={busy === h.id} onClick={() => void run(h.id, () => onAnswerHangout(h.id, true), 'Couldn’t confirm. Try again.')}>
                          We were together
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busy === h.id} onClick={() => void run(h.id, () => onAnswerHangout(h.id, false), 'Couldn’t decline. Try again.')}>
                          Not us
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {shared.plans.length > 0 ? (
          <Section title="Plans">
            <ListGroup>
              {shared.plans.map(({ message, plan }) => (
                <ListRow
                  key={message.id}
                  title={plan.title}
                  subtitle={`${planWhenText(plan)}${plan.placeName ? ` · ${plan.placeName}` : ''}`}
                  onClick={() => onJumpToMessage(message.id)}
                />
              ))}
            </ListGroup>
          </Section>
        ) : null}

        {pins.length > 0 ? (
          <Section title="Pinned">
            <ul className="space-y-1">
              {pins.map((pin) => {
                const message = byId.get(pin.message_id);
                const who = pin.pinned_by === currentUserId ? 'You' : isGroupClique ? 'Someone' : firstName;
                return (
                  <li key={pin.message_id} className="flex items-center gap-1 rounded-md hover:bg-hover">
                    <button type="button" onClick={() => onJumpToMessage(pin.message_id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                      <span className="type-body line-clamp-2 text-fg">{message ? previewLabelForMessage(message) : 'Pinned message'}</span>
                      <span className="type-meta block text-fg-tertiary">Pinned by {who}</span>
                    </button>
                    <IconButton icon={PinOff} size="sm" aria-label="Unpin message" onClick={() => onUnpin(pin.message_id)} />
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {scheduled.length > 0 ? (
          <Section title="Scheduled">
            <ul className="space-y-2">
              {scheduled.map((item) => (
                <li key={item.id} className="rounded-md bg-surface p-3">
                  <p className="type-meta tabular font-semibold text-fg-secondary">{formatShort(item.sendAt)}</p>
                  <p className="type-body mt-1 line-clamp-3 text-fg">{item.text}</p>
                  <Button
                    size="sm"
                    variant="plain"
                    className="mt-1 -ml-2 text-destructive"
                    loading={busy === item.id}
                    onClick={() => void run(item.id, () => onCancelScheduled(item.id), 'Couldn’t cancel. It may have already been sent.')}
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {shared.media.length > 0 ? (
          <Section title="Media">
            <div className="grid grid-cols-3 gap-1">
              {shared.media.map((m) => (
                <MediaThumb
                  key={m.id}
                  message={m}
                  mediaChatKey={mediaChatKey}
                  getAuthHeaders={getAuthHeaders}
                  getE2eeV2Session={getE2eeV2Session}
                  onOpen={() => onJumpToMessage(m.id)}
                />
              ))}
            </div>
          </Section>
        ) : null}

        {shared.links.length > 0 ? (
          <Section title="Links">
            <ul className="space-y-0.5">
              {shared.links.map((l, i) => (
                <li key={`${l.id}-${i}`}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="type-meta flex min-h-10 items-center gap-2 rounded-md px-2 text-accent hover:bg-hover"
                  >
                    <ExternalLink size={14} className="shrink-0" aria-hidden />
                    <span className="truncate">{l.url.replace(/^https?:\/\//, '')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {shared.files.length > 0 ? (
          <Section title="Files">
            <ul className="space-y-0.5">
              {shared.files.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToMessage(f.id)}
                    className="type-meta flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-fg hover:bg-hover"
                  >
                    <FileText size={14} className="shrink-0 text-fg-tertiary" aria-hidden />
                    <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {isGroupClique && members.length > 0 ? (
          <Section title={`${members.length} members`}>
            <ul>
              {members.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    onClick={() => onOpenProfile?.(m.userId)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-hover"
                  >
                    <Avatar seed={m.userId} name={m.label} src={m.avatarUrl ?? null} size={32} />
                    <span className="type-body min-w-0 flex-1 truncate text-fg">{m.userId === currentUserId ? `${m.label} (you)` : m.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <div className="px-4 pt-6">
          {isGroupClique ? (
            <ListGroup>
              <ListRow icon={LogOut} title="Leave group" destructive onClick={actions.leaveGroup} />
              {actions.canDeleteGroup ? <ListRow icon={Trash2} title="Delete group" destructive onClick={actions.deleteGroup} /> : null}
            </ListGroup>
          ) : (
            <ListGroup>
              {isArchived ? (
                <ListRow icon={ArchiveRestore} title={actions.unarchiveLabel} onClick={actions.unarchive} />
              ) : (
                <ListRow icon={Archive} title="Archive" onClick={actions.archive} />
              )}
              <ListRow icon={Flag} title={`Report ${firstName}`} destructive onClick={onReport} />
              {isBlocked ? (
                <ListRow icon={ShieldOff} title={`Unblock ${firstName}`} onClick={actions.unblock} />
              ) : (
                <ListRow icon={Shield} title={`Block ${firstName}`} destructive onClick={() => void actions.block()} />
              )}
              <ListRow icon={UserMinus} title="Remove connection" destructive onClick={() => void actions.remove()} />
            </ListGroup>
          )}
          {isCore && !isGroupClique ? <p className="type-meta mt-2 px-1 text-fg-tertiary">{firstName} is in your Core.</p> : null}
        </div>
      </div>
    </div>
  );
}
