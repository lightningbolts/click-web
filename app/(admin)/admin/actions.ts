'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

type ActionType = 'notice' | 'error';

function toPositiveInt(value: FormDataEntryValue | null, fallback: number, max: number): number {
  const raw = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, raw);
}

function getTextField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function redirectWithStatus(type: ActionType, message: string): never {
  const params = new URLSearchParams({ [type]: message });
  redirect(`/admin?${params.toString()}`);
}

async function requireAdminSession(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirectWithStatus('error', 'You must be signed in as an admin.');
  }

  const role = user.user_metadata?.role;
  if (role !== 'admin') {
    redirectWithStatus('error', 'Admin role required.');
  }
}

async function insertIgnoringDuplicate<T extends Record<string, unknown>>(
  executor: () => Promise<{ error: { code?: string; message: string } | null }>,
): Promise<void> {
  const { error } = await executor();
  if (!error) return;
  if (error.code === '23505') return;
  throw new Error(error.message);
}

export async function suspendUserAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const userId = getTextField(formData, 'user_id');
  const durationHours = toPositiveInt(formData.get('duration_hours'), 720, 24 * 365 * 5);

  if (!userId) {
    redirectWithStatus('error', 'User ID is required for suspension.');
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: `${durationHours}h`,
  });

  if (error) {
    redirectWithStatus('error', `Suspend failed: ${error.message}`);
  }

  revalidatePath('/admin');
  redirectWithStatus('notice', `User ${userId} suspended for ${durationHours}h.`);
}

export async function banDeviceAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const pushToken = getTextField(formData, 'push_token');
  if (!pushToken) {
    redirectWithStatus('error', 'Push token is required to ban a device.');
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('push_tokens').delete().eq('token', pushToken);

  if (error) {
    redirectWithStatus('error', `Device ban failed: ${error.message}`);
  }

  revalidatePath('/admin');
  redirectWithStatus('notice', 'Device token removed from push delivery.');
}

export async function severConnectionAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const actorUserId = getTextField(formData, 'actor_user_id');
  const targetUserId = getTextField(formData, 'target_user_id');
  const connectionId = getTextField(formData, 'connection_id');

  if (!actorUserId || !targetUserId || !connectionId) {
    redirectWithStatus('error', 'actor_user_id, target_user_id, and connection_id are required.');
  }

  const admin = createAdminSupabaseClient();

  try {
    await insertIgnoringDuplicate(async () =>
      await admin.from('user_blocks').insert({ blocker_id: actorUserId, blocked_id: targetUserId }),
    );

    await insertIgnoringDuplicate(async () =>
      await admin.from('user_blocks').insert({ blocker_id: targetUserId, blocked_id: actorUserId }),
    );

    await insertIgnoringDuplicate(async () =>
      await admin.from('connection_hidden').insert({ user_id: actorUserId, connection_id: connectionId }),
    );

    await insertIgnoringDuplicate(async () =>
      await admin.from('connection_hidden').insert({ user_id: targetUserId, connection_id: connectionId }),
    );
  } catch (error) {
    redirectWithStatus(
      'error',
      `Failed to sever connection: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  revalidatePath('/admin');
  redirectWithStatus('notice', 'Toxic connection severed and users blocked from each other.');
}

export async function approveVenueAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const venueId = getTextField(formData, 'venue_id');
  if (!venueId) {
    redirectWithStatus('error', 'venue_id is required for approval.');
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from('venues')
    .update({ subscription_status: 'trialing' })
    .eq('id', venueId);

  if (error) {
    redirectWithStatus('error', `Venue approval failed: ${error.message}`);
  }

  revalidatePath('/admin');
  redirectWithStatus('notice', 'Venue approved and moved to trialing tier access.');
}

export async function rejectVenueAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const venueId = getTextField(formData, 'venue_id');
  if (!venueId) {
    redirectWithStatus('error', 'venue_id is required for rejection.');
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from('venues')
    .update({ subscription_status: 'canceled' })
    .eq('id', venueId);

  if (error) {
    redirectWithStatus('error', `Venue rejection failed: ${error.message}`);
  }

  revalidatePath('/admin');
  redirectWithStatus('notice', 'Venue marked as rejected (canceled).');
}
