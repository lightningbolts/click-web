'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, ChevronsUpDown, Eye, LayoutGrid, Lock, Plus, QrCode } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ds/Popover';
import { StatusPill } from '@/components/ds/StatusPill';
import { LinkTabs } from '@/components/ds/Tabs';
import { canWrite, placeStatusPill } from '@/lib/places/workspace';
import { cn } from '@/lib/cn';
import { usePlaceWorkspace, type WorkspacePlace } from './PlaceWorkspaceContext';

const ROLE_LABEL: Record<WorkspacePlace['role'], string> = { owner: 'Owner', manager: 'Manager', viewer: 'Viewer' };

export function placeBase(id: string): string {
  return `/business/places/${id}`;
}

/** The tab path after `/business/places/{id}`, kept when switching Place (spec §9.4). */
export function workspaceSuffix(pathname: string, placeId: string): string {
  const base = placeBase(placeId);
  return pathname.startsWith(base) ? pathname.slice(base.length) : '';
}

export function workspaceTabs(place: Pick<WorkspacePlace, 'id' | 'role' | 'entitled'>) {
  const base = placeBase(place.id);
  return [
    { href: base, label: 'Overview' },
    { href: `${base}/events`, label: 'Events' },
    {
      href: `${base}/insights`,
      prefix: true,
      label: place.entitled ? (
        'Insights'
      ) : (
        <span className="inline-flex items-center gap-1">
          Insights
          <Lock size={14} aria-hidden />
          <span className="sr-only">(not on this plan)</span>
        </span>
      ),
    },
    { href: `${base}/profile`, label: 'Profile' },
    { href: `${base}/qr`, label: 'Check-in QR' },
    { href: `${base}/team`, label: 'Team' },
    ...(place.role === 'owner' ? [{ href: `${base}/billing`, label: 'Billing' }] : []),
  ];
}

function PlaceSwitcher() {
  const { place, places } = usePlaceWorkspace();
  const pathname = usePathname();
  const suffix = workspaceSuffix(pathname, place.id);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="press -ml-2 flex min-w-0 items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-hover"
        aria-label={`Switch Place, current: ${place.name}`}
        data-testid="place-switcher"
      >
        <CardVisual seed={place.id} photoUrl={place.photo_url} radius="sm" className="size-8 shrink-0" sizes="32px" />
        <span className="type-title-3 min-w-0 truncate text-fg">{place.name}</span>
        <ChevronsUpDown size={18} aria-hidden className="shrink-0 text-fg-tertiary" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-1.5">
        <ul aria-label="Your Places" className="max-h-[360px] overflow-y-auto">
          {places.map((p) => {
            const status = placeStatusPill(p);
            const current = p.id === place.id;
            // Billing is owner-only; land a non-owner on Overview instead.
            const keep = suffix === '/billing' && p.role !== 'owner' ? '' : suffix;
            return (
              <li key={p.id}>
                <Link
                  href={`${placeBase(p.id)}${keep}`}
                  onClick={() => setOpen(false)}
                  aria-current={current ? 'page' : undefined}
                  className={cn('flex items-center gap-3 rounded-sm px-2 py-2 hover:bg-hover', current && 'bg-selection')}
                >
                  <CardVisual seed={p.id} photoUrl={p.photo_url} radius="sm" className="size-10 shrink-0" sizes="40px" />
                  <span className="min-w-0 flex-1">
                    <span className="type-body-strong block truncate text-fg">{p.name}</span>
                    <span className="mt-0.5 flex gap-1">
                      <StatusPill variant="neutral">{ROLE_LABEL[p.role]}</StatusPill>
                      <StatusPill variant={status.variant}>{status.label}</StatusPill>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-1 flex flex-col pt-1 shadow-[inset_0_1px_0_var(--hairline)]">
          <Link href="/business/places/new" onClick={() => setOpen(false)} className="type-body flex h-9 items-center gap-2 rounded-sm px-2 text-fg hover:bg-hover">
            <Plus size={16} aria-hidden className="text-fg-secondary" />
            Add a Place
          </Link>
          <Link href="/business/places" onClick={() => setOpen(false)} className="type-body flex h-9 items-center gap-2 rounded-sm px-2 text-fg hover:bg-hover">
            <LayoutGrid size={16} aria-hidden className="text-fg-secondary" />
            All Places
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Workspace header (spec §9.4): switcher, status / plan / role pills, actions, URL tabs. */
export function WorkspaceHeader() {
  const { place } = usePlaceWorkspace();
  const status = placeStatusPill(place);
  const publicHref = place.slug && place.listed && place.verification_status === 'verified' ? `/p/${place.slug}` : null;
  return (
    <header className="container-wide pt-6" data-testid="workspace-header">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <PlaceSwitcher />
          <StatusPill variant={status.variant}>{status.label}</StatusPill>
          {canWrite(place.role) ? (
            <StatusPill variant={place.entitled ? 'tinted' : 'neutral'}>{place.entitled ? 'Click for Business' : 'Free'}</StatusPill>
          ) : (
            <StatusPill variant="neutral" icon={Eye}>
              View only
            </StatusPill>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {publicHref ? (
            <Button href={publicHref} variant="secondary" size="sm" trailingIcon={ArrowUpRight}>
              View public page
            </Button>
          ) : null}
          <Button href={`${placeBase(place.id)}/qr`} variant="secondary" size="sm" icon={QrCode}>
            Check-in QR
          </Button>
        </div>
      </div>
      <LinkTabs label="Place workspace" tabs={workspaceTabs(place)} className="mt-4" />
    </header>
  );
}
