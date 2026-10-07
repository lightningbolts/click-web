'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Camera,
  CircleSlash,
  Flag,
  Hand,
  MessageCircle,
  MoreHorizontal,
  QrCode,
  Star,
  UserMinus,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { Card } from '@/components/ds/Card';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { EmptyState } from '@/components/ds/EmptyState';
import { IconButton } from '@/components/ds/IconButton';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ds/Menu';
import { Skeleton, SkeletonText } from '@/components/ds/Skeleton';
import { StatusPill } from '@/components/ds/StatusPill';
import { toast } from '@/components/ds/Toast';
import { ReportDialog } from '@/components/clicks/ClickDialogs';
import { useAuth } from '@/lib/AuthContext';
import { homeRequest } from '@/lib/home/postHomeAction';
import { threadHref } from '@/lib/shell/appNav';
import { generateCardVisual } from '@/lib/ui/generateCardVisual';
import { cn } from '@/lib/cn';
import { PersonTabs } from './PersonTabs';
import { TogetherCard } from './TogetherCard';
import { useClickDrop } from './useClickDrop';
import { usePersonProfile } from './usePersonProfile';

function ActionTile({
  icon: Icon,
  label,
  href,
  onClick,
  pressed,
  busy,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  pressed?: boolean;
  busy?: boolean;
}) {
  const cls = cn(
    'press flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg bg-surface px-2 py-3 text-fg transition-colors duration-[var(--d-fast)] hover:bg-hover',
    'disabled:opacity-50 dark:shadow-[inset_0_0_0_1px_var(--hairline)]',
    pressed && 'text-accent',
  );
  const body = (
    <>
      <Icon size={20} aria-hidden fill={pressed ? 'currentColor' : 'none'} />
      <span className="type-meta font-semibold">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={pressed} disabled={busy} aria-busy={busy}>
      {body}
    </button>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy aria-label="Loading profile" className="container-page grid gap-8 py-6 max-lg:*:max-w-[640px] md:py-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col items-center gap-3 lg:items-start">
        <Skeleton rounded="full" className="size-24" shimmer />
        <Skeleton className="h-7 w-48" />
        <SkeletonText lines={2} className="w-64" />
        <div className="mt-4 grid w-full grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} rounded="lg" className="h-[72px]" shimmer />
          ))}
        </div>
      </div>
      <Skeleton rounded="lg" className="h-64" shimmer />
    </div>
  );
}

/** Someone you've met (spec §7.3): who they are, what you share, and your history together. */
export function PersonProfile({ userId }: { userId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const p = usePersonProfile(userId, currentUserId);
  const { inputRef: dropInputRef, status: dropStatus, busy: dropBusy, pick: pickDrop, onFile: onDropFile } = useClickDrop(
    p.connectionId,
    currentUserId,
  );
  const [confirm, confirmNode] = useConfirm();
  const [busy, setBusy] = useState<'wave' | 'core' | 'hangout' | 'prior' | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (p.error) {
    return (
      <div className="container-narrow py-16">
        <EmptyState
          icon={UserRoundX}
          title={p.error.status === 404 ? 'This profile isn’t available' : 'Couldn’t load this profile'}
          body={p.error.status === 404 ? 'They may have deleted their account.' : p.error.message}
          action={
            <Button variant="secondary" onClick={() => void p.mutate()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }
  if (p.isLoading || !p.data) return <ProfileSkeleton />;

  const { data, connectionId, stats } = p;
  const connected = p.isConnected && !!connectionId;

  const wave = () =>
    run('wave', async () => {
      const r = await homeRequest<{ already_waved_today?: boolean }>('POST', `/api/connections/${encodeURIComponent(connectionId!)}/wave`);
      toast(r.already_waved_today ? `You already waved at ${p.firstName} today` : `Waved at ${p.firstName} 👋`);
    });

  const toggleCore = () =>
    run('core', async () => {
      const next = !p.isCore;
      await p.mutateCore(
        async (cur) => {
          if (next) await homeRequest('POST', '/api/connections/core', { connection_id: connectionId });
          else await homeRequest('DELETE', `/api/connections/core?connection_id=${encodeURIComponent(connectionId!)}`);
          const ids = new Set(cur?.core ?? []);
          if (next) ids.add(connectionId!);
          else ids.delete(connectionId!);
          return { core: [...ids] };
        },
        { revalidate: false },
      );
      toast(next ? `${p.firstName} is in your Core` : `Removed ${p.firstName} from Core`);
    });

  const logHangout = () =>
    run('hangout', async () => {
      await homeRequest('POST', '/api/hangouts', { connection_id: connectionId });
      toast(`Logged. ${p.firstName} will be asked to confirm.`);
    });

  const respondPrior = (action: 'accept' | 'decline') =>
    run('prior', async () => {
      await homeRequest('POST', '/api/connections/prior/respond', { connection_id: connectionId, action });
      await p.mutate();
    });

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${p.name}?`,
      message: 'Your conversation and this Click are removed. They aren’t notified.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    await run('core', async () => {
      await homeRequest('DELETE', `/api/connections?connectionId=${encodeURIComponent(connectionId!)}`);
      toast(`Removed ${p.name}`);
      router.push('/clicks');
    });
  };

  const block = async () => {
    const ok = await confirm({
      title: `Block ${p.name}?`,
      message: 'They can’t message you or see you on Click, and this Click is removed. They aren’t notified.',
      confirmLabel: 'Block',
      destructive: true,
    });
    if (!ok) return;
    await run('core', async () => {
      await homeRequest('POST', '/api/safety/block', { blocked_id: userId });
      if (connectionId) await homeRequest('DELETE', `/api/connections?connectionId=${encodeURIComponent(connectionId)}`).catch(() => undefined);
      toast(`Blocked ${p.name}`);
      router.push('/clicks');
    });
  };

  const relationship = p.pendingPrior
    ? 'Waiting for confirmation'
    : p.isPrior
      ? 'Added from your contacts'
      : stats.firstMetIso
        ? `Clicked ${new Date(stats.firstMetIso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
        : null;

  // Not connected: an aura from their interests behind the avatar (spec §7.3).
  const aura = !connected ? generateCardVisual(data.tags.join(',') || userId).gradient : null;

  return (
    // One phone-width column (iOS proportions) until there's room for identity beside history.
    <div className="container-page grid gap-8 py-6 max-lg:*:max-w-[640px] md:py-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
      <aside className="lg:sticky lg:top-[calc(var(--topbar-height)+24px)] lg:self-start">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="relative">
            {aura ? (
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 size-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-2xl"
                style={{ background: `radial-gradient(circle, ${aura[0]} 0%, ${aura[1] ?? aura[0]} 55%, transparent 72%)` }}
              />
            ) : null}
            <Avatar seed={userId} name={p.name} src={data.user.image} size={96} className="relative" />
          </div>
          <div className="mt-4 flex w-full items-start justify-center gap-2 lg:justify-between">
            <h1 className="type-title-2 text-fg">{p.name}</h1>
            {!p.isSelf ? (
              <Menu>
                <MenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} aria-label={`More for ${p.name}`} size="sm" />
                </MenuTrigger>
                <MenuContent align="end">
                  {connectionId ? (
                    <MenuItem icon={UserMinus} onSelect={() => void remove()}>
                      Remove connection
                    </MenuItem>
                  ) : null}
                  {connectionId ? (
                    <MenuItem icon={Flag} onSelect={() => setReportOpen(true)}>
                      Report…
                    </MenuItem>
                  ) : null}
                  <MenuSeparator />
                  <MenuItem icon={CircleSlash} destructive onSelect={() => void block()}>
                    Block…
                  </MenuItem>
                </MenuContent>
              </Menu>
            ) : null}
          </div>
          {data.user.bio?.trim() ? <p className="type-body mt-1 max-w-[44ch] text-fg-secondary">{data.user.bio.trim()}</p> : null}
          {relationship ? <p className="type-meta mt-2 text-fg-tertiary">{relationship}</p> : null}
          {p.isCore || p.freeNow ? (
            <div className="mt-3 flex gap-2">
              {p.isCore ? (
                <StatusPill variant="tinted" icon={Star}>
                  Core
                </StatusPill>
              ) : null}
              {p.freeNow ? <StatusPill variant="success">Free now</StatusPill> : null}
            </div>
          ) : null}
        </div>

        {p.canRespondPrior ? (
          <Card className="mt-6" compact>
            <p className="type-body text-fg">{p.firstName} added you from their contacts. Do you know each other?</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={busy === 'prior'} onClick={() => void respondPrior('accept')}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" disabled={busy === 'prior'} onClick={() => void respondPrior('decline')}>
                Decline
              </Button>
            </div>
          </Card>
        ) : null}

        {connected ? (
          <div className="mt-6 grid grid-cols-4 gap-2">
            <ActionTile icon={MessageCircle} label="Message" href={threadHref(connectionId!)} />
            <ActionTile icon={Hand} label="Wave" onClick={() => void wave()} busy={busy === 'wave'} />
            <ActionTile icon={Star} label="Core" pressed={p.isCore} onClick={() => void toggleCore()} busy={busy === 'core'} />
            <ActionTile icon={Camera} label="Click Drop" onClick={pickDrop} busy={dropBusy} />
            <input
              ref={dropInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="environment"
              className="hidden"
              onChange={(e) => void onDropFile(e)}
            />
          </div>
        ) : null}
        {dropStatus === 'done' ? (
          <InlineNotice variant="info" live className="mt-3">
            Dropped into your shared roll. It develops for both of you later.
          </InlineNotice>
        ) : dropStatus === 'error' ? (
          <InlineNotice variant="destructive" live className="mt-3">
            Couldn’t drop that photo. Try again.
          </InlineNotice>
        ) : null}

        {p.sharedTags.length > 0 || p.otherTags.length > 0 ? (
          <Card as="section" aria-labelledby="common-ground" className="mt-6">
            <h2 id="common-ground" className="type-headline text-fg">
              {p.sharedTags.length > 0 ? 'Common ground' : 'Interests'}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {p.sharedTags.map((t) => (
                <li key={`s:${t}`} className="inline-flex h-[30px] items-center rounded-pill bg-selection px-3 text-[13px] font-semibold leading-[18px] text-accent">
                  {t}
                </li>
              ))}
              {p.otherTags.map((t) => (
                <li
                  key={`o:${t}`}
                  className="inline-flex h-[30px] items-center rounded-pill px-3 text-[13px] font-semibold leading-[18px] text-fg-secondary shadow-[inset_0_0_0_1px_var(--hairline)]"
                >
                  {t}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </aside>

      <div className="min-w-0">
        {p.isSelf ? (
          <Card>
            <p className="type-body text-fg">This is how people you’ve Clicked with see you.</p>
            <Button variant="secondary" size="sm" className="mt-3" href="/settings">
              Edit profile
            </Button>
          </Card>
        ) : p.pendingPrior ? (
          <Card>
            <EmptyState
              icon={Hand}
              title="Waiting for confirmation"
              body={p.canRespondPrior ? 'Accept to add each other on Click.' : `Once ${p.firstName} confirms, you’ll see your history together here.`}
            />
          </Card>
        ) : !connected ? (
          <Card>
            <EmptyState
              icon={Hand}
              title="You haven’t Clicked yet"
              body="Meet in person and tap phones in the Click app. That’s how every Click starts."
              action={
                <Button variant="tinted" icon={QrCode} href="/add">
                  Show my QR
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {stats.hangouts > 0 ? (
              <TogetherCard stats={stats} firstName={p.firstName} onLogHangout={() => void logHangout()} logging={busy === 'hangout'} />
            ) : null}
            <PersonTabs
              userId={userId}
              currentUserId={currentUserId}
              connectionId={connectionId}
              encounters={p.encounters}
              shared={p.shared}
              isPrior={p.isPrior}
            />
          </div>
        )}
      </div>

      {connectionId ? (
        <ReportDialog
          name={p.name}
          open={reportOpen}
          onOpenChange={setReportOpen}
          onSubmit={async (reason) => {
            try {
              await homeRequest('POST', '/api/safety/report', { connection_id: connectionId, reason });
              toast('Report sent. Thank you.');
              return true;
            } catch {
              return false;
            }
          }}
        />
      ) : null}
      {confirmNode}
    </div>
  );
}
