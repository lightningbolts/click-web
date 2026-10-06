import Link from 'next/link';
import { AvatarStack } from '@/components/ds/Avatar';
import { CardVisual } from '@/components/ds/CardVisual';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { formatMonth } from '@/lib/home/format';
import type { HomeChapter } from '@/lib/home/types';

/** ⑧ Memories: month chapters as a horizontal list (replaces TimeCapsule on Home). */
export function Memories({ chapters }: { chapters: HomeChapter[] }) {
  return (
    <section aria-labelledby="home-memories">
      <SectionHeader id="home-memories" title="Memories" href="/me/history" />
      <ul className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        {chapters.map((c) => (
          <li key={c.id} className="w-44 shrink-0 snap-start">
            <Link href={`/me/history?month=${c.id}`} className="group block rounded-lg">
              <CardVisual seed={`chapter:${c.id}`} ratio="4:3" radius="lg" sizes="176px" />
              <p className="type-body-strong mt-2 text-fg group-hover:underline">{formatMonth(c.monthStart)}</p>
              <p className="type-meta mt-0.5 flex items-center gap-2 text-fg-tertiary">
                <AvatarStack
                  size={20}
                  max={3}
                  total={c.count}
                  ringColor="var(--bg)"
                  people={c.people.map((p) => ({ seed: p.id, name: p.name, src: p.avatarUrl }))}
                />
                {c.count === 1 ? '1 Click' : `${c.count} Clicks`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
