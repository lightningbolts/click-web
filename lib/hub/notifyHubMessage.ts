import type { SupabaseClient } from '@supabase/supabase-js';
import { runtimeEnv } from '@/lib/server/runtimeEnv';
import { assertHubReadable } from '@/lib/server/hubGatekeeper';

export const HUB_NOTIFICATION_AUTH_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= values.length) return;
        results[index] = await mapper(values[index]);
      }
    }),
  );
  return results;
}

function hubPushFunctionUrl(): string | null {
  const base = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  return base ? `${base}/functions/v1/send-push-notification` : null;
}

/**
 * Fan-out hub message pushes to other participants. Failures are logged, never thrown,
 * so chat insert success is independent of APNs/FCM.
 */
export async function notifyHubMessageParticipants(args: {
  admin: SupabaseClient;
  hubId: string;
  messageId: string;
  senderUserId: string;
}): Promise<number> {
  const pushUrl = hubPushFunctionUrl();
  const serviceKey = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!pushUrl || !serviceKey) return 0;

  const { data, error } = await args.admin
    .from('hub_participants')
    .select('user_id')
    .eq('hub_id', args.hubId);
  if (error) {
    console.warn('[hub/messages] participant fan-out lookup:', error.message);
    return 0;
  }

  const participantRecipients = (data ?? [])
    .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
    .filter((id) => id.length > 0 && id !== args.senderUserId);

  // A stale event-hub participant row is not notification authorization. Use
  // the same access gate as reads/search before emitting a deep link.
  const recipientChecks = await mapWithConcurrency(
    participantRecipients,
    HUB_NOTIFICATION_AUTH_CONCURRENCY,
    async (recipient) => ({
      recipient,
      denied: await assertHubReadable(args.admin, args.hubId, recipient),
    }),
  );
  const recipients = recipientChecks.filter(({ denied }) => denied == null).map(({ recipient }) => recipient);

  let sent = 0;
  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const response = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient_user_id: recipient,
            title: 'Hub message',
            // Hub messages can be protected content. Never mirror message text
            // into a third-party notification provider or lock-screen preview.
            body: 'Open Click to view it.',
            data: {
              type: 'hub_message',
              hub_id: args.hubId,
              message_id: args.messageId,
              sender_user_id: args.senderUserId,
            },
          }),
        });
        if (response.ok) sent += 1;
        else {
          console.warn('[hub/messages] push failed', { status: response.status });
        }
      } catch (e) {
        console.warn('[hub/messages] push error', e);
      }
    }),
  );
  return sent;
}
