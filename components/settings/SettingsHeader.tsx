import { PushedPage } from '@/components/app-shell/ShellContext';
import type { SettingsSection } from '@/lib/settings/sections';

/** Section title and one-line description; on phones the page is pushed with a back to the list. */
export function SettingsHeader({ section }: { section: SettingsSection }) {
  return (
    <header className="mb-6">
      <PushedPage title={section.label} backHref="/settings" />
      <h1 className="type-title-3 text-fg">{section.label}</h1>
      <p className="type-body mt-1 text-fg-secondary">{section.description}</p>
    </header>
  );
}
