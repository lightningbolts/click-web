'use client';

import { useState, useEffect } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { RefreshCw, Bell, MessageCircle, Phone, Calendar, Users, Radio, Sparkles, HeartHandshake } from 'lucide-react';
import type { NotificationPreferences } from '@/lib/notifications/preferences';

export default function NotificationsSection({
  notificationPreferences,
  onSaveNotificationPreferences,
}: {
  notificationPreferences: NotificationPreferences;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => Promise<{ success: boolean; error?: string }>;
}) {
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState({ type: '', text: '' });
  const [browserPermission, setBrowserPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('unsupported');

  const browserNotificationsSupported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (!browserNotificationsSupported) {
      setBrowserPermission('unsupported');
      return;
    }

    setBrowserPermission(Notification.permission);
  }, [browserNotificationsSupported]);

  const requestBrowserPermission = async () => {
    if (!browserNotificationsSupported) {
      setNotificationMessage({ type: 'warning', text: 'Browser notifications are not supported in this browser.' });
      return 'unsupported' as const;
    }

    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
    return permission;
  };

  const handleNotificationToggle = async (
    key: keyof NotificationPreferences,
    enabled: boolean,
  ) => {
    let permissionState = browserPermission;
    if (enabled && permissionState === 'default') {
      permissionState = await requestBrowserPermission();
    }

    setNotificationLoading(true);
    const nextPreferences = {
      ...notificationPreferences,
      [key]: enabled,
    };

    const result = await onSaveNotificationPreferences(nextPreferences);
    setNotificationLoading(false);

    if (!result.success) {
      setNotificationMessage({ type: 'error', text: result.error || 'Could not save notification preferences.' });
      return;
    }

    if (enabled && permissionState === 'denied') {
      setNotificationMessage({
        type: 'warning',
        text: 'Preference saved, but browser notifications are blocked. Enable notifications for this site in your browser settings to receive alerts.',
      });
      return;
    }

    if (enabled && permissionState === 'unsupported') {
      setNotificationMessage({
        type: 'warning',
        text: 'Preference saved, but this browser does not support system notifications.',
      });
      return;
    }

    setNotificationMessage({ type: 'success', text: 'Notification preferences updated.' });
  };

  const permissionLabel =
    browserPermission === 'granted'
      ? 'Allowed'
      : browserPermission === 'denied'
        ? 'Blocked'
        : browserPermission === 'default'
          ? 'Not requested'
          : 'Unsupported';

  return (
    <div className="fc-card p-8 rounded-[16px] border border-border-hard">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Bell className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Notifications</h3>
          <p className="text-on-surface-variant text-sm">Control browser alerts for messages and incoming calls.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-border-hard bg-surface-container px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-on-surface">Browser permission</p>
            <p className="mt-1 text-xs text-on-surface-variant">Current status for system notifications in this browser.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              browserPermission === 'granted'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                : browserPermission === 'denied'
                  ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
                  : 'bg-surface-container text-on-surface-variant border border-border-hard'
            }`}>
              {permissionLabel}
            </span>
            {browserNotificationsSupported && browserPermission !== 'granted' ? (
              <button
                onClick={() => { void requestBrowserPermission(); }}
                className="inline-flex items-center gap-2 rounded-xl border border-border-hard px-3 py-2 text-xs text-on-surface hover:bg-surface-container"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Request
              </button>
            ) : null}
          </div>
        </div>

        <NotificationToggleRow
          icon={<MessageCircle className="w-4 h-4 text-primary" />}
          title="Chat push notifications"
          description="Show browser alerts for new messages when you are outside that conversation or the tab is in the background."
          checked={notificationPreferences.messagePushEnabled}
          disabled={notificationLoading}
          onChange={(checked) => { void handleNotificationToggle('messagePushEnabled', checked); }}
        />

        <NotificationToggleRow
          icon={<Phone className="w-4 h-4 text-secondary" />}
          title="Incoming call alerts"
          description="Show browser alerts for incoming calls when the dashboard is not frontmost."
          checked={notificationPreferences.callPushEnabled}
          disabled={notificationLoading}
          onChange={(checked) => { void handleNotificationToggle('callPushEnabled', checked); }}
        />

        <NotificationToggleRow
          icon={<Calendar className="w-4 h-4 text-primary" />}
          title="Event reminders"
          description="Day-of and 30-minutes-before alerts for events you created."
          checked={notificationPreferences.eventReminderPushEnabled}
          disabled={notificationLoading}
          onChange={(checked) => { void handleNotificationToggle('eventReminderPushEnabled', checked); }}
        />

        <NotificationToggleRow
          icon={<Users className="w-4 h-4 text-primary" />}
          title="Availability matches"
          description="When a connection posts a matching intent and overlapping timeframe."
          checked={notificationPreferences.availabilityMatchPushEnabled}
          disabled={notificationLoading}
          onChange={(checked) => { void handleNotificationToggle('availabilityMatchPushEnabled', checked); }}
        />

        <NotificationToggleRow
          icon={<Radio className="w-4 h-4 text-primary" />}
          title="Hub messages"
          description="Community hub chat alerts when you are a participant."
          checked={notificationPreferences.hubMessagePushEnabled}
          disabled={notificationLoading}
          onChange={(checked) => { void handleNotificationToggle('hubMessagePushEnabled', checked); }}
        />

        <NotificationToggleRow
          icon={<Sparkles className="w-4 h-4 text-primary" />}
          title="Event teasers"
          description="Anonymized pre-event notes when people like you are going."
          checked={notificationPreferences.eventTeaserPushEnabled}
          disabled={notificationLoading}
          onChange={(checked) => { void handleNotificationToggle('eventTeaserPushEnabled', checked); }}
        />

        <NotificationToggleRow
          icon={<HeartHandshake className="w-4 h-4 text-primary" />}
          title="Reconnect nudges"
          description="When you Clicked with someone and have not talked in a while, or you are both going to the same event."
          checked={notificationPreferences.reconnectNudgePushEnabled}
          disabled={notificationLoading}
          onChange={(checked) => { void handleNotificationToggle('reconnectNudgePushEnabled', checked); }}
        />
      </div>

      {notificationMessage.text && (
        <div className={`mt-4 p-3 rounded-xl text-sm ${notificationMessage.type === 'error'
            ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
            : notificationMessage.type === 'warning'
              ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20'
              : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
          }`}>
          {notificationMessage.text}
        </div>
      )}

      <p className="mt-4 text-xs text-on-surface-variant">
        Browser alerts work while this dashboard is open in the browser. Closed-tab web push is not configured here.
      </p>
    </div>
  );
}

function NotificationToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border-hard bg-surface-container px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface border border-white/5">
            {icon}
          </span>
          <span>{title}</span>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">{description}</p>
      </div>

      <div className="flex shrink-0 justify-end">
        <Switch.Root
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border-hard bg-surface-container outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Switch.Thumb
            className="absolute left-0.5 top-1/2 h-5 w-5 shrink-0 rounded-full bg-white shadow block transition-[transform] duration-200 ease-out"
            style={{
              transform: checked ? 'translate(20px, -50%)' : 'translate(0, -50%)',
            }}
          />
        </Switch.Root>
      </div>
    </div>
  );
}
