import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';

const CRON_SECRET = process.env.CRON_SECRET;

const pushFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notification`
  : null;

type CollaborationSessionRow = {
  id: string;
  connection_id: string;
  chat_id: string | null;
  participant_user_ids: string[] | null;
};

async function hasRevealedDisposableMessage(
  admin: ReturnType<typeof createAdminClient>,
  session: CollaborationSessionRow,
  nowIso: string,
): Promise<boolean> {
  if (!session.chat_id) return false;
  const { data, error } = await admin
    .from('messages')
    .select('id')
    .eq('chat_id', session.chat_id)
    .eq('metadata->>disposable_roll', 'true')
    .eq('metadata->>encounter_id', session.id)
    .lte('metadata->>collaboration_ttl', nowIso)
    .limit(1);

  if (error) {
    console.warn('[cron/disposable-reveal] message reveal check:', session.id, error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Hourly sweep: collaboration sessions past [collaboration_ttl] → reveal push to all participants.
 * Optional HTTP route — production uses Supabase pg_cron → cron-hourly-maintenance edge function.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: sessions, error: fetchError } = await admin
    .from('collaboration_sessions')
    .select('id, connection_id, chat_id, participant_user_ids')
    .lte('collaboration_ttl', nowIso)
    .eq('notification_sent', false);

  if (fetchError) {
    console.error('[cron/disposable-reveal] fetch:', fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const rows = (sessions ?? []) as CollaborationSessionRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  let pushAttempts = 0;

  for (const session of rows) {
    const revealed = await hasRevealedDisposableMessage(admin, session, nowIso);
    if (!revealed) continue;

    const participantIds = (session.participant_user_ids ?? []).filter(Boolean);
    for (const userId of participantIds) {
      if (!pushFunctionUrl) continue;
      try {
        const response = await fetch(pushFunctionUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient_user_id: userId,
            title: 'Click Drops',
            body: '📸 Your Click Drop has been revealed!',
            data: {
              type: 'disposable_reveal',
              encounter_id: session.id,
              connection_id: session.connection_id,
              chat_id: session.chat_id,
            },
          }),
        });
        if (response.ok) pushAttempts += 1;
        else {
          const errText = await response.text();
          console.warn('[cron/disposable-reveal] push failed:', userId, errText);
        }
      } catch (e) {
        console.warn('[cron/disposable-reveal] push error:', userId, e);
      }
    }

    const { error: updateErr } = await admin
      .from('collaboration_sessions')
      .update({ notification_sent: true })
      .eq('id', session.id);

    if (updateErr) {
      console.error('[cron/disposable-reveal] mark sent:', session.id, updateErr.message);
    }
  }

  return NextResponse.json({ ok: true, sessions: rows.length, pushAttempts });
}
