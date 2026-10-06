import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { AppearanceControl } from '@/components/settings/AppearanceSettings';
import { BlockedSettings } from '@/components/settings/BlockedSettings';
import { DevicesSettings } from '@/components/settings/DevicesSettings';
import { InterestsSettings } from '@/components/settings/InterestsSettings';
import { NotificationsSettings } from '@/components/settings/NotificationsSettings';
import { PersonalitySettings } from '@/components/settings/PersonalitySettings';
import { PrivacySettings } from '@/components/settings/PrivacySettings';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { getServerUser } from '@/lib/server/getServerUser';
import {
  loadBlockedPeople,
  loadInterestTags,
  loadLocationPrefs,
  loadOwnPhone,
  loadPersonalityTags,
  loadProfileSettings,
} from '@/lib/server/settings/loadSettings';
import { settingsSection } from '@/lib/settings/sections';
import { loginHref } from '@/lib/shell/appNav';

type Params = Promise<{ section: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const section = settingsSection((await params).section);
  return { title: section ? `${section.label} · Settings · Click` : 'Settings · Click' };
}

/** One settings section (spec §7.8), loaded on the server so it paints with saved values. */
export default async function SettingsSectionPage({ params }: { params: Params }) {
  const section = settingsSection((await params).section);
  if (!section) notFound();
  const user = await getServerUser();
  if (!user) redirect(loginHref(`/settings/${section.id}`));
  const admin = createAdminSupabaseClient();

  let body: React.ReactNode;
  switch (section.id) {
    case 'profile':
      body = <ProfileSettings userId={user.id} initial={await loadProfileSettings(admin, user.id)} />;
      break;
    case 'interests':
      body = <InterestsSettings userId={user.id} initial={await loadInterestTags(admin, user.id)} />;
      break;
    case 'personality':
      body = <PersonalitySettings userId={user.id} initial={await loadPersonalityTags(admin, user.id)} />;
      break;
    case 'notifications':
      body = <NotificationsSettings userId={user.id} />;
      break;
    case 'privacy': {
      const [prefs, phone] = await Promise.all([loadLocationPrefs(admin, user.id), loadOwnPhone(admin, user.id)]);
      body = <PrivacySettings userId={user.id} initial={prefs} phone={phone} />;
      break;
    }
    case 'devices':
      body = <DevicesSettings />;
      break;
    case 'blocked':
      body = <BlockedSettings initial={await loadBlockedPeople(admin, user.id)} />;
      break;
    case 'account': {
      const profile = await loadProfileSettings(admin, user.id);
      body = <AccountSettings email={user.email ?? null} name={[profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()} />;
      break;
    }
    case 'appearance':
      body = <AppearanceControl className="max-w-sm" />;
      break;
  }

  return (
    <>
      <SettingsHeader section={section} />
      {body}
    </>
  );
}
