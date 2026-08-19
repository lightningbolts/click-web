import { buildIncomingCallPushPayload } from '@/lib/calls/incomingCallPushPayload';
import type { WebCallInvite } from '@/components/chat/CallOverlay';

const invite: WebCallInvite = {
  callId: 'call-123',
  connectionId: 'conn-1',
  roomName: 'click-conn-1-1700000000000',
  callerId: 'user-a',
  callerName: 'Alice',
  calleeId: 'user-b',
  calleeName: 'Bob',
  videoEnabled: false,
  createdAt: 1700000000000,
};

describe('buildIncomingCallPushPayload (mirrors KMP CallPushNotifier.kt)', () => {
  it('pins the exact cross-platform payload shape for voice calls', () => {
    expect(buildIncomingCallPushPayload(invite)).toEqual({
      recipient_user_id: 'user-b',
      title: 'Incoming call from Alice',
      body: 'Open Click to answer',
      data: {
        type: 'incoming_call',
        call_id: 'call-123',
        connection_id: 'conn-1',
        room_name: 'click-conn-1-1700000000000',
        caller_id: 'user-a',
        caller_name: 'Alice',
        callee_id: 'user-b',
        callee_name: 'Bob',
        video_enabled: false,
        created_at: 1700000000000,
      },
    });
  });

  it('uses the video title variant when videoEnabled', () => {
    const payload = buildIncomingCallPushPayload({ ...invite, videoEnabled: true });
    expect(payload.title).toBe('Incoming video call from Alice');
    expect(payload.data.video_enabled).toBe(true);
  });
});
