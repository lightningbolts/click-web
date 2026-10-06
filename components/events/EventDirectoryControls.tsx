'use client';

import { ArrowUpDown, Map as MapIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ds/Menu';
import { SearchField } from '@/components/ds/SearchField';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { directoryHref, type DirectoryQuery, type DirectorySort, type DirectoryTab } from '@/lib/events/directory';

const SORT_LABEL: Record<DirectorySort, string> = { date: 'Date', going: 'Going', host: 'Host' };
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Row 2 of the `/events` header (spec §7.6.1): Upcoming / Past, search, sort and the map link.
 * Every control writes the URL, so the server renders the list and states are shareable.
 */
export function EventDirectoryControls({ query }: { query: DirectoryQuery }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(query.q);
  // Back/forward or "Clear search" changes the URL under us: follow it.
  const [urlQ, setUrlQ] = useState(query.q);
  if (urlQ !== query.q) {
    setUrlQ(query.q);
    if (q.trim() !== query.q) setQ(query.q);
  }
  const go = (next: Partial<DirectoryQuery>) =>
    startTransition(() => router.replace(directoryHref({ ...query, page: 1, ...next }), { scroll: false }));

  useEffect(() => {
    if (q.trim() === query.q) return;
    const t = window.setTimeout(() => {
      startTransition(() => router.replace(directoryHref({ ...query, q, page: 1 }), { scroll: false }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q, query, router]);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending || undefined}>
      <SegmentedControl<DirectoryTab>
        label="Which events"
        value={query.tab}
        onChange={(tab) => go({ tab })}
        segments={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
      />
      {/* Phones: tabs, sort and map share row one; search takes row two. */}
      <SearchField
        label="Search events"
        placeholder="Search events"
        value={q}
        onValueChange={setQ}
        className="order-last w-full sm:order-none sm:w-auto sm:min-w-0 sm:flex-1"
      />
      <div className="ml-auto flex items-center gap-2 sm:ml-0">
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="sm" icon={ArrowUpDown}>
              <span className="sr-only sm:not-sr-only">Sort: </span>
              {SORT_LABEL[query.sort]}
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuRadioGroup value={query.sort} onValueChange={(v) => go({ sort: v as DirectorySort })}>
              {(Object.keys(SORT_LABEL) as DirectorySort[]).map((s) => (
                <MenuRadioItem key={s} value={s}>
                  {SORT_LABEL[s]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
        <IconButton icon={MapIcon} href="/map?layer=events" aria-label="Show events on the map" variant="filled" />
      </div>
    </div>
  );
}
