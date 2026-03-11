import type { SupabaseClient } from '@supabase/supabase-js';

export interface NotificationPreferences {
  messagePushEnabled: boolean;
  callPushEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messagePushEnabled: true,
  callPushEnabled: true,
};

function storageKey(userId: string) {
  return `click:web-notification-preferences:${userId}`;
}

function isMissingPreferencesTable(error: unknown) {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: string }).code ?? '') : '';
  const message = typeof error === 'object' && error !== null ? String((error as { message?: string }).message ?? '').toLowerCase() : '';
  return code === 'PGRST205' || message.includes('notification_preferences') || message.includes('schema cache');
}

export function readLocalNotificationPreferences(userId: string): NotificationPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      messagePushEnabled: parsed.messagePushEnabled ?? true,
      callPushEnabled: parsed.callPushEnabled ?? true,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function writeLocalNotificationPreferences(userId: string, preferences: NotificationPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(preferences));
}

export async function loadNotificationPreferences(
  supabase: SupabaseClient | null,
  userId: string,
): Promise<NotificationPreferences> {
  const localPreferences = readLocalNotificationPreferences(userId);
  if (!supabase) {
    return localPreferences;
  }

  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('message_push_enabled, call_push_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const preferences = {
      messagePushEnabled: data?.message_push_enabled ?? true,
      callPushEnabled: data?.call_push_enabled ?? true,
    };

    writeLocalNotificationPreferences(userId, preferences);
    return preferences;
  } catch (error) {
    if (!isMissingPreferencesTable(error)) {
      console.error('Failed to load notification preferences:', error);
    }
    return localPreferences;
  }
}

export async function saveNotificationPreferences(
  supabase: SupabaseClient | null,
  userId: string,
  preferences: NotificationPreferences,
): Promise<{ success: boolean; error?: string }> {
  writeLocalNotificationPreferences(userId, preferences);

  if (!supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        message_push_enabled: preferences.messagePushEnabled,
        call_push_enabled: preferences.callPushEnabled,
        updated_at: Date.now(),
      }, { onConflict: 'user_id' });

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    if (isMissingPreferencesTable(error)) {
      return { success: true };
    }

    const message = error instanceof Error ? error.message : 'Failed to save notification preferences';
    console.error(message, error);
    return { success: false, error: message };
  }
}