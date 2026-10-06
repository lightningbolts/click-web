import type { ReactNode } from 'react';
import { SettingsNav } from '@/components/settings/SettingsNav';

/** Settings (spec §7.8): sticky 240 px section nav on desktop, the section in a 640 column. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-page flex gap-10 pb-24 pt-6 md:pt-10">
      <SettingsNav />
      <div className="min-w-0 max-w-[640px] flex-1">{children}</div>
    </div>
  );
}
