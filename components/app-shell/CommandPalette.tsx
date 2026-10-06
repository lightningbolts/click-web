'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { CalendarPlus, Hash, Map, QrCode, Search, Settings, type LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { CardVisual } from '@/components/ds/CardVisual';
import { Chip } from '@/components/ds/Chip';
import { overlayClassName } from '@/components/ds/Dialog';
import { authedJson } from '@/lib/api/authedJson';
import { cn } from '@/lib/cn';
import { categoryLabel } from '@/lib/places/categories';
import type { PlaceCategory } from '@/lib/places/types';
import { eventHref, groupThreadHref, hubThreadHref, personHref, threadHref } from '@/lib/shell/appNav';
import { COMMAND_PALETTE_EVENT } from './commandPaletteEvents';

export type PaletteScope = 'all' | 'people' | 'groups' | 'events' | 'places' | 'hubs';

const SCOPES: { value: PaletteScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'People' },
  { value: 'groups', label: 'Groups' },
  { value: 'events', label: 'Events' },
  { value: 'places', label: 'Places' },
  { value: 'hubs', label: 'Hubs' },
];

const PER_GROUP = 5;

type SearchResponse = {
  people: { userId: string; name: string; avatarUrl: string | null; context: string | null }[];
  clicks?: { connectionId: string; userId: string; name: string; avatarUrl: string | null }[];
  groups?: { groupId: string; name: string }[];
  events: { beaconId: string; title: string; locationName: string | null; startAt: string | null; imageUrl: string | null }[];
  places?: { placeId: string; slug: string; name: string; category: string | null; city: string | null }[];
  hubs: { hubId: string; name: string; category: string | null }[];
};

export type PaletteResult = {
  id: string;
  scope: Exclude<PaletteScope, 'all'>;
  title: string;
  subtitle: string | null;
  href: string;
  visual: { kind: 'avatar'; seed: string; src: string | null } | { kind: 'card'; seed: string; src: string | null } | { kind: 'icon'; icon: LucideIcon };
};

const GROUP_TITLES: Record<PaletteResult['scope'], string> = {
  people: 'People',
  groups: 'Groups',
  events: 'Events',
  places: 'Places',
  hubs: 'Hubs',
};

/** API hits → palette rows, grouped by scope with at most five each (spec §7.10). */
export function paletteResults(data: SearchResponse | undefined, scope: PaletteScope): PaletteResult[] {
  if (!data) return [];
  const take = <T,>(rows: T[] | undefined) => (rows ?? []).slice(0, PER_GROUP);
  const people: PaletteResult[] = [
    ...take(data.clicks).map((c) => ({
      id: `c:${c.connectionId}`,
      scope: 'people' as const,
      title: c.name,
      subtitle: 'Your Click',
      href: threadHref(c.connectionId),
      visual: { kind: 'avatar' as const, seed: c.userId, src: c.avatarUrl },
    })),
    ...take(data.people).map((p) => ({
      id: `u:${p.userId}`,
      scope: 'people' as const,
      title: p.name,
      subtitle: p.context,
      href: personHref(p.userId),
      visual: { kind: 'avatar' as const, seed: p.userId, src: p.avatarUrl },
    })),
  ].slice(0, PER_GROUP);
  const all: PaletteResult[] = [
    ...people,
    ...take(data.groups).map((g) => ({
      id: `g:${g.groupId}`,
      scope: 'groups' as const,
      title: g.name,
      subtitle: null,
      href: groupThreadHref(g.groupId),
      visual: { kind: 'avatar' as const, seed: g.groupId, src: null },
    })),
    ...take(data.events).map((e) => ({
      id: `e:${e.beaconId}`,
      scope: 'events' as const,
      title: e.title,
      subtitle: e.locationName,
      href: eventHref(e.beaconId),
      visual: { kind: 'card' as const, seed: e.beaconId, src: e.imageUrl },
    })),
    ...take(data.places).map((p) => ({
      id: `p:${p.placeId}`,
      scope: 'places' as const,
      title: p.name,
      subtitle: [p.category ? categoryLabel(p.category as PlaceCategory) : null, p.city].filter(Boolean).join(' · ') || null,
      href: `/p/${p.slug}`,
      visual: { kind: 'card' as const, seed: p.placeId, src: null },
    })),
    ...take(data.hubs).map((h) => ({
      id: `h:${h.hubId}`,
      scope: 'hubs' as const,
      title: h.name,
      subtitle: h.category,
      href: hubThreadHref(h.hubId),
      visual: { kind: 'icon' as const, icon: Hash },
    })),
  ];
  return scope === 'all' ? all : all.filter((r) => r.scope === scope);
}

const QUICK_ACTIONS: PaletteResult[] = [
  { id: 'qa:qr', scope: 'people', title: 'Show my QR', subtitle: null, href: '/add', visual: { kind: 'icon', icon: QrCode } },
  { id: 'qa:event', scope: 'events', title: 'Create event', subtitle: null, href: '/events/new', visual: { kind: 'icon', icon: CalendarPlus } },
  { id: 'qa:map', scope: 'places', title: 'Open map', subtitle: null, href: '/map', visual: { kind: 'icon', icon: Map } },
  { id: 'qa:settings', scope: 'people', title: 'Settings', subtitle: null, href: '/settings', visual: { kind: 'icon', icon: Settings } },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Visual({ visual }: { visual: PaletteResult['visual'] }) {
  if (visual.kind === 'avatar') return <Avatar seed={visual.seed} src={visual.src} size={32} />;
  if (visual.kind === 'card') return <CardVisual seed={visual.seed} photoUrl={visual.src} radius="sm" className="size-8" sizes="32px" />;
  const Icon = visual.icon;
  return (
    <span className="flex size-8 items-center justify-center rounded-sm bg-fill-subtle text-fg-secondary">
      <Icon size={16} aria-hidden />
    </span>
  );
}

/** True when a key press is typing into a field (so "/" and "g" stay text there). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * Global search (spec §7.10): ⌘K / Ctrl K, or "/" outside inputs. Scope chips, results grouped
 * five per scope, ↑/↓/Enter to move and open, quick actions while empty.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<PaletteScope>('all');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const q = useDebounced(query.trim(), 180);
  const searching = q.length >= 2;
  const { data, isLoading, error } = useSWR(open && searching ? `/api/search?mine=1&q=${encodeURIComponent(q)}` : null, (url: string) =>
    authedJson<SearchResponse>(url),
  );

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const results = useMemo(() => (searching ? paletteResults(data, scope) : QUICK_ACTIONS), [searching, data, scope]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  const go = (r: PaletteResult) => {
    setOpen(false);
    setQuery('');
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length);
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView?.({ block: "nearest" });
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  };

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setActive(0);
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClassName} />
        <RadixDialog.Content
          className="ds-anim-dialog fixed left-1/2 top-[15vh] z-[81] flex max-h-[70vh] w-[calc(100vw-32px)] max-w-[720px] -translate-x-1/2 flex-col rounded-xl bg-bg-elevated text-fg shadow-overlay outline-none"
          data-testid="command-palette"
        >
          <RadixDialog.Title className="sr-only">Search Click</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Search people, groups, events, Places and hubs.</RadixDialog.Description>
          <div className="relative px-4 pt-4">
            <Search size={18} aria-hidden className="pointer-events-none absolute left-8 top-1/2 mt-2 -translate-y-1/2 text-fg-tertiary" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
              aria-activedescendant={results[activeIndex] ? `palette-${results[activeIndex].id}` : undefined}
              aria-label="Search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search people, events, Places…"
              className="type-body h-11 w-full rounded-pill bg-fill-subtle pl-11 pr-4 text-fg outline-none placeholder:text-fg-tertiary focus:shadow-[0_0_0_2px_var(--accent)]"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]" role="group" aria-label="Search in">
            {SCOPES.map((s) => (
              <Chip
                key={s.value}
                size="sm"
                selected={scope === s.value}
                onClick={() => {
                  setScope(s.value);
                  setActive(0);
                }}
              >
                {s.label}
              </Chip>
            ))}
          </div>
          <ul id="palette-results" role="listbox" ref={listRef} aria-label={searching ? 'Results' : 'Quick actions'} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {!searching ? <li className="type-meta px-3 pb-1 pt-2 font-semibold text-fg-secondary">Quick actions</li> : null}
            {searching && isLoading && !data ? <li className="type-meta px-3 py-6 text-center text-fg-tertiary">Searching…</li> : null}
            {searching && error ? <li className="type-meta px-3 py-6 text-center text-destructive">Couldn’t search right now. Try again.</li> : null}
            {searching && data && results.length === 0 ? (
              <li className="type-body px-3 py-8 text-center text-fg-secondary">No matches for “{q}”.</li>
            ) : null}
            {results.map((r, i) => {
              const heading = searching && (i === 0 || results[i - 1].scope !== r.scope) ? GROUP_TITLES[r.scope] : null;
              return (
                <li key={r.id} role="presentation">
                  {heading ? (
                    <p role="presentation" className="type-meta px-3 pb-1 pt-3 font-semibold text-fg-secondary">
                      {heading}
                    </p>
                  ) : null}
                  <div
                    id={`palette-${r.id}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn('flex h-12 cursor-pointer items-center gap-3 rounded-md px-3', i === activeIndex && 'bg-hover')}
                  >
                    <Visual visual={r.visual} />
                    <span className="min-w-0 flex-1">
                      <span className="type-body block truncate text-fg">{r.title}</span>
                      {r.subtitle ? <span className="type-meta block truncate text-fg-tertiary">{r.subtitle}</span> : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="type-meta hidden px-4 pb-3 text-fg-tertiary md:block">
            <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
          </p>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

