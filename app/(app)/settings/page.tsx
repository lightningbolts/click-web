import type { Metadata } from 'next';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { SETTINGS_SECTIONS, settingsHref } from '@/lib/settings/sections';

export const metadata: Metadata = { title: 'Settings · Click' };

/** The settings list (spec §7.8): every section is its own page. */
export default function SettingsIndexPage() {
  return (
    <>
      <h1 className="type-title-1 mb-6 text-fg">Settings</h1>
      <ListGroup>
        {SETTINGS_SECTIONS.map((s) => (
          <ListRow key={s.id} href={settingsHref(s.id)} icon={s.icon} title={s.label} subtitle={s.description} chevron strong />
        ))}
      </ListGroup>
    </>
  );
}
