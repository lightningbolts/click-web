'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  BellOff,
  Bell,
  CalendarDays,
  CalendarPlus,
  Clock,
  Handshake,
  Pin,
  PinOff,
  Users,
  X,
  UserRound,
} from 'lucide-react';
import type { Message } from '@/lib/chat/types';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import { MUTE_OPTIONS, muteStatusLabel, type ChatMute, type MessagePin } from '@/lib/chat/conversationApi';
import { parsePlan, planIsOver, planWhenText, type HangoutPlan } from '@/lib/chat/plans';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import type { ScheduledItem } from './useConversationExtras';
import type { PendingHangout } from '@/lib/chat/conversationApi';
import { cn } from '@/lib/cn';

function Section({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-border-hard px-4 py-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <span className="text-on-surface-variant" aria-hidden>
            {icon}
          </span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-on-surface-variant">{children}</p>;
}

const rowButton =
  'flex w-full min-w-0 items-start gap-2 rounded-[8px] px-2 py-2 text-left hover:bg-surface-container-low focus-visible:bg-surface-container-low';

function formatShort(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The conversation's contextual side panel (desktop: a column beside the thread; narrower
 * windows: a sheet over it). Everything here already exists on iOS, where it lives in the
 * profile and conversation menus: notifications, pinned messages, plans, scheduled
 * messages, and hangouts waiting for a confirmation.
 */
export function ConversationDetailsPanel({
  connection,
  isGroupClique,
  title,
  subtitle,
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
  onOpenProfile,
  onShowMembers,
  onClose,
}: {
  connection: ConnectionRecord;
  isGroupClique: boolean;
  title: string;
  subtitle: string | null;
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
  onOpenProfile?: () => void;
  onShowMembers?: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const upcomingPlans = useMemo(() => {
    const out: { message: Message; plan: HangoutPlan }[] = [];
    for (const message of messages) {
      const plan = message.message_type === 'text' ? parsePlan(message.metadata) : null;
      if (plan && !planIsOver(plan)) out.push({ message, plan });
    }
    return out.sort((a, b) => a.plan.startsAt - b.plan.startsAt);
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface" data-testid="conversation-details">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-base font-bold text-on-surface">Details</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
          aria-label="Close details"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="chat-thread-scroll min-h-0 flex-1">
        <div className="flex flex-col items-center px-4 pb-4 pt-1 text-center">
          {isGroupClique ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-on-primary">
              <Users className="h-7 w-7" aria-hidden />
            </div>
          ) : (
            <ConnectionPeerAvatar label={title} imageUrl={connection.avatarUrl} size="xl" />
          )}
          <p className="mt-3 max-w-full truncate text-lg font-bold text-on-surface" title={title}>
            {title}
          </p>
          {subtitle ? <p className="mt-0.5 text-sm text-on-surface-variant">{subtitle}</p> : null}
          {onOpenProfile || onShowMembers ? (
            <button
              type="button"
              onClick={isGroupClique ? onShowMembers : onOpenProfile}
              className="fc-btn-secondary mt-3 inline-flex h-9 items-center gap-2 px-3 text-sm"
            >
              {isGroupClique ? <Users className="h-4 w-4" aria-hidden /> : <UserRound className="h-4 w-4" aria-hidden />}
              {isGroupClique ? 'Members' : 'View profile'}
            </button>
          ) : null}
        </div>

        {notice ? (
          <p role="alert" className="mx-4 mb-3 rounded-[8px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {notice}
          </p>
        ) : null}

        <Section title="Notifications" icon={mute ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}>
          <p className="mb-2 text-sm text-on-surface-variant">{muteStatusLabel(mute)}</p>
          {mute ? (
            <button
              type="button"
              disabled={busy === 'mute'}
              onClick={() => void run('mute', () => onSetMuted(false, null), "Couldn't change notifications. Try again.")}
              className="fc-btn-secondary inline-flex h-9 items-center px-3 text-sm disabled:opacity-40"
            >
              Unmute
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {MUTE_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  disabled={busy === 'mute'}
                  onClick={() =>
                    void run('mute', () => onSetMuted(true, option.ms), "Couldn't change notifications. Try again.")
                  }
                  className="inline-flex h-8 items-center rounded-full border border-border-hard px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-40"
                >
                  {option.label.replace(/^For /, '').replace('Until I turn it back on', 'Until I turn it on')}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Plans"
          icon={<CalendarDays className="h-4 w-4" />}
          action={
            <button
              type="button"
              onClick={onPlan}
              className="inline-flex h-8 items-center gap-1 rounded-[8px] px-2 text-xs font-bold text-primary hover:bg-primary-container"
            >
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
              Plan
            </button>
          }
        >
          {upcomingPlans.length === 0 ? (
            <EmptyLine>No upcoming plans in this chat.</EmptyLine>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {upcomingPlans.map(({ message, plan }) => (
                <li key={message.id}>
                  <button type="button" className={rowButton} onClick={() => onJumpToMessage(message.id)}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-on-surface">{plan.title}</span>
                      <span className="block text-xs text-on-surface-variant">
                        {planWhenText(plan)}
                        {plan.placeName ? ` · ${plan.placeName}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Pinned" icon={<Pin className="h-4 w-4" />}>
          {pins.length === 0 ? (
            <EmptyLine>Pin a message from its menu to keep it here.</EmptyLine>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {pins.map((pin) => {
                const message = byId.get(pin.message_id);
                const text = message ? previewLabelForMessage(message) : 'Pinned message';
                const who = pin.pinned_by === currentUserId ? 'You' : isGroupClique ? 'Someone' : title.split(/\s+/)[0];
                return (
                  <li key={pin.message_id} className="group flex items-start gap-1">
                    <button type="button" className={rowButton} onClick={() => onJumpToMessage(pin.message_id)}>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm text-on-surface">{text}</span>
                        <span className="block text-xs text-on-surface-variant">Pinned by {who}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnpin(pin.message_id)}
                      className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-on-surface-variant opacity-100 hover:bg-surface-container-low hover:text-on-surface md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                      aria-label="Unpin message"
                    >
                      <PinOff className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Scheduled" icon={<Clock className="h-4 w-4" />}>
          {scheduled.length === 0 ? (
            <EmptyLine>Nothing scheduled. Use the clock next to Send to schedule a message.</EmptyLine>
          ) : (
            <ul className="space-y-2">
              {scheduled.map((item) => (
                <li key={item.id} className="rounded-[12px] border border-border-hard p-3">
                  <p className="text-xs font-semibold text-on-surface-variant">{formatShort(item.sendAt)}</p>
                  <p className="mt-1 line-clamp-3 text-sm text-on-surface">{item.text}</p>
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() =>
                      void run(item.id, () => onCancelScheduled(item.id), "Couldn't cancel. It may have already been sent.")
                    }
                    className="mt-2 text-xs font-bold text-error hover:underline disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {!isGroupClique ? (
          <Section title="Hangouts" icon={<Handshake className="h-4 w-4" />}>
            {hangouts.length === 0 ? (
              <>
                <EmptyLine>Spent time together without tapping phones? Log it and they confirm.</EmptyLine>
                <button
                  type="button"
                  disabled={busy === 'log-hangout'}
                  onClick={() =>
                    void run('log-hangout', onLogHangout, "Couldn't log the hangout. Try again.")
                  }
                  className="fc-btn-secondary mt-2 inline-flex h-9 items-center px-3 text-sm disabled:opacity-40"
                >
                  We hung out
                </button>
              </>
            ) : (
              <ul className="space-y-2">
                {hangouts.map((h) => (
                  <li key={h.id} className="rounded-[12px] border border-border-hard p-3">
                    <p className="text-sm font-semibold text-on-surface">
                      {h.location_name ?? 'Hangout'} · {new Date(h.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {h.confirmed_by_me ? (
                      <p className="mt-1 text-xs text-on-surface-variant">Waiting for {title.split(/\s+/)[0]} to confirm.</p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busy === h.id}
                          onClick={() => void run(h.id, () => onAnswerHangout(h.id, true), "Couldn't confirm. Try again.")}
                          className="fc-btn-primary inline-flex h-8 items-center px-3 text-xs disabled:opacity-40"
                        >
                          We were together
                        </button>
                        <button
                          type="button"
                          disabled={busy === h.id}
                          onClick={() => void run(h.id, () => onAnswerHangout(h.id, false), "Couldn't decline. Try again.")}
                          className={cn('fc-btn-secondary inline-flex h-8 items-center px-3 text-xs disabled:opacity-40')}
                        >
                          Not us
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
