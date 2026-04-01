'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { coerceMessageType, insertCallLogMessage } from '@/lib/chat/messages';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import { motion, AnimatePresence } from 'framer-motion';
import { Room, RoomEvent, Track } from 'livekit-client';
import {
  MapPin,
  Settings,
  Users,
  QrCode,
  BookOpen,
  Sparkles,
  MessageCircle,
  MoreHorizontal
} from 'lucide-react';
import SettingsView from '@/components/SettingsView';
import { ChatView } from '@/components/chat';
import InterestTagging from '@/components/InterestTagging';
import { deriveKeysForConnection, decryptContent, isEncrypted } from '@/lib/chat/crypto';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';

// Digital Memory Box components
import {
  ConnectionTable,
  TimeCapsule,
  QRIdentityCard,
  StatsOverview,
  AchievementBadge,
  MilestoneProgress,
  ConnectionMap
} from '@/components/dashboard';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { TimelineChapter } from '@/components/dashboard/TimeCapsule';
import CallOverlay, {
  type WebActiveCallState,
  type WebCallInvite,
  type WebCallOverlayState,
} from '@/components/chat/CallOverlay';
import UserProfileModal from '@/components/UserProfileModal';

/** Matches `CallPushNotifier.kt` → `send-push-notification` for `incoming_call` / VoIP wake-up. */
function buildIncomingCallPushPayload(invite: WebCallInvite) {
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
import {
  downloadCSV,
  generateChaptersFromConnections
} from '@/lib/dashboard/mockData';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications/preferences';
import {
  buildDashboardMetrics,
  getNextMilestone,
  getUnlockedAchievements,
} from '@/lib/dashboard/userMetrics';
import {
  extractEventContext,
  extractNoiseSummary,
  extractWeatherSummary,
  normalizeNoiseCategory,
} from '@/lib/dashboard/connectionExtras';

type DashboardTab = 'memory' | 'map' | 'chat' | 'identity' | 'settings';

interface DashboardViewProps {
  user: any;
}

interface ChatListMetadata {
  preview: string | null;
  lastMessageAt: number | null;
  chatUpdatedAt: number | null;
}

const IDLE_CALL_OVERLAY: WebCallOverlayState = { mode: 'idle' };

const IDLE_ACTIVE_CALL: WebActiveCallState = {
  status: 'idle',
  invite: null,
  microphoneEnabled: true,
  cameraEnabled: false,
  remoteVideoTrack: null,
  localVideoTrack: null,
};

/**
 * DashboardView - The Digital Memory Box experience
 * Combines connections, timeline, map, QR identity, and settings
 */
export default function DashboardView({ user }: DashboardViewProps) {
  const { signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('memory');
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  const [chapters, setChapters] = useState<TimelineChapter[]>([]);
  /** The connection whose chat is currently open, or null */
  const [selectedConnection, setSelectedConnection] = useState<ConnectionRecord | null>(null);
  const [chatListTab, setChatListTab] = useState<'active' | 'archived'>('active');
  const [archivedConnectionIds, setArchivedConnectionIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [menuConnectionId, setMenuConnectionId] = useState<string | null>(null);
  const [suppressClickConnectionId, setSuppressClickConnectionId] = useState<string | null>(null);
  const [archiveTableAvailable, setArchiveTableAvailable] = useState(true);
  const [chatMetadataByConnectionId, setChatMetadataByConnectionId] = useState<Record<string, ChatListMetadata>>({});
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [callOverlayState, setCallOverlayState] = useState<WebCallOverlayState>(IDLE_CALL_OVERLAY);
  const [activeCallState, setActiveCallState] = useState<WebActiveCallState>(IDLE_ACTIVE_CALL);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const outboundCallChannelsRef = useRef<Map<string, any>>(new Map());
  const activeInviteRef = useRef<WebCallInvite | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRef = useRef<Room | null>(null);
  const remoteAudioElementsRef = useRef<HTMLElement[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const callConnectedAtRef = useRef<number | null>(null);
  const completedCallLoggedRef = useRef(false);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTabRef = useRef<DashboardTab>(activeTab);
  const selectedConnectionRef = useRef<ConnectionRecord | null>(selectedConnection);
  const notificationPreferencesRef = useRef<NotificationPreferences>(notificationPreferences);
  const connectionMapRef = useRef<Map<string, ConnectionRecord>>(new Map());
  const chatConnectionMapRef = useRef<Map<string, string>>(new Map());

  // Interest tagging onboarding gate
  const [needsTagging, setNeedsTagging] = useState<boolean | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const supabase = getSupabaseClient();
    if (!supabase) return { 'Content-Type': 'application/json' };
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, []);

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

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedConnectionRef.current = selectedConnection;
  }, [selectedConnection]);

  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  useEffect(() => {
    connectionMapRef.current = new Map(connectionRecords.map((connection) => [connection.id, connection]));
  }, [connectionRecords]);

  const showBrowserNotification = useCallback((
    title: string,
    body: string,
    onClick?: () => void,
  ) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      silent: false,
    });

    notification.onclick = () => {
      notification.close();
      window.focus();
      onClick?.();
    };
  }, []);

  const persistNotificationPreferences = useCallback(async (preferences: NotificationPreferences) => {
    const previousPreferences = notificationPreferencesRef.current;
    setNotificationPreferences(preferences);

    if (!user?.id) {
      return { success: true };
    }

    const result = await saveNotificationPreferences(getSupabaseClient(), user.id, preferences);
    if (!result.success) {
      setNotificationPreferences(previousPreferences);
    }
    return result;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      return;
    }

    let cancelled = false;

    const loadPreferences = async () => {
      const preferences = await loadNotificationPreferences(getSupabaseClient(), user.id);
      if (!cancelled) {
        setNotificationPreferences(preferences);
      }
    };

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
          roomName: invite.roomName,
          participantName:
            displayNameFromUserMetadata(user.user_metadata) || user.email?.split('@')[0] || 'Click User',
          userId: user.id,
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

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === 'video') {
          setActiveCallState((current) => ({ ...current, remoteVideoTrack: track }));
        }

        if (track.kind === 'audio') {
          const element = track.attach();
          element.autoplay = true;
          element.style.display = 'none';
          document.body.appendChild(element);
          remoteAudioElementsRef.current.push(element);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
        if (track.kind === 'video') {
          setActiveCallState((current) => ({ ...current, remoteVideoTrack: null }));
        }
      });

      room.on(RoomEvent.LocalTrackPublished, (publication: any) => {
        if (publication.track?.source === Track.Source.Camera) {
          setActiveCallState((current) => ({ ...current, localVideoTrack: publication.track }));
        }
      });

      room.on(RoomEvent.LocalTrackUnpublished, (publication: any) => {
        if (publication.track?.source === Track.Source.Camera) {
          setActiveCallState((current) => ({ ...current, localVideoTrack: null }));
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (room.remoteParticipants.size === 0) {
          endWithReason(invite, 'Call ended');
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        endWithReason(invite, 'Call ended');
      });

      await room.connect(payload.wsUrl, payload.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      if (invite.videoEnabled) {
        await room.localParticipant.setCameraEnabled(true);
      }

      const localCameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
      callConnectedAtRef.current = Date.now();
      completedCallLoggedRef.current = false;
      setActiveCallState((current) => ({
        ...current,
        status: 'connected',
        localVideoTrack: localCameraTrack,
        cameraEnabled: invite.videoEnabled,
        microphoneEnabled: true,
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
    if (!user?.id || !connection.otherUserId) {
      endWithReason(null, 'Unable to start a call for this connection');
      return;
    }

    if (callOverlayState.mode !== 'idle' || activeCallState.status !== 'idle') {
      return;
    }

    callConnectedAtRef.current = null;
    completedCallLoggedRef.current = false;

    const now = Date.now();
    const invite: WebCallInvite = {
      callId: `call-${now}-${Math.floor(Math.random() * 9000 + 1000)}`,
      connectionId: connection.id,
      roomName: `click-${connection.id}-${now}`,
      callerId: user.id,
      callerName:
        displayNameFromUserMetadata(user.user_metadata) || user.email?.split('@')[0] || 'Click User',
      calleeId: connection.otherUserId,
      calleeName: connection.name,
      videoEnabled,
      createdAt: now,
    };

    activeInviteRef.current = invite;
    setCallOverlayState({ mode: 'outgoing', invite });
    setActiveCallState({ ...IDLE_ACTIVE_CALL, invite });
    playRingtone('outgoing');
    invokeIncomingCallPush(invite);
    const delivered = await sendSignal(connection.otherUserId, 'invite', invite);
    if (!delivered) {
      stopRingtone();
      endWithReason(invite, 'Unable to reach this connection right now');
      return;
    }

    clearCallTimeout();
    callTimeoutRef.current = setTimeout(() => {
      void sendSignal(connection.otherUserId!, 'cancel', {
        callId: invite.callId,
        connectionId: invite.connectionId,
        senderId: invite.callerId,
        reason: 'missed',
      });
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
    await notifyPeerCallEnded(invite, 'ended');
    disconnectRoom();
    activeInviteRef.current = null;
    setCallOverlayState(IDLE_CALL_OVERLAY);
    setActiveCallState(IDLE_ACTIVE_CALL);
  }, [disconnectRoom, notifyPeerCallEnded, stopRingtone]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !activeCallState.microphoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setActiveCallState((current) => ({ ...current, microphoneEnabled: next }));
  }, [activeCallState.microphoneEnabled]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !activeCallState.cameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    const localCameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
    setActiveCallState((current) => ({ ...current, cameraEnabled: next, localVideoTrack: localCameraTrack }));
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
  }, [activeCallState.status, callOverlayState.mode, clearCallTimeout, connectionRecords, disconnectRoom, endWithReason, insertDeclinedCallLog, joinCall, playRingtone, sendSignal, showBrowserNotification, stopRingtone, user?.id]);

  useEffect(() => {
    if (!user?.id || connectionRecords.length === 0) {
      chatConnectionMapRef.current = new Map();
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const primeChatMap = async () => {
      const connectionIds = connectionRecords.map((connection) => connection.id);
      const { data, error } = await supabase
        .from('chats')
        .select('id, connection_id')
        .in('connection_id', connectionIds);

      if (error) {
        console.error('Error priming chat notification map:', error.message || error);
      } else if (!cancelled) {
        chatConnectionMapRef.current = new Map(
          (data ?? []).map((chat: any) => [String(chat.id), String(chat.connection_id)])
        );
      }

      channel = supabase
        .channel(`dashboard:messages:${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
          void (async () => {
            const message = payload.new as {
              chat_id: string;
              user_id: string;
              content: string;
              time_created: number;
              message_type?: string;
            };
            if (!message || message.user_id === user.id) return;

            let connectionId = chatConnectionMapRef.current.get(message.chat_id);
            if (!connectionId) {
              const { data: chatRow, error: chatError } = await supabase
                .from('chats')
                .select('connection_id')
                .eq('id', message.chat_id)
                .maybeSingle();

              if (chatError || !chatRow?.connection_id) {
                return;
              }

              connectionId = String(chatRow.connection_id);
              chatConnectionMapRef.current.set(message.chat_id, connectionId);
            }

            const connection = connectionMapRef.current.get(connectionId);
            if (!connection) return;

            let decryptedPreview = typeof message.content === 'string' ? message.content : '';
            const wasEncrypted = decryptedPreview.length > 0 && isEncrypted(decryptedPreview);
            let decryptFailed = false;
            if (wasEncrypted) {
              try {
                if (connection.userIds && connection.userIds.length >= 2) {
                  const keys = await deriveKeysForConnection(connection.id, connection.userIds);
                  decryptedPreview = await decryptContent(decryptedPreview, keys);
                } else {
                  decryptFailed = true;
                  decryptedPreview = '';
                }
              } catch {
                decryptFailed = true;
                decryptedPreview = '';
              }
            }

            const mt = coerceMessageType(message.message_type);
            const listPreview =
              decryptFailed && mt === 'text'
                ? 'Tap to view message'
                : previewLabelForMessage({
                    message_type: mt,
                    content: decryptedPreview,
                  });

            setChatMetadataByConnectionId((current) => ({
              ...current,
              [connection.id]: {
                preview: listPreview,
                lastMessageAt: message.time_created,
                chatUpdatedAt: message.time_created,
              },
            }));

            const isActiveVisibleChat =
              activeTabRef.current === 'chat' &&
              selectedConnectionRef.current?.id === connection.id &&
              typeof document !== 'undefined' &&
              document.visibilityState === 'visible';

            if (!notificationPreferencesRef.current.messagePushEnabled || isActiveVisibleChat) {
              return;
            }

            const preview =
              listPreview.length > 140 ? `${listPreview.slice(0, 137)}...` : listPreview;

            showBrowserNotification(
              connection.name,
              preview,
              () => {
                setSelectedConnection(connection);
                setActiveTab('chat');
              },
            );
          })();
        })
        .subscribe();
    };

    void primeChatMap();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [connectionRecords, showBrowserNotification, user?.id]);

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

  useEffect(() => {
    if (user) {
      // A row in public.user_interests means the user completed or skipped interest onboarding.
      const checkUserInterestsRow = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setNeedsTagging(false);
          return;
        }
        try {
          const { data, error } = await supabase
            .from('user_interests')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (error) {
            setNeedsTagging(false);
            return;
          }
          setNeedsTagging(data == null);
        } catch {
          setNeedsTagging(false);
        }
      };
      checkUserInterestsRow();
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id || connectionRecords.length === 0) {
      setChatMetadataByConnectionId({});
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setChatMetadataByConnectionId({});
      return;
    }

    let cancelled = false;

    const loadChatMetadata = async () => {
      const connectionIds = connectionRecords
        .filter((connection) => connection.status === 'kept' || connection.status === 'pending')
        .map((connection) => connection.id);

      if (connectionIds.length === 0) {
        if (!cancelled) setChatMetadataByConnectionId({});
        return;
      }

      try {
        const { data: chats, error: chatError } = await supabase
          .from('chats')
          .select('id, connection_id, updated_at')
          .in('connection_id', connectionIds);

        if (chatError) {
          console.error('Error fetching chats for dashboard list:', chatError.message || chatError);
          if (!cancelled) setChatMetadataByConnectionId({});
          return;
        }

        if (!chats || chats.length === 0) {
          if (!cancelled) setChatMetadataByConnectionId({});
          return;
        }

        const latestMessages = await Promise.all(
          chats.map(async (chat: any) => {
            const { data: message, error: messageError } = await supabase
              .from('messages')
              .select('content, time_created, message_type')
              .eq('chat_id', chat.id)
              .order('time_created', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (messageError) {
              console.error(`Error fetching latest message for chat ${chat.id}:`, messageError.message || messageError);
              return {
                connectionId: chat.connection_id as string,
                preview: null,
                lastMessageAt: null,
                chatUpdatedAt: typeof chat.updated_at === 'number' ? chat.updated_at : null,
              };
            }

            if (!message) {
              return {
                connectionId: chat.connection_id as string,
                preview: null,
                lastMessageAt: null,
                chatUpdatedAt: typeof chat.updated_at === 'number' ? chat.updated_at : null,
              };
            }

            let raw: string = typeof message.content === 'string' ? message.content : '';
            const wasEncrypted = raw.length > 0 && isEncrypted(raw);
            let decryptFailed = false;
            if (wasEncrypted) {
              try {
                const conn = connectionMapRef.current.get(chat.connection_id as string);
                if (conn?.userIds && conn.userIds.length >= 2) {
                  const keys = await deriveKeysForConnection(conn.id, conn.userIds);
                  raw = await decryptContent(raw, keys);
                } else {
                  decryptFailed = true;
                  raw = '';
                }
              } catch {
                decryptFailed = true;
                raw = '';
              }
            }

            const messageType = coerceMessageType(message.message_type);
            let preview: string | null;
            if (decryptFailed && messageType === 'text') {
              preview = 'Tap to view message';
            } else {
              preview = previewLabelForMessage({
                message_type: messageType,
                content: raw,
              });
            }

            return {
              connectionId: chat.connection_id as string,
              preview,
              lastMessageAt: typeof message.time_created === 'number' ? message.time_created : null,
              chatUpdatedAt: typeof chat.updated_at === 'number' ? chat.updated_at : null,
            };
          })
        );

        if (cancelled) return;

        setChatMetadataByConnectionId(
          latestMessages.reduce<Record<string, ChatListMetadata>>((acc, entry) => {
            acc[entry.connectionId] = {
              preview: entry.preview,
              lastMessageAt: entry.lastMessageAt,
              chatUpdatedAt: entry.chatUpdatedAt,
            };
            return acc;
          }, {})
        );
      } catch (error) {
        console.error('Unexpected chat metadata load error:', error);
        if (!cancelled) setChatMetadataByConnectionId({});
      }
    };

    loadChatMetadata();

    return () => {
      cancelled = true;
    };
  }, [connectionRecords, selectedConnection, user?.id]);

  const handleTagsComplete = async (tags: string[]) => {
    const supabase = getSupabaseClient();
    if (supabase) {
      const updatedAt = Date.now();
      const { error } = await supabase.from('user_interests').upsert(
        { user_id: user.id, tags, updated_at: updatedAt },
        { onConflict: 'user_id' },
      );
      if (error) {
        console.error('user_interests upsert failed:', error.message || error);
      }
    }
    setNeedsTagging(false);
  };

  const handleTagsSkip = async () => {
    setNeedsTagging(false);
    const supabase = getSupabaseClient();
    if (supabase) {
      const updatedAt = Date.now();
      try {
        await supabase.from('user_interests').upsert(
          { user_id: user.id, tags: [], updated_at: updatedAt },
          { onConflict: 'user_id' },
        );
      } catch (e) {
        console.error('user_interests skip upsert failed:', e);
      }
    }
  };

  const loadConnections = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) {
      setConnectionRecords([]);
      setChapters(generateChaptersFromConnections([]));
      return;
    }

    const setEmptyConnections = () => {
      setConnectionRecords([]);
      setChapters(generateChaptersFromConnections([]));
    };

    try {
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .contains('user_ids', [user.id])
        .order('created', { ascending: false });

      if (error) {
        console.error('Error fetching connections:', error.message || error);
        setEmptyConnections();
      } else if (data && data.length > 0) {
        // Resolve other user names from the users table
        const otherUserIds = data.flatMap((conn: any) =>
          (conn.user_ids || []).filter((id: string) => id !== user.id)
        ).filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i);

        let userNameMap: Record<string, string> = {};
        if (otherUserIds.length > 0) {
          // Resolve names through the server so we can fall back to auth metadata
          // when profile rows are incomplete.
          try {
            const nameRes = await fetch('/api/users/display-names', {
              method: 'POST',
              headers: await getAuthHeaders(),
              body: JSON.stringify({ userIds: otherUserIds }),
            });
            if (nameRes.ok) {
              const payload = await nameRes.json();
              userNameMap = payload?.names ?? {};
            }
          } catch {
            // Fall through to direct DB lookup below.
          }

          if (Object.keys(userNameMap).length === 0) {
            // Fallback path if the server helper is unavailable.
            let usersData: any[] | null = null;
            const { data: d1, error: e1 } = await supabase
              .from('users')
              .select('id, name, full_name, first_name, last_name, email')
              .in('id', otherUserIds);
            if (!e1 && d1) {
              usersData = d1;
            } else {
              const { data: d2 } = await supabase
                .from('users')
                .select('id, name, email')
                .in('id', otherUserIds);
              usersData = d2;
            }

            if (usersData) {
              userNameMap = Object.fromEntries(
                usersData.map((u: any) => {
                  const fromParts = [u.first_name, u.last_name]
                    .filter((x: unknown) => typeof x === 'string' && (x as string).trim())
                    .join(' ')
                    .trim();
                  const resolvedName =
                    fromParts ||
                    (typeof u.full_name === 'string' && u.full_name.trim()) ||
                    (typeof u.name === 'string' && u.name.trim()) ||
                    (typeof u.email === 'string' && u.email.includes('@') ? u.email.split('@')[0] : '') ||
                    '';
                  return [u.id, resolvedName];
                })
              );
            }
          }
        }

        const records: ConnectionRecord[] = data.map((conn: any) => {
          // Resolve the other user's name
          const otherUserId = (conn.user_ids || []).find((id: string) => id !== user.id);
          const otherUserName = (otherUserId && userNameMap[otherUserId]) || null;

          // Parse geo_location — DB stores { lat, lon }, filter out invalid coords
          let geoLoc: { latitude: number; longitude: number } | undefined;
          if (conn.geo_location) {
            const rawLat = conn.geo_location.lat ?? conn.geo_location.latitude;
            const rawLon = conn.geo_location.lon ?? conn.geo_location.longitude ?? conn.geo_location.lng ?? conn.geo_location.long;
            const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
            const lon = typeof rawLon === 'number' ? rawLon : Number(rawLon);
            if (
              typeof lat === 'number' && typeof lon === 'number' &&
              isFinite(lat) && isFinite(lon) &&
              !(lat === 0 && lon === 0)
            ) {
              geoLoc = { latitude: lat, longitude: lon };
            }
          }

          const displayName =
            (typeof otherUserName === 'string' && otherUserName.trim()) ||
            'Connection';

          const raw = conn as Record<string, unknown>;

          return {
            id: conn.id,
            otherUserId,
            userIds: conn.user_ids || [],
            name: displayName,
            dateMet: new Date(conn.created_utc || conn.created || conn.created_at),
            location: conn.semantic_location || 'Unknown location',
            context: extractEventContext(raw),
            weatherSummary: extractWeatherSummary(raw),
            noiseSummary: extractNoiseSummary(raw),
            noiseCategory: normalizeNoiseCategory(raw),
            status: conn.status || 'kept',
            geo_location: geoLoc,
          };
        });

        setConnectionRecords(records);
        setChapters(generateChaptersFromConnections(records));
      } else {
        setEmptyConnections();
      }
    } catch (err) {
      console.error('Unexpected error fetching connections:', err);
      setEmptyConnections();
    }
  }, [user, getAuthHeaders]);

  // Fetch user connections (initial load)
  useEffect(() => {
    if (!user) return;
    void loadConnections();
  }, [user, loadConnections]);

  // Stay in sync when a new connection is created or updated (e.g. app user scans this user’s web QR)
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`dashboard-connections:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connections' },
        () => {
          void loadConnections();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, loadConnections]);

  // Handle CSV export
  const handleExport = useCallback(() => {
    downloadCSV(connectionRecords, `click-connections-${user.email?.split('@')[0] || 'user'}`);
  }, [connectionRecords, user]);

  // Shared handler: open chat for a specific connection
  const handleOpenChat = useCallback((conn: ConnectionRecord) => {
    setSelectedConnection(conn);
    setActiveTab('chat');
  }, []);

  const userName =
    displayNameFromUserMetadata(user?.user_metadata) || user?.email?.split('@')[0] || 'User';

  const archiveStorageKey = user?.id ? `click:archived-connections:${user.id}` : null;

  const isMissingArchiveTableError = useCallback((error: any) => {
    const code = error?.code;
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST205' ||
      message.includes('connection_archives') ||
      message.includes('schema cache');
  }, []);

  const writeArchivedToLocalStorage = useCallback((ids: Set<string>) => {
    if (!archiveStorageKey || typeof window === 'undefined') return;
    localStorage.setItem(archiveStorageKey, JSON.stringify(Array.from(ids)));
  }, [archiveStorageKey]);

  useEffect(() => {
    if (!user?.id) return;

    const loadArchived = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        if (archiveStorageKey && typeof window !== 'undefined') {
          const raw = localStorage.getItem(archiveStorageKey);
          if (raw) {
            try {
              setArchivedConnectionIds(new Set(JSON.parse(raw)));
            } catch {
              setArchivedConnectionIds(new Set());
            }
          }
        }
        return;
      }

      try {
        if (!archiveTableAvailable) {
          if (archiveStorageKey && typeof window !== 'undefined') {
            const raw = localStorage.getItem(archiveStorageKey);
            if (raw) {
              try {
                setArchivedConnectionIds(new Set(JSON.parse(raw)));
              } catch {
                setArchivedConnectionIds(new Set());
              }
            }
          }
          return;
        }

        const { data, error } = await supabase
          .from('connection_archives')
          .select('connection_id')
          .eq('user_id', user.id);

        if (error) {
          if (isMissingArchiveTableError(error)) {
            setArchiveTableAvailable(false);
          }
          if (archiveStorageKey && typeof window !== 'undefined') {
            const raw = localStorage.getItem(archiveStorageKey);
            if (raw) {
              try {
                setArchivedConnectionIds(new Set(JSON.parse(raw)));
              } catch {
                setArchivedConnectionIds(new Set());
              }
            }
          }
          return;
        }

        const ids = new Set<string>((data ?? []).map((row: any) => row.connection_id));
        setArchivedConnectionIds(ids);
        writeArchivedToLocalStorage(ids);
      } catch {
        if (archiveStorageKey && typeof window !== 'undefined') {
          const raw = localStorage.getItem(archiveStorageKey);
          if (raw) {
            try {
              setArchivedConnectionIds(new Set(JSON.parse(raw)));
            } catch {
              setArchivedConnectionIds(new Set());
            }
          }
        }
      }
    };

    loadArchived();
  }, [archiveStorageKey, archiveTableAvailable, isMissingArchiveTableError, user?.id, writeArchivedToLocalStorage]);

  useEffect(() => {
    if (!user?.id) return;

    const loadBlocks = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from('user_blocks')
          .select('blocked_id')
          .eq('blocker_id', user.id);

        if (error) {
          console.error('Error loading blocks:', error.message || error);
          return;
        }

        setBlockedUserIds(new Set((data ?? []).map((row: any) => row.blocked_id)));
      } catch (err) {
        console.error('Unexpected block load error:', err);
      }
    };

    loadBlocks();
  }, [user?.id]);

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-connection-menu]') || target.closest('[data-connection-menu-trigger]')) {
        return;
      }
      setMenuConnectionId(null);
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const updateArchivedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setArchivedConnectionIds((prev) => {
      const next = updater(prev);
      writeArchivedToLocalStorage(next);
      return next;
    });
  }, [writeArchivedToLocalStorage]);

  const archiveConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    updateArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(connectionId);
      return next;
    });
    setMenuConnectionId(null);

    const supabase = getSupabaseClient();
    if (!supabase || !user?.id || !archiveTableAvailable) return true;
    try {
      const { error } = await supabase
        .from('connection_archives')
        .insert({ user_id: user.id, connection_id: connectionId });

      if (error && error.code !== '23505') {
        if (isMissingArchiveTableError(error)) {
          setArchiveTableAvailable(false);
          return true;
        }
        console.error('Error archiving connection:', error.message || error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Unexpected archive error:', err);
      return false;
    }
  }, [archiveTableAvailable, isMissingArchiveTableError, updateArchivedIds, user?.id]);

  const unarchiveConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    updateArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(connectionId);
      return next;
    });
    setMenuConnectionId(null);
    setChatListTab('active');

    const supabase = getSupabaseClient();
    if (!supabase || !user?.id || !archiveTableAvailable) return true;
    try {
      const { error } = await supabase
        .from('connection_archives')
        .delete()
        .eq('user_id', user.id)
        .eq('connection_id', connectionId);

      if (error) {
        if (isMissingArchiveTableError(error)) {
          setArchiveTableAvailable(false);
          return true;
        }
        console.error('Error unarchiving connection:', error.message || error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Unexpected unarchive error:', err);
      return false;
    }
  }, [archiveTableAvailable, isMissingArchiveTableError, updateArchivedIds, user?.id]);

  const openActionMenu = useCallback((connectionId: string) => {
    setMenuConnectionId((prev) => (prev === connectionId ? null : connectionId));
  }, []);

  const removeConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const prev = connectionRecords;
    setConnectionRecords((records) => records.filter((record) => record.id !== connectionId));
    updateArchivedIds((ids) => {
      const next = new Set(ids);
      next.delete(connectionId);
      return next;
    });

    try {
      const { error } = await supabase
        .from('connections')
        .delete()
        .eq('id', connectionId);

      if (error) {
        throw error;
      }
      setMenuConnectionId(null);
      return true;
    } catch (err) {
      console.error('Error removing connection:', err);
      setConnectionRecords(prev);
      return false;
    }
  }, [connectionRecords, updateArchivedIds]);

  const reportConnection = useCallback(async (connectionId: string, reason: string): Promise<boolean> => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) return false;

    try {
      const response = await fetch('/api/safety/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, reason: trimmedReason }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to submit report');
      }
      setMenuConnectionId(null);
      return true;
    } catch (err) {
      console.error('Error reporting connection:', err);
      return false;
    }
  }, []);

  const blockUser = useCallback(async (connection: ConnectionRecord): Promise<boolean> => {
    if (!connection.otherUserId) return false;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/safety/block', {
        method: 'POST',
        headers,
        body: JSON.stringify({ blocked_id: connection.otherUserId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to block user');
      }

      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        next.add(connection.otherUserId!);
        return next;
      });

      const removed = await removeConnection(connection.id);
      return removed;
    } catch (err) {
      console.error('Error blocking user:', err);
      return false;
    }
  }, [getAuthHeaders, removeConnection]);

  const unblockUser = useCallback(async (connection: ConnectionRecord): Promise<boolean> => {
    if (!connection.otherUserId) return false;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/safety/block?blocked_id=${encodeURIComponent(connection.otherUserId)}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to unblock user');
      }

      setBlockedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(connection.otherUserId!);
        return next;
      });
      setMenuConnectionId(null);
      return true;
    } catch (err) {
      console.error('Error unblocking user:', err);
      return false;
    }
  }, [getAuthHeaders]);

  const startLongPress = useCallback((connectionId: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setSuppressClickConnectionId(connectionId);
      setMenuConnectionId(connectionId);
    }, 450);
  }, []);

  const endLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const chatCandidates = useMemo(
    () => connectionRecords
      .filter((c) => c.status === 'kept' || c.status === 'pending')
      .map((connection) => {
        const metadata = chatMetadataByConnectionId[connection.id];
        return {
          ...connection,
          chatPreview: metadata?.preview ?? null,
          chatLastMessageAt: metadata?.lastMessageAt ?? null,
          chatUpdatedAt: metadata?.chatUpdatedAt ?? null,
        };
      })
      .sort((left, right) => {
        const leftTimestamp = left.chatLastMessageAt ?? left.chatUpdatedAt ?? left.dateMet.getTime();
        const rightTimestamp = right.chatLastMessageAt ?? right.chatUpdatedAt ?? right.dateMet.getTime();
        return rightTimestamp - leftTimestamp;
      }),
    [chatMetadataByConnectionId, connectionRecords]
  );

  const activeConnections = useMemo(
    () => chatCandidates.filter((c) => !archivedConnectionIds.has(c.id)),
    [chatCandidates, archivedConnectionIds]
  );

  const archivedConnections = useMemo(
    () => chatCandidates.filter((c) => archivedConnectionIds.has(c.id)),
    [chatCandidates, archivedConnectionIds]
  );

  const dashboardMetrics = useMemo(
    () => buildDashboardMetrics(connectionRecords),
    [connectionRecords]
  );

  const unlockedAchievements = useMemo(
    () => getUnlockedAchievements(dashboardMetrics),
    [dashboardMetrics]
  );

  const nextMilestone = useMemo(
    () => getNextMilestone(dashboardMetrics.totalConnections),
    [dashboardMetrics.totalConnections]
  );

  const visibleChatConnections = chatListTab === 'active' ? activeConnections : archivedConnections;

  const formatChatActivity = useCallback((timestamp?: number | null) => {
    if (!timestamp) return null;

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = timestamp - now.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (Math.abs(diffMinutes) < 1) return 'just now';
    if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute');
    if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
    if (Math.abs(diffDays) < 6) return rtf.format(diffDays, 'day');

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    });
  }, []);

  const tabs: { id: DashboardTab; label: string; icon: any }[] = [
    { id: 'memory', label: 'Memory Box', icon: BookOpen },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'identity', label: 'QR Identity', icon: QrCode },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Interest tagging onboarding overlay */}
      {needsTagging === true && (
        <InterestTagging
          onComplete={handleTagsComplete}
          onSkip={handleTagsSkip}
          canSkip={true}
        />
      )}

      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[150px] opacity-10" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3A86FF] rounded-full blur-[150px] opacity-10" />
      </div>

      {/* Main content */}
      <div className="relative z-10">
        {/* Welcome header */}
        <div className="px-6 md:px-12 pt-6 pb-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <Sparkles className="w-5 h-5 text-[#8338EC]" />
            <div>
              <h1 className="text-2xl font-bold">
                Welcome back, <span className="text-[#8338EC]">{userName}</span>
              </h1>
              <p className="text-sm text-zinc-500">Your digital memory box</p>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-800 sticky top-0 bg-zinc-950/80 backdrop-blur-sm z-20">
          <div className="px-6 md:px-12 flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-4 px-4 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id
                    ? 'text-[#8338EC]'
                    : 'text-zinc-400 hover:text-white'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8338EC]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 md:px-12 py-8">
          <AnimatePresence mode="wait">
            {/* Memory Box Tab */}
            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                {/* Stats Overview Section */}
                <section>
                  <StatsOverview
                    totalConnections={dashboardMetrics.totalConnections}
                    thisMonth={dashboardMetrics.thisMonth}
                    streak={dashboardMetrics.streak}
                    retentionRate={dashboardMetrics.retentionRate}
                  />
                </section>

                {/* Achievements & Milestones Row */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Recent Achievements</h3>
                    {unlockedAchievements.length === 0 ? (
                      <div className="p-4 glass rounded-xl border border-zinc-800 text-sm text-zinc-500">
                        No achievements yet. Connect with people to unlock your first badge.
                      </div>
                    ) : (
                      unlockedAchievements.slice(0, 5).map((achievement) => (
                        <AchievementBadge
                          key={achievement.id}
                          title={achievement.title}
                          description={achievement.description}
                          icon={achievement.icon}
                        />
                      ))
                    )}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">Next Milestone</h3>
                    <MilestoneProgress
                      current={dashboardMetrics.totalConnections}
                      target={nextMilestone.target}
                      label={nextMilestone.label}
                      reward={nextMilestone.reward}
                    />
                  </div>
                </section>

                {/* Time Capsule Section */}
                <section className="glass p-6 rounded-3xl border border-zinc-800">
                  <TimeCapsule chapters={chapters} onConnectionClick={handleOpenChat} />
                </section>

                {/* Connection Table Section */}
                <section className="glass p-6 rounded-3xl border border-zinc-800">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                      <Users className="w-5 h-5 text-[#8338EC]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">People I've Met</h2>
                      <p className="text-sm text-zinc-500">Your connection history</p>
                    </div>
                  </div>
                  <ConnectionTable
                    connections={connectionRecords}
                    onExport={handleExport}
                    onSelect={handleOpenChat}
                    onOpenProfile={(id) => setProfileUserId(id)}
                  />
                </section>

                {/* Data sovereignty notice */}
                <div className="text-center py-4">
                  <p className="text-xs text-zinc-600">
                    🔒 Your data belongs to you. Export anytime, delete anytime.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Map Tab */}
            {activeTab === 'map' && (
              <motion.div
                key="map"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                    <MapPin className="w-5 h-5 text-[#8338EC]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Click Map</h2>
                    <p className="text-sm text-zinc-500">Where your memories were made</p>
                  </div>
                </div>

                <ConnectionMap connections={connectionRecords} onConnectionClick={handleOpenChat} />
              </motion.div>
            )}

            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="h-[calc(100dvh-180px)] min-h-0 overflow-visible"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {selectedConnection ? (
                    <motion.div
                      key={selectedConnection.id}
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full min-h-0 overflow-visible"
                    >
                      <ChatView
                        connection={selectedConnection}
                        currentUserId={user.id}
                        otherUserName={selectedConnection.name}
                        isArchived={archivedConnectionIds.has(selectedConnection.id)}
                        isBlocked={selectedConnection.otherUserId ? blockedUserIds.has(selectedConnection.otherUserId) : false}
                        onArchive={() => archiveConnection(selectedConnection.id)}
                        onUnarchive={() => unarchiveConnection(selectedConnection.id)}
                        onRemove={() => removeConnection(selectedConnection.id)}
                        onReport={(reason) => reportConnection(selectedConnection.id, reason)}
                        onBlock={() => blockUser(selectedConnection)}
                        onUnblock={() => unblockUser(selectedConnection)}
                        onStartCall={(videoEnabled) => startOutgoingCall(selectedConnection, videoEnabled)}
                        onClose={() => setSelectedConnection(null)}
                        onOpenProfile={(id) => setProfileUserId(id)}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="chat-list"
                      initial={{ opacity: 0, x: -24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-6"
                    >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                        <MessageCircle className="w-5 h-5 text-[#8338EC]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Messages</h2>
                        <p className="text-sm text-zinc-500">Chat with your Clicks</p>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <motion.button
                        onClick={() => setChatListTab('active')}
                        whileTap={{ scale: 0.985 }}
                        className={`relative px-4 py-2 rounded-xl text-sm transition-colors duration-200 ${
                          chatListTab === 'active'
                            ? 'text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {chatListTab === 'active' ? (
                          <motion.span
                            layoutId="chatListTabPill"
                            className="absolute inset-0 rounded-xl border border-[#8338EC]/35 bg-[linear-gradient(135deg,rgba(131,56,236,0.28),rgba(58,134,255,0.18))] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_30px_rgba(131,56,236,0.16)]"
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          />
                        ) : null}
                        <span className="relative z-10 flex items-center gap-2">
                          <span>Active</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${chatListTab === 'active' ? 'bg-white/12 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                            {activeConnections.length}
                          </span>
                        </span>
                      </motion.button>
                      <motion.button
                        onClick={() => setChatListTab('archived')}
                        whileTap={{ scale: 0.985 }}
                        className={`relative px-4 py-2 rounded-xl text-sm transition-colors duration-200 ${
                          chatListTab === 'archived'
                            ? 'text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {chatListTab === 'archived' ? (
                          <motion.span
                            layoutId="chatListTabPill"
                            className="absolute inset-0 rounded-xl border border-zinc-600/50 bg-[linear-gradient(135deg,rgba(131,56,236,0.18),rgba(86,86,101,0.30))] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_30px_rgba(24,24,27,0.28)]"
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          />
                        ) : null}
                        <span className="relative z-10 flex items-center gap-2">
                          <span>Archived</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${chatListTab === 'archived' ? 'bg-white/10 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                            {archivedConnections.length}
                          </span>
                        </span>
                      </motion.button>
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={chatListTab}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {visibleChatConnections.length === 0 ? (
                          <div className="glass rounded-3xl border border-zinc-800 p-12 text-center">
                            <MessageCircle className="mx-auto mb-4 h-16 w-16 text-zinc-600" />
                            <h3 className="mb-2 text-xl font-semibold">
                              {chatListTab === 'active' ? 'No Active Conversations' : 'No Archived Conversations'}
                            </h3>
                            <p className="text-zinc-400">
                              {chatListTab === 'active'
                                ? 'Start meeting people and your chats will appear here!'
                                : 'Archived chats will appear here.'}
                            </p>
                          </div>
                        ) : (
                          <div className="glass overflow-visible rounded-3xl border border-zinc-800 divide-y divide-zinc-800/50">
                            {visibleChatConnections.map((conn, index) => {
                              const isArchived = archivedConnectionIds.has(conn.id);
                              const previewText = conn.chatPreview?.trim() || 'No messages yet';
                              const activityLabel = formatChatActivity(conn.chatLastMessageAt ?? conn.chatUpdatedAt);
                              const menuOpensUpward = index >= visibleChatConnections.length - 2;
                              const listPeerId =
                                conn.otherUserId ??
                                (user?.id ? conn.userIds?.find((id) => id !== user.id) : undefined);
                              return (
                                <div key={conn.id} className="relative">
                                  <motion.div
                                    role="button"
                                    tabIndex={0}
                                    whileHover={{ backgroundColor: 'rgba(131, 56, 236, 0.05)' }}
                                    whileTap={{ scale: 0.995 }}
                                    onClick={() => {
                                      if (suppressClickConnectionId === conn.id) {
                                        setSuppressClickConnectionId(null);
                                        return;
                                      }
                                      setSelectedConnection(conn);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== 'Enter' && e.key !== ' ') return;
                                      e.preventDefault();
                                      if (suppressClickConnectionId === conn.id) {
                                        setSuppressClickConnectionId(null);
                                        return;
                                      }
                                      setSelectedConnection(conn);
                                    }}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      setMenuConnectionId(conn.id);
                                    }}
                                    onTouchStart={() => startLongPress(conn.id)}
                                    onTouchEnd={endLongPress}
                                    onTouchCancel={endLongPress}
                                    className="w-full flex cursor-pointer items-start gap-4 px-5 py-4 pr-16 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8338EC]/50"
                                  >
                                    {listPeerId ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setProfileUserId(listPeerId);
                                        }}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8338EC]"
                                        aria-label={`View ${conn.name}'s profile`}
                                      >
                                        {conn.name.charAt(0).toUpperCase()}
                                      </button>
                                    ) : (
                                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-sm font-bold">
                                        {conn.name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate pr-2 font-semibold text-white">{conn.name}</p>
                                      <p className="mt-0.5 truncate pr-2 text-sm text-zinc-300">
                                        {previewText}
                                      </p>
                                      <p className="mt-1 truncate pr-2 text-xs text-zinc-400">
                                        {conn.location} · {conn.dateMet.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center self-start pt-0.5 pl-2">
                                      <div className="flex min-w-0 items-center justify-end gap-2">
                                        {activityLabel ? (
                                          <span className="shrink-0 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2 py-0.5 text-[11px] text-zinc-300">
                                            {activityLabel}
                                          </span>
                                        ) : null}
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                          {isArchived ? (
                                            <span className="shrink-0 rounded-full border border-zinc-600/40 bg-zinc-700/30 px-2 py-0.5 text-[10px] text-zinc-300">
                                              Archived
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openActionMenu(conn.id);
                                    }}
                                    data-connection-menu-trigger
                                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800/70 hover:text-white"
                                    aria-label={`Open actions for ${conn.name}`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>

                                  {menuConnectionId === conn.id && (
                                    <div
                                      data-connection-menu
                                      className={`absolute right-4 z-50 min-w-[140px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl ${menuOpensUpward ? 'bottom-[calc(50%+1.8rem)]' : 'top-[calc(50%+1.8rem)]'}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        onClick={() => {
                                          setSelectedConnection(conn);
                                          setMenuConnectionId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-800"
                                      >
                                        Open chat
                                      </button>
                                      {isArchived ? (
                                        <button
                                          onClick={() => unarchiveConnection(conn.id)}
                                          className="w-full text-left px-3 py-2 text-sm text-[#7cc3ff] hover:bg-zinc-800"
                                        >
                                          Unarchive
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => archiveConnection(conn.id)}
                                          className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                                        >
                                          Archive
                                        </button>
                                      )}
                                      <button
                                        onClick={async () => {
                                          const reason = window.prompt('Report reason');
                                          if (!reason) return;
                                          if (!window.confirm('Submit this report for moderation review?')) return;
                                          await reportConnection(conn.id, reason);
                                          setMenuConnectionId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-amber-300 hover:bg-zinc-800"
                                      >
                                        Report
                                      </button>
                                      {conn.otherUserId && blockedUserIds.has(conn.otherUserId) ? (
                                        <button
                                          onClick={async () => {
                                            await unblockUser(conn);
                                            setMenuConnectionId(null);
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm text-emerald-300 hover:bg-zinc-800"
                                        >
                                          Unblock
                                        </button>
                                      ) : (
                                        <button
                                          onClick={async () => {
                                            if (!window.confirm(`Block ${conn.name} and remove this connection?`)) return;
                                            await blockUser(conn);
                                            setMenuConnectionId(null);
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm text-orange-300 hover:bg-zinc-800"
                                        >
                                          Block
                                        </button>
                                      )}
                                      <button
                                        onClick={async () => {
                                          if (!window.confirm(`Remove your connection with ${conn.name}?`)) return;
                                          await removeConnection(conn.id);
                                          setMenuConnectionId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800"
                                      >
                                        Remove connection
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* QR Identity Tab */}
            {activeTab === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="max-w-md mx-auto"
              >
                <QRIdentityCard
                  userId={user.id}
                  userName={displayNameFromUserMetadata(user?.user_metadata)}
                  userEmail={user?.email}
                />
              </motion.div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <SettingsView
                  notificationPreferences={notificationPreferences}
                  onSaveNotificationPreferences={persistNotificationPreferences}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <CallOverlay
        currentUserId={user.id}
        overlayState={callOverlayState}
        activeCall={activeCallState}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
        onCancel={cancelPendingCall}
        onDismissEnded={dismissEndedCall}
        onEndCall={endActiveCall}
        onToggleMicrophone={toggleMicrophone}
        onToggleCamera={toggleCamera}
      />

      <UserProfileModal
        userId={profileUserId}
        getAuthHeaders={getAuthHeaders}
        onClose={() => setProfileUserId(null)}
      />

    </div>
  );
}