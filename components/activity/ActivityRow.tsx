'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, CalendarDays, Check, Flame, Hand, Heart, type LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { toast } from '@/components/ds/Toast';
import { activityHref } from '@/lib/activity/activityHref';
import { activityKind, type ActivityKind } from '@/lib/activity/activityView';
import { authedJson } from '@/lib/api/authedJson';
import { cn } from '@/lib/cn';
import { formatRelativeShort } from '@/lib/home/format';

export type ActivityRowItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  created_at: string;
  actor: { id: string; name: string; avatar_url: string | null } | null;
};

const BADGE: Record<ActivityKind, { icon: LucideIcon; cls: string }> = {
  reaction: { icon: Heart, cls: 'text-heart' },
  connection: { icon: Check, cls: 'text-online' },
  event: { icon: CalendarDays, cls: 'text-accent' },
  wave: { icon: Hand, cls: 'text-warning-text' },
  streak: { icon: Flame, cls: 'text-warning-text' },
  other: { icon: Bell, cls: 'text-fg-secondary' },
};

/**
 * One Activity row (spec §7.9): avatar with a kind badge, title with its age, a body line; the
 * whole row links. A pending request gets Accept / Ignore inline.
 */
export function ActivityRow({
  item,
  nowMs,
  isNew,
  pendingRequestId,
  compact,
}: {
  item: ActivityRowItem;
  nowMs: number;
  isNew?: boolean;
  /** Connection id of a prior request still waiting on the viewer. */
  pendingRequestId?: string | null;
  compact?: boolean;
}) {
  const [answered, setAnswered] = useState<'accept' | 'decline' | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const kind = BADGE[activityKind(item.type)];
  const Icon = kind.icon;

  const respond = async (action: 'accept' | 'decline') => {
    if (!pendingRequestId) return;
    setBusy(action);
    try {
      await authedJson('/api/connections/prior/respond', {
        method: 'POST',
        body: { connection_id: pendingRequestId, action },
        fallback: 'Couldn’t answer that request.',
      });
      setAnswered(action);
      toast.success(action === 'accept' ? 'Request accepted' : 'Request ignored');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t answer that request.');
    } finally {
      setBusy(null);
    }
  };

  const badge = (
    <span className={cn('flex size-5 items-center justify-center', kind.cls)}>
      <Icon size={12} strokeWidth={2.5} aria-hidden fill={activityKind(item.type) === 'reaction' ? 'currentColor' : 'none'} />
    </span>
  );

  return (
    <li className={cn('relative', compact ? 'px-2' : 'px-4')}>
      <div className="flex items-start gap-3 py-3">
        <span className="shrink-0">
          {item.actor ? (
            <Avatar seed={item.actor.id} name={item.actor.name} src={item.actor.avatar_url} size={40} badge={badge} />
          ) : (
            <span className="relative flex size-10 items-center justify-center rounded-full bg-fill-subtle">
              <Icon size={18} aria-hidden className={kind.cls} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <Link href={activityHref(item)} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            <span className={cn('type-body block text-fg', isNew && 'font-semibold')}>
              {item.title} <span className="type-meta tabular font-normal text-fg-tertiary">{formatRelativeShort(item.created_at, nowMs)}</span>
            </span>
          </Link>
          {item.body ? <span className="type-meta line-clamp-2 block text-fg-secondary">{item.body}</span> : null}
          {pendingRequestId && !answered ? (
            <span className="relative z-10 mt-2 flex gap-2">
              <Button size="sm" variant="primary" loading={busy === 'accept'} disabled={busy != null} onClick={() => void respond('accept')}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" loading={busy === 'decline'} disabled={busy != null} onClick={() => void respond('decline')}>
                Ignore
              </Button>
            </span>
          ) : answered ? (
            <span className="type-meta mt-1 block text-fg-tertiary">{answered === 'accept' ? 'Accepted' : 'Ignored'}</span>
          ) : null}
        </span>
        {isNew ? <span aria-label="New" className="mt-2 size-2 shrink-0 rounded-full bg-live" /> : null}
      </div>
    </li>
  );
}
