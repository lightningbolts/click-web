'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { getSupabaseClient } from '@/lib/supabase';
import { insertCallLogMessage } from '@/lib/chat/messages';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import { buildCallParticipantsFromRoom } from '@/lib/calls/buildParticipants';
import { buildIncomingCallPushPayload } from '@/lib/calls/incomingCallPushPayload';
import type {
  WebActiveCallState,
  WebCallInvite,
  WebCallOverlayState,
} from '@/components/chat/CallOverlay';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { NotificationPreferences } from '@/lib/notifications/preferences';

const IDLE_CALL_OVERLAY: WebCallOverlayState = { mode: 'idle' };

const IDLE_ACTIVE_CALL: WebActiveCallState = {
  status: 'idle',
  invite: null,
  microphoneEnabled: true,
  cameraEnabled: false,
  remoteVideoTrack: null,
  localVideoTrack: null,
  participants: [],
  connectedAtMs: null,
};

/**
 * The dashboard's LiveKit call stack: signaling channels, ringtones, call
 * logs, the incoming-signal subscription, and the overlay/active-call state
 * machine. Extracted verbatim from DashboardView.
 */
export function useDashboardCalls({
  user,
  getAuthHeaders,
  connectionRecords,
  notificationPreferencesRef,
  showBrowserNotification,
  setSelectedConnection,
  setActiveTab,
}: {
  user: any;
  getAuthHeaders: () => Promise<HeadersInit>;
  connectionRecords: ConnectionRecord[];
  notificationPreferencesRef: MutableRefObject<NotificationPreferences>;
  showBrowserNotification: (title: string, body: string, onClick?: () => void) => void;
  setSelectedConnection: Dispatch<SetStateAction<ConnectionRecord | null>>;
  setActiveTab: (tab: 'memory' | 'map' | 'chat' | 'identity' | 'settings') => void;
}) {
  const [callOverlayState, setCallOverlayState] = useState<WebCallOverlayState>(IDLE_CALL_OVERLAY);
  const [activeCallState, setActiveCallState] = useState<WebActiveCallState>(IDLE_ACTIVE_CALL);
  const outboundCallChannelsRef = useRef<Map<string, any>>(new Map());
  const activeInviteRef = useRef<WebCallInvite | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRef = useRef<Room | null>(null);
  const remoteAudioElementsRef = useRef<HTMLElement[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const callConnectedAtRef = useRef<number | null>(null);
  const completedCallLoggedRef = useRef(false);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tryInsertCompletedCallLog = useCallback(
    async (invite: WebCallInvite | null) => {
      if (!invite || !user?.id) return;
      if (user.id !== invite.callerId) {
        callConnectedAtRef.current = null;
        return;
      }
      const start = callConnectedAtRef.current;
      if (start == null || completedCallLoggedRef.current) return;
      completedCallLoggedRef.current = true;
      callConnectedAtRef.current = null;
      const durationSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
      try {
        await insertCallLogMessage(getAuthHeaders, invite.connectionId, 'completed', durationSeconds);
      } catch (e) {
        console.warn('[calls] call_log completed insert failed', e);
      }
    },
    [getAuthHeaders, user?.id],
  );

  const insertDeclinedCallLog = useCallback(
    async (invite: WebCallInvite) => {
      if (!user?.id || user.id !== invite.callerId) return;
      try {
        await insertCallLogMessage(getAuthHeaders, invite.connectionId, 'declined', 0);
      } catch (e) {
        console.warn('[calls] call_log declined insert failed', e);
      }
    },
    [getAuthHeaders, user?.id],
  );

  const insertMissedCallLog = useCallback(
    async (invite: WebCallInvite) => {
      if (!user?.id || user.id !== invite.callerId) return;
      try {
        await insertCallLogMessage(getAuthHeaders, invite.connectionId, 'missed', 0);
      } catch (e) {
        console.warn('[calls] call_log missed insert failed', e);
      }
    },
    [getAuthHeaders, user?.id],
  );

  const clearCallTimeout = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
  }, []);

  const playRingtone = useCallback((kind: 'incoming' | 'outgoing') => {
    stopRingtone();
    if (typeof window === 'undefined') return;

    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }

    const context = audioContextRef.current;
    const frequencies = kind === 'incoming' ? [740, 620] : [680, 540];
    const durationMs = kind === 'incoming' ? 300 : 180;
    const intervalMs = kind === 'incoming' ? 1500 : 1100;

    const playBeep = () => {
      if (!context) return;
      const now = context.currentTime;
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(context.destination);
        gain.gain.setValueAtTime(0.0001, now + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + durationMs / 1000);
        oscillator.start(now + index * 0.08);
        oscillator.stop(now + index * 0.08 + durationMs / 1000 + 0.03);
      });
    };

    void context.resume().catch(() => undefined);
    playBeep();
    ringtoneIntervalRef.current = setInterval(playBeep, intervalMs);
  }, [stopRingtone]);

  const getOutboundChannel = useCallback(async (userId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const existing = outboundCallChannelsRef.current.get(userId);
    if (existing) return existing;

    const channel = supabase.channel(`calls:user:${userId}`);
    await new Promise<void>((resolve) => {
      channel.subscribe(() => resolve());
    });
    outboundCallChannelsRef.current.set(userId, channel);
    return channel;
  }, []);

  const sendSignal = useCallback(async (targetUserId: string, event: string, payload: object) => {
    const channel = await getOutboundChannel(targetUserId);
    if (!channel) return false;
    const response = await channel.send({ type: 'broadcast', event, payload });
    return response === 'ok';
  }, [getOutboundChannel]);

  const invokeIncomingCallPush = useCallback((invite: WebCallInvite) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.functions
      .invoke('send-push-notification', { body: buildIncomingCallPushPayload(invite) })
      .then(({ error }) => {
        if (error) {
          console.warn('[calls] send-push-notification failed:', error.message);
        }
      });
  }, []);

  const cleanupRemoteAudio = useCallback(() => {
    remoteAudioElementsRef.current.forEach((element) => element.remove());
    remoteAudioElementsRef.current = [];
  }, []);

  const notifyPeerCallEnded = useCallback(async (invite: WebCallInvite | null, reason: 'ended' | 'cancelled' = 'ended') => {
    if (!invite || !user?.id) return;
    const peerId = user.id === invite.callerId ? invite.calleeId : invite.callerId;
    await sendSignal(peerId, 'cancel', {
      callId: invite.callId,
      connectionId: invite.connectionId,
      senderId: user.id,
      reason,
    });
  }, [sendSignal, user?.id]);

  const resetCallState = useCallback((reason?: string, preserveInvite = true) => {
    setActiveCallState((current) => ({
      ...IDLE_ACTIVE_CALL,
      status: reason ? 'ended' : 'idle',
      invite: preserveInvite ? current.invite : null,
      reason,
    }));
  }, []);

  const disconnectRoom = useCallback((reason?: string) => {
    void tryInsertCompletedCallLog(activeInviteRef.current);
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        room.disconnect();
      } catch {}
      room.removeAllListeners();
    }
    cleanupRemoteAudio();
    resetCallState(reason, true);
  }, [cleanupRemoteAudio, resetCallState, tryInsertCompletedCallLog]);

  const endWithReason = useCallback((invite: WebCallInvite | null, reason: string) => {
    activeInviteRef.current = invite;
    clearCallTimeout();
    stopRingtone();
    setCallOverlayState({ mode: 'ended', invite, reason });
    if (roomRef.current) {
      disconnectRoom(reason);
    } else {
      setActiveCallState((current) => ({
        ...IDLE_ACTIVE_CALL,
        status: 'ended',
        invite: invite ?? current.invite,
        reason,
      }));
    }
  }, [clearCallTimeout, disconnectRoom, stopRingtone]);

  const joinCall = useCallback(async (invite: WebCallInvite) => {
    if (!user?.id) {
      endWithReason(invite, 'You need to be signed in to start a call');
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          connection_id: invite.connectionId,
          room_name: invite.roomName,
          participant_name:
            displayNameFromUserMetadata(user.user_metadata) || user.email?.split('@')[0] || 'Click User',
          ...(invite.roomName.startsWith(`click-group-${invite.connectionId}-`)
            ? { group_id: invite.connectionId }
            : {}),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create call token');
      }

      setCallOverlayState(IDLE_CALL_OVERLAY);
      setActiveCallState({
        ...IDLE_ACTIVE_CALL,
        status: 'connecting',
        invite,
        microphoneEnabled: true,
        cameraEnabled: invite.videoEnabled,
      });

      // Match Android/iOS: adaptiveStream+dynacast can pause layers when the
      // video tile is briefly off-screen, which looks like "no remote video".
      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      const speakingIds = new Set<string>();

      const syncRoster = () => {
        const participants = buildCallParticipantsFromRoom(
          room,
          speakingIds,
          room.localParticipant.isCameraEnabled,
        );
        const localVideo =
          room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
        const firstRemoteVideo =
          [...room.remoteParticipants.values()]
            .map((p) => p.getTrackPublication(Track.Source.Camera)?.track)
            .find(Boolean) ?? null;
        setActiveCallState((current) => ({
          ...current,
          participants,
          localVideoTrack: localVideo,
          remoteVideoTrack: firstRemoteVideo,
          cameraEnabled: room.localParticipant.isCameraEnabled,
          microphoneEnabled: room.localParticipant.isMicrophoneEnabled,
        }));
      };

      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === 'audio') {
          const element = track.attach();
          element.autoplay = true;
          element.style.display = 'none';
          document.body.appendChild(element);
          remoteAudioElementsRef.current.push(element);
        }
        syncRoster();
      });

      room.on(RoomEvent.TrackUnsubscribed, () => {
        syncRoster();
      });

      room.on(RoomEvent.LocalTrackPublished, () => {
        syncRoster();
      });

      room.on(RoomEvent.LocalTrackUnpublished, () => {
        syncRoster();
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        syncRoster();
      });

      room.on(RoomEvent.TrackMuted, () => {
        syncRoster();
      });

      room.on(RoomEvent.TrackUnmuted, () => {
        syncRoster();
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: { identity?: string }[]) => {
        speakingIds.clear();
        for (const speaker of speakers) {
          if (speaker.identity) speakingIds.add(speaker.identity);
        }
        syncRoster();
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        syncRoster();
        if (room.remoteParticipants.size === 0) {
          endWithReason(invite, 'Call ended');
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        endWithReason(invite, 'Call ended');
      });

      await room.connect(payload.ws_url, payload.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      if (invite.videoEnabled) {
        await room.localParticipant.setCameraEnabled(true);
      }

      const localCameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
      callConnectedAtRef.current = Date.now();
      completedCallLoggedRef.current = false;
      const participants = buildCallParticipantsFromRoom(
        room,
        speakingIds,
        invite.videoEnabled,
      );
      setActiveCallState((current) => ({
        ...current,
        status: 'connected',
        localVideoTrack: localCameraTrack,
        cameraEnabled: invite.videoEnabled,
        microphoneEnabled: true,
        participants,
        connectedAtMs: callConnectedAtRef.current,
      }));
    } catch (error: any) {
      const peerId = user.id === invite.callerId ? invite.calleeId : invite.callerId;
      await sendSignal(peerId, 'cancel', {
        callId: invite.callId,
        connectionId: invite.connectionId,
        senderId: user.id,
        reason: 'cancelled',
      });
      endWithReason(invite, error?.message || 'Failed to create call token');
    }
  }, [endWithReason, getAuthHeaders, sendSignal, user]);

  const startOutgoingCall = useCallback(async (connection: ConnectionRecord, videoEnabled: boolean) => {
    if (!user?.id) {
      endWithReason(null, 'Unable to start a call for this connection');
      return;
    }

    if (callOverlayState.mode !== 'idle' || activeCallState.status !== 'idle') {
      return;
    }

    const isGroupClique = connection.chatKind === 'group_clique';
    const calleeIds = isGroupClique
      ? (connection.userIds ?? []).filter((id) => id !== user.id)
      : connection.otherUserId
        ? [connection.otherUserId]
        : [];

    if (calleeIds.length === 0) {
      endWithReason(null, 'Unable to start a call for this connection');
      return;
    }

    callConnectedAtRef.current = null;
    completedCallLoggedRef.current = false;

    const now = Date.now();
    const roomName = isGroupClique
      ? `click-group-${connection.id}-${now}`
      : `click-${connection.id}-${now}`;
    const invite: WebCallInvite = {
      callId: `call-${now}-${Math.floor(Math.random() * 9000 + 1000)}`,
      connectionId: connection.id,
      roomName,
      callerId: user.id,
      callerName:
        displayNameFromUserMetadata(user.user_metadata) || user.email?.split('@')[0] || 'Click User',
      calleeId: calleeIds[0]!,
      calleeName: isGroupClique ? 'Group call' : connection.name,
      videoEnabled,
      createdAt: now,
    };

    activeInviteRef.current = invite;
    setCallOverlayState({ mode: 'outgoing', invite });
    setActiveCallState({ ...IDLE_ACTIVE_CALL, invite });
    playRingtone('outgoing');

    let anyDelivered = false;
    for (const calleeId of calleeIds) {
      const memberInvite = { ...invite, calleeId, calleeName: isGroupClique ? 'Group call' : connection.name };
      invokeIncomingCallPush(memberInvite);
      const delivered = await sendSignal(calleeId, 'invite', memberInvite);
      anyDelivered = anyDelivered || delivered;
    }
    if (!anyDelivered) {
      stopRingtone();
      endWithReason(invite, 'Unable to reach this connection right now');
      return;
    }

    clearCallTimeout();
    callTimeoutRef.current = setTimeout(() => {
      for (const calleeId of calleeIds) {
        void sendSignal(calleeId, 'cancel', {
          callId: invite.callId,
          connectionId: invite.connectionId,
          senderId: invite.callerId,
          reason: 'missed',
        });
      }
      void insertMissedCallLog(invite);
      endWithReason(invite, 'No answer');
    }, 30_000);
  }, [
    activeCallState.status,
    callOverlayState.mode,
    clearCallTimeout,
    endWithReason,
    invokeIncomingCallPush,
    insertMissedCallLog,
    playRingtone,
    sendSignal,
    stopRingtone,
    user,
  ]);

  const acceptIncomingCall = useCallback(async () => {
    if (callOverlayState.mode !== 'incoming') return;
    const invite = callOverlayState.invite;
    activeInviteRef.current = invite;
    clearCallTimeout();
    stopRingtone();
    setCallOverlayState({ mode: 'connecting', invite });
    await sendSignal(invite.callerId, 'response', {
      callId: invite.callId,
      connectionId: invite.connectionId,
      responderId: user.id,
      accepted: true,
      busy: false,
    });
    await joinCall(invite);
  }, [callOverlayState, clearCallTimeout, joinCall, sendSignal, stopRingtone, user?.id]);

  const declineIncomingCall = useCallback(async () => {
    if (callOverlayState.mode !== 'incoming') return;
    const invite = callOverlayState.invite;
    clearCallTimeout();
    stopRingtone();
    await sendSignal(invite.callerId, 'response', {
      callId: invite.callId,
      connectionId: invite.connectionId,
      responderId: user?.id,
      accepted: false,
      busy: false,
    });
    activeInviteRef.current = null;
    setCallOverlayState(IDLE_CALL_OVERLAY);
    setActiveCallState(IDLE_ACTIVE_CALL);
  }, [callOverlayState, clearCallTimeout, sendSignal, stopRingtone, user?.id]);

  const cancelPendingCall = useCallback(async () => {
    const invite = activeInviteRef.current;
    if (!invite) return;
    clearCallTimeout();
    stopRingtone();

    if (callOverlayState.mode === 'outgoing' || callOverlayState.mode === 'connecting') {
      await sendSignal(invite.calleeId, 'cancel', {
        callId: invite.callId,
        connectionId: invite.connectionId,
        senderId: user?.id,
        reason: 'cancelled',
      });
    } else if (callOverlayState.mode === 'incoming') {
      await sendSignal(invite.callerId, 'response', {
        callId: invite.callId,
        connectionId: invite.connectionId,
        responderId: user?.id,
        accepted: false,
        busy: false,
      });
    }

    activeInviteRef.current = null;
    setCallOverlayState(IDLE_CALL_OVERLAY);
    setActiveCallState(IDLE_ACTIVE_CALL);
  }, [callOverlayState.mode, clearCallTimeout, sendSignal, stopRingtone, user?.id]);

  const dismissEndedCall = useCallback(() => {
    activeInviteRef.current = null;
    setCallOverlayState(IDLE_CALL_OVERLAY);
    setActiveCallState(IDLE_ACTIVE_CALL);
  }, []);

  const endActiveCall = useCallback(async () => {
    const invite = activeInviteRef.current;
    stopRingtone();
    setCallOverlayState({ mode: 'ended', invite, reason: 'Call ended' });
    setActiveCallState((current) => ({
      ...current,
      status: 'ended',
      reason: 'Call ended',
    }));
    await notifyPeerCallEnded(invite, 'ended');
    if (hangupTimerRef.current) {
      clearTimeout(hangupTimerRef.current);
    }
    hangupTimerRef.current = setTimeout(() => {
      hangupTimerRef.current = null;
      disconnectRoom('Call ended');
      activeInviteRef.current = null;
      setCallOverlayState(IDLE_CALL_OVERLAY);
      setActiveCallState(IDLE_ACTIVE_CALL);
    }, 280);
  }, [disconnectRoom, notifyPeerCallEnded, stopRingtone]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !activeCallState.microphoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    const participants = buildCallParticipantsFromRoom(room, new Set(), room.localParticipant.isCameraEnabled);
    setActiveCallState((current) => ({
      ...current,
      microphoneEnabled: next,
      participants,
    }));
  }, [activeCallState.microphoneEnabled]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !activeCallState.cameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    const localCameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
    const participants = buildCallParticipantsFromRoom(room, new Set(), next);
    setActiveCallState((current) => ({
      ...current,
      cameraEnabled: next,
      localVideoTrack: localCameraTrack,
      participants,
    }));
  }, [activeCallState.cameraEnabled]);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`calls:user:${user.id}`)
      .on('broadcast', { event: 'invite' }, async ({ payload }) => {
        const invite = payload as WebCallInvite;
        const isBusy = callOverlayState.mode !== 'idle' || activeCallState.status !== 'idle';
        if (isBusy) {
          await sendSignal(invite.callerId, 'response', {
            callId: invite.callId,
            connectionId: invite.connectionId,
            responderId: user.id,
            accepted: false,
            busy: true,
          });
          return;
        }

        activeInviteRef.current = invite;
        setCallOverlayState({ mode: 'incoming', invite });
        setActiveCallState({ ...IDLE_ACTIVE_CALL, invite });
        playRingtone('incoming');

        const matchingConnection = connectionRecords.find((connection) => connection.id === invite.connectionId);
        if (notificationPreferencesRef.current.callPushEnabled && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          showBrowserNotification(
            `${invite.callerName} is calling`,
            invite.videoEnabled ? 'Incoming video call on Click' : 'Incoming voice call on Click',
            () => {
              if (matchingConnection) {
                setSelectedConnection(matchingConnection);
                setActiveTab('chat');
              }
            },
          );
        }
      })
      .on('broadcast', { event: 'response' }, ({ payload }) => {
        const response = payload as { callId: string; accepted: boolean; busy?: boolean };
        const invite = activeInviteRef.current;
        if (!invite || invite.callId !== response.callId || callOverlayState.mode !== 'outgoing') {
          return;
        }

        clearCallTimeout();
        stopRingtone();

        if (response.accepted) {
          setCallOverlayState({ mode: 'connecting', invite });
          void joinCall(invite);
        } else if (response.busy) {
          endWithReason(invite, `${invite.calleeName} is busy`);
        } else {
          void insertDeclinedCallLog(invite);
          endWithReason(invite, `${invite.calleeName} declined the call`);
        }
      })
      .on('broadcast', { event: 'cancel' }, ({ payload }) => {
        const cancel = payload as { callId: string; reason: string };
        const invite = activeInviteRef.current;
        if (!invite || invite.callId !== cancel.callId) return;

        clearCallTimeout();
        stopRingtone();

        if (activeCallState.status === 'connected') {
          activeInviteRef.current = null;
          disconnectRoom(cancel.reason === 'ended' ? 'Call ended' : undefined);
          if (cancel.reason === 'ended') {
            setCallOverlayState({ mode: 'ended', invite, reason: 'Call ended' });
          } else {
            setCallOverlayState(IDLE_CALL_OVERLAY);
            setActiveCallState(IDLE_ACTIVE_CALL);
          }
          return;
        }

        if (callOverlayState.mode === 'incoming' || callOverlayState.mode === 'outgoing' || callOverlayState.mode === 'connecting') {
          activeInviteRef.current = null;
          if (cancel.reason === 'missed') {
            setCallOverlayState({ mode: 'ended', invite, reason: 'No answer' });
          } else if (cancel.reason === 'ended') {
            setCallOverlayState({ mode: 'ended', invite, reason: 'Call ended' });
          } else {
            setCallOverlayState(IDLE_CALL_OVERLAY);
            setActiveCallState(IDLE_ACTIVE_CALL);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCallState.status, callOverlayState.mode, clearCallTimeout, connectionRecords, disconnectRoom, endWithReason, insertDeclinedCallLog, joinCall, playRingtone, sendSignal, showBrowserNotification, stopRingtone, user?.id]);

  useEffect(() => {
    return () => {
      stopRingtone();
      clearCallTimeout();
      disconnectRoom();
      const supabase = getSupabaseClient();
      outboundCallChannelsRef.current.forEach((channel) => {
        supabase?.removeChannel(channel);
      });
      outboundCallChannelsRef.current.clear();
    };
  }, [clearCallTimeout, disconnectRoom, stopRingtone]);

  return {
    callOverlayState,
    activeCallState,
    startOutgoingCall,
    acceptIncomingCall,
    declineIncomingCall,
    cancelPendingCall,
    dismissEndedCall,
    endActiveCall,
    toggleMicrophone,
    toggleCamera,
  };
}
