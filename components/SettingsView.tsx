'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import type { NotificationPreferences } from '@/lib/notifications/preferences';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import ProfileSection from '@/components/settings/ProfileSection';
import InterestsSection from '@/components/settings/InterestsSection';
import PersonalitySection from '@/components/settings/PersonalitySection';
import NotificationsSection from '@/components/settings/NotificationsSection';
import LocationPrefsSection from '@/components/settings/LocationPrefsSection';
import PasswordSection from '@/components/settings/PasswordSection';
import DeleteAccountSection from '@/components/settings/DeleteAccountSection';

interface SettingsViewProps {
  notificationPreferences: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<{ success: boolean; error?: string }>;
}

export default function SettingsView({
  notificationPreferences,
  onSaveNotificationPreferences,
}: SettingsViewProps) {
  const { user } = useAuth();
  // The profile form's name fields live here because the delete-account
  // confirmation must match the form's CURRENT (possibly unsaved) values.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const accountDisplayName = useMemo(
    () => (displayNameFromUserMetadata(user?.user_metadata) || '').trim(),
    [user?.user_metadata],
  );

  /** Combined display string from the profile form fields, or saved metadata. */
  const profileFormDisplayName = useMemo(
    () =>
      [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' ').trim() ||
      accountDisplayName,
    [firstName, lastName, accountDisplayName],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <h2 className="mb-6 text-3xl font-bold text-on-surface">Settings</h2>

      <ProfileSection
        firstName={firstName}
        lastName={lastName}
        setFirstName={setFirstName}
        setLastName={setLastName}
        accountDisplayName={accountDisplayName}
      />

      <InterestsSection />

      <PersonalitySection />

      <NotificationsSection
        notificationPreferences={notificationPreferences}
        onSaveNotificationPreferences={onSaveNotificationPreferences}
      />

      <LocationPrefsSection />

      <PasswordSection />

      <DeleteAccountSection profileFormDisplayName={profileFormDisplayName} />
    </motion.div>
  );
}
