'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ds/Avatar';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { useAuth } from '@/lib/AuthContext';
import type { HomePerson } from '@/lib/home/types';
import { personHref } from '@/lib/shell/appNav';

/** ⑩ / rail: Core people with live presence (two rows max in the rail; scrolls on phones). */
export function CoreStrip({ people }: { people: HomePerson[] }) {
  const { onlineUserIds } = useAuth();
  return (
    <section aria-labelledby="home-core">
      <SectionHeader id="home-core" title="Core" href="/clicks" linkLabel="Manage" />
      <ul className="-mx-[var(--gutter)] flex gap-4 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:px-0">
        {people.map((p) => {
          const online = onlineUserIds.has(p.id);
          return (
            <li key={p.id} className="w-16 shrink-0 lg:w-auto lg:[&:nth-child(n+9)]:hidden">
              <Link
                href={personHref(p.id)}
                className="group flex flex-col items-center gap-1.5 rounded-md"
                aria-label={online ? `${p.name}, online` : p.name}
              >
                <Avatar seed={p.id} name={p.name} src={p.avatarUrl} size={56} presence={online} ringColor="var(--bg)" />
                <span className="type-meta w-full truncate text-center text-fg-secondary group-hover:text-fg">
                  {p.name.split(' ')[0]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
