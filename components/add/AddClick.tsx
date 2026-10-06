'use client';

import { useState, useSyncExternalStore } from 'react';
import { MapPin, ScanLine, ShieldCheck, Smartphone, UserSearch, Users, Waves, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ds/Button';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { useAuth } from '@/lib/AuthContext';
import { APP_CONFIG } from '@/lib/config';
import { useShellBootstrap } from '@/lib/shell/useShellBootstrap';
import { FindFriendsSheet } from './FindFriendsSheet';
import { MyQrCard } from './MyQrCard';
import { ScanCodeSheet, canScanCodes } from './ScanCodeSheet';

const noop = () => () => {};

function QuickAction({ icon: Icon, label, onClick, href }: { icon: LucideIcon; label: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <span className="flex size-16 items-center justify-center rounded-full bg-surface text-fg transition-colors duration-[var(--d-fast)] group-hover:bg-hover dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <Icon size={24} aria-hidden />
      </span>
      <span className="type-meta font-semibold text-fg">{label}</span>
    </>
  );
  const cls = 'group press flex flex-col items-center gap-2 text-center';
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/**
 * Add Click (spec §7.4): your QR for someone with the app to scan, and an honest note that
 * tapping phones only works in the app.
 */
export function AddClick() {
  const { user, profileImageUrl } = useAuth();
  const { bootstrap } = useShellBootstrap(null, Boolean(user));
  if (!user) return null;
  return (
    <AddClickView
      userId={user.id}
      name={bootstrap?.viewer.name || user.email?.split('@')[0] || 'You'}
      avatarUrl={bootstrap?.viewer.avatarUrl ?? profileImageUrl}
    />
  );
}

export function AddClickView({ userId, name, avatarUrl }: { userId: string; name: string; avatarUrl: string | null }) {
  const scan = useSyncExternalStore(noop, canScanCodes, () => false);
  const [scanOpen, setScanOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  return (
    <div className="container-page py-6 md:py-10">
      <h1 className="type-title-1 text-fg">Add Click</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-2 md:gap-10">
        <MyQrCard userId={userId} name={name} avatarUrl={avatarUrl} />

        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="tap-title" className="flex flex-col items-center rounded-lg bg-surface-raised p-6 text-center">
            <span className="flex size-[120px] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--action)_14%,transparent)]">
              <span className="flex size-[88px] items-center justify-center rounded-full bg-action text-white">
                <Waves size={40} aria-hidden />
              </span>
            </span>
            <h2 id="tap-title" className="type-title-3 mt-4 text-fg">
              Tap to Connect needs the app
            </h2>
            <p className="type-body mt-2 max-w-[40ch] text-fg-secondary">
              Tap phones to Click. Bluetooth, sound and location confirm you’re really together, so it only works in the Click app.
            </p>
            <Button variant="plain" icon={Smartphone} className="mt-3" href={APP_CONFIG.ios_store_url} target="_blank" rel="noopener noreferrer">
              Get the app
            </Button>
          </section>

          <section aria-label="Quick actions" className="grid grid-cols-4 gap-2">
            {scan ? <QuickAction icon={ScanLine} label="Scan" onClick={() => setScanOpen(true)} /> : null}
            <QuickAction icon={Users} label="New group" href="/clicks?new=group" />
            <QuickAction icon={UserSearch} label="Find friends" onClick={() => setFindOpen(true)} />
            <QuickAction icon={MapPin} label="Join a hub" href="/clicks?filter=hubs" />
          </section>

          <ListGroup header="How Clicking works">
            <ListRow icon={Smartphone} title="Meet in person" subtitle="Open Click on both phones and tap them together." href="/#how-it-works" />
            <ListRow icon={ShieldCheck} title="Proof you were there" subtitle="Nearby signals confirm it’s real. No one can add you from afar." href="/#how-it-works" />
            <ListRow icon={Waves} title="Pick up where you left off" subtitle="Each Click remembers where and when you met." href="/#how-it-works" />
          </ListGroup>
        </div>
      </div>

      {scan ? <ScanCodeSheet open={scanOpen} onOpenChange={setScanOpen} /> : null}
      <FindFriendsSheet open={findOpen} onOpenChange={setFindOpen} />
    </div>
  );
}
