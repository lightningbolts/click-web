'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { SETTINGS_SECTIONS, settingsHref } from '@/lib/settings/sections';

/**
 * Desktop left nav (spec §7.8): a sticky 240 px list, the active section on `--selection`.
 * Hidden on phones (each section is a pushed page) and on the `/settings` index, which is the list.
 */
export function SettingsNav() {
  const pathname = usePathname();
  if (pathname === '/settings') return null;
  return (
    <nav aria-label="Settings" className="sticky top-[calc(var(--topbar-height)+24px)] w-60 shrink-0 self-start max-md:hidden">
      <p className="type-title-3 mb-3 px-3 text-fg">Settings</p>
      <ul className="flex flex-col gap-0.5">
        {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => {
          const href = settingsHref(id);
          const active = pathname === href;
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'type-body flex h-10 items-center gap-3 rounded-md px-3 transition-colors duration-[var(--d-fast)]',
                  active ? 'bg-selection font-semibold text-accent' : 'text-fg hover:bg-hover',
                )}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden className={active ? 'text-accent' : 'text-fg-secondary'} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
