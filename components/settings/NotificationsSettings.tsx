'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, Camera, HeartHandshake, MessageCircle, Radio, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { StatusPill } from '@/components/ds/StatusPill';
import { toast } from '@/components/ds/Toast';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications/preferences';
import { getSupabaseClient } from '@/lib/supabase';
import { ToggleList, ToggleRow } from './ToggleRows';

type Permission = NotificationPermission | 'unsupported';

const ROWS: { key: keyof NotificationPreferences; icon: LucideIcon; title: string; description: string }[] = [
  { key: 'messagePushEnabled', icon: MessageCircle, title: 'Messages', description: 'New messages when you’re outside that conversation or the tab is in the background.' },
  { key: 'eventReminderPushEnabled', icon: Calendar, title: 'Event reminders', description: 'The day of, and 30 minutes before, events you host.' },
  { key: 'availabilityMatchPushEnabled', icon: Users, title: 'Availability matches', description: 'When one of your Clicks is free for the same thing at the same time.' },
  { key: 'hubMessagePushEnabled', icon: Radio, title: 'Hub messages', description: 'Chat in hubs you’ve joined.' },
  { key: 'eventTeaserPushEnabled', icon: Sparkles, title: 'Event teasers', description: 'Anonymous notes before an event when people like you are going.' },
  { key: 'reconnectNudgePushEnabled', icon: HeartHandshake, title: 'Reconnect nudges', description: 'When you haven’t talked to a Click in a while, or you’re both going to the same event.' },
  { key: 'dropReleasePushEnabled', icon: Camera, title: 'Click Drops', description: 'When a drop someone shared with you develops.' },
];

const PERMISSION: Record<Permission, { label: string; variant: 'success' | 'destructive' | 'neutral' }> = {
  granted: { label: 'Allowed', variant: 'success' },
  denied: { label: 'Blocked', variant: 'destructive' },
  default: { label: 'Not asked yet', variant: 'neutral' },
  unsupported: { label: 'Not supported', variant: 'neutral' },
};

/** Notifications (spec §7.8): each toggle saves at once, rolls back with a toast on failure. */
export function NotificationsSettings({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const prefsRef = useRef(prefs);
  const [permission, setPermission] = useState<Permission>('unsupported');

  useEffect(() => {
    let cancelled = false;
    void loadNotificationPreferences(getSupabaseClient(), userId).then((p) => {
      if (cancelled) return;
      prefsRef.current = p;
      setPrefs(p);
      setPermission('Notification' in window ? Notification.permission : 'unsupported');
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ask = async () => {
    if (permission === 'unsupported') return permission;
    const next = await Notification.requestPermission();
    setPermission(next);
    return next;
  };

  const onToggle = async (key: keyof NotificationPreferences, on: boolean) => {
    if (on && permission === 'default') await ask();
    const previous = prefsRef.current;
    const next = { ...previous, [key]: on };
    prefsRef.current = next;
    setPrefs(next);
    const result = await saveNotificationPreferences(getSupabaseClient(), userId, next);
    if (!result.success) {
      prefsRef.current = previous;
      setPrefs(previous);
      toast.error(result.error || 'Couldn’t save that change.');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Browser permission" className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <span className="min-w-0 flex-1">
          <span className="type-body block text-fg">This browser</span>
          <span className="type-meta block text-fg-tertiary">Whether this browser may show Click alerts.</span>
        </span>
        <StatusPill variant={PERMISSION[permission].variant}>{PERMISSION[permission].label}</StatusPill>
        {permission === 'default' ? (
          <Button size="sm" variant="secondary" onClick={() => void ask()}>
            Allow
          </Button>
        ) : null}
      </section>
      {permission === 'denied' ? (
        <InlineNotice variant="warning">Alerts are blocked for this site. Allow notifications in your browser’s site settings.</InlineNotice>
      ) : null}

      <ToggleList footer="Alerts show while Click is open in a tab. Your phone keeps its own settings.">
        {ROWS.map((r) => (
          <ToggleRow
            key={r.key}
            icon={r.icon}
            title={r.title}
            description={r.description}
            checked={prefs[r.key]}
            onChange={(on) => void onToggle(r.key, on)}
          />
        ))}
      </ToggleList>
    </div>
  );
}
