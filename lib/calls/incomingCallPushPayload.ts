import type { WebCallInvite } from '@/components/chat/CallOverlay';

/** Matches `CallPushNotifier.kt` → `send-push-notification` for `incoming_call` / VoIP wake-up. */
export function buildIncomingCallPushPayload(invite: WebCallInvite) {
  return {
    recipient_user_id: invite.calleeId,
    title: invite.videoEnabled
      ? `Incoming video call from ${invite.callerName}`
      : `Incoming call from ${invite.callerName}`,
    body: 'Open Click to answer',
    data: {
      type: 'incoming_call' as const,
      call_id: invite.callId,
      connection_id: invite.connectionId,
      room_name: invite.roomName,
      caller_id: invite.callerId,
      caller_name: invite.callerName,
      callee_id: invite.calleeId,
      callee_name: invite.calleeName,
      video_enabled: invite.videoEnabled,
      created_at: invite.createdAt,
    },
  };
}
