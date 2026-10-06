import { Bell, KeyRound, Laptop, Monitor, ShieldCheck, Sparkles, Star, User, UserX, type LucideIcon } from 'lucide-react';

export type SettingsSectionId =
  | 'profile'
  | 'interests'
  | 'personality'
  | 'notifications'
  | 'privacy'
  | 'devices'
  | 'blocked'
  | 'account'
  | 'appearance';

export type SettingsSection = { id: SettingsSectionId; label: string; description: string; icon: LucideIcon };

/** Every settings section, in nav order (spec §7.8). Each is its own URL. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'profile', label: 'Profile', description: 'Your photo, name and a short bio.', icon: User },
  { id: 'interests', label: 'Interests', description: 'What you’re into, so Click can suggest people and events.', icon: Star },
  { id: 'personality', label: 'Personality', description: 'Five traits that describe you.', icon: Sparkles },
  { id: 'notifications', label: 'Notifications', description: 'Which alerts this browser shows.', icon: Bell },
  { id: 'privacy', label: 'Privacy & location', description: 'What Click records about where you are, and who can find you.', icon: ShieldCheck },
  { id: 'devices', label: 'Devices', description: 'Where you’re signed in to chat, and approvals for new sign-ins.', icon: Laptop },
  { id: 'blocked', label: 'Blocked people', description: 'People who can’t see you or message you.', icon: UserX },
  { id: 'account', label: 'Account', description: 'Email, password, sign-out and account deletion.', icon: KeyRound },
  { id: 'appearance', label: 'Appearance', description: 'Light, dark, or match your system.', icon: Monitor },
];

export function settingsSection(id: string): SettingsSection | null {
  return SETTINGS_SECTIONS.find((s) => s.id === id) ?? null;
}

export function settingsHref(id: SettingsSectionId): string {
  return `/settings/${id}`;
}
