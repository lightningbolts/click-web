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
  MoreHorizontal,
  Clock,
  X,
  Zap,
  Volume2,
  Mountain,
} from 'lucide-react';
import SettingsView from '@/components/SettingsView';
import LoadingScreen from '@/components/LoadingScreen';
import { ChatView, CreateVerifiedClickDialog, memberSetKeySorted } from '@/components/chat';
import InterestTagging from '@/components/InterestTagging';
import {
  deriveKeysForConnection,
  decryptContent,
  isEncrypted,
  decryptGroupMessageContent,
  isGroupMessageEncrypted,
} from '@/lib/chat/crypto';
import { unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';
import {
  deleteCliqueRpc,
  leaveCliqueRpc,
  renameCliqueRpc,
} from '@/lib/chat/createVerifiedClick';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';

// Digital Memory Box components
import {
  ConnectionTable,
  TimeCapsule,
  QRIdentityCard,
  StatsOverview,
  AchievementBadge,
  MilestoneProgress,
  ConnectionMap,
} from '@/components/dashboard';
import MyAvailabilityIntentsCard from '@/components/dashboard/MyAvailabilityIntentsCard';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import CallOverlay, {
  type WebActiveCallState,
  type WebCallInvite,
  type WebCallOverlayState,
} from '@/components/chat/CallOverlay';
import UserProfileModal from '@/components/UserProfileModal';
import PostConnectionVibePrompt from '@/components/dashboard/PostConnectionVibePrompt';

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
import { parseConnectionEncounters } from '@/lib/dashboard/connectionEncounters';
import { computeIntentOverlapLabel } from '@/lib/dashboard/intentOverlap';
import {
  normalizeAvailabilityIntentRows,
  type AvailabilityIntentRow,
} from '@/lib/userProfile/availability';
import type { DisplayNamesBatchResponse } from '@/types/database-connections';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import {
  connectionRecordToArchiveRow,
  formatArchiveCountdownLabel,
  getArchiveCountdown,
  isActiveChatListStatus,
  normalizeConnectionStatus,
  shouldShowArchiveWarning,
} from '@/lib/dashboard/connectionStatus';

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
  const { signOut, onlineUserIds } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('memory');
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  /** Full history for the memory map (active + archived lifecycle), excluding `connection_hidden` only. */
  const [mapConnectionRecords, setMapConnectionRecords] = useState<ConnectionRecord[]>([]);
  const chapters = useMemo(
    () => generateChaptersFromConnections(connectionRecords),
    [connectionRecords],
  );
  /** The connection whose chat is currently open, or null */
  const [selectedConnection, setSelectedConnection] = useState<ConnectionRecord | null>(null);
  const [chatListTab, setChatListTab] = useState<'active' | 'archived'>('active');
  const [archivedConnectionIds, setArchivedConnectionIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [menuConnectionId, setMenuConnectionId] = useState<string | null>(null);
  const [suppressClickConnectionId, setSuppressClickConnectionId] = useState<string | null>(null);
  const [vibePromptConnection, setVibePromptConnection] = useState<ConnectionRecord | null>(null);
  const seenConnectionIdsRef = useRef<Set<string> | null>(null);
  const [archiveTableAvailable, setArchiveTableAvailable] = useState(true);
  const [chatMetadataByConnectionId, setChatMetadataByConnectionId] = useState<Record<string, ChatListMetadata>>({});
  const [groupCliqueRecords, setGroupCliqueRecords] = useState<ConnectionRecord[]>([]);
  const [verifiedClickMemberSetKeys, setVerifiedClickMemberSetKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupClicksReloadNonce, setGroupClicksReloadNonce] = useState(0);
  const [createClickOpen, setCreateClickOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [callOverlayState, setCallOverlayState] = useState<WebCallOverlayState>(IDLE_CALL_OVERLAY);
  const [activeCallState, setActiveCallState] = useState<WebActiveCallState>(IDLE_ACTIVE_CALL);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  /** Re-render countdown labels periodically */
  const [archiveCountdownTick, setArchiveCountdownTick] = useState(0);
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
  /** Verified clique rows keyed by `chats.id` (group message realtime + previews). */
  const groupRecordByChatIdRef = useRef<Map<string, ConnectionRecord>>(new Map());

  // Interest tagging onboarding gate
  const [needsTagging, setNeedsTagging] = useState<boolean | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [groupMemberPickerRows, setGroupMemberPickerRows] = useState<{ userId: string; label: string }[]>([]);
  const [showGroupMemberPicker, setShowGroupMemberPicker] = useState(false);
  const [groupMemberPickerBusy, setGroupMemberPickerBusy] = useState(false);
  const [chatListGroupRenameGroupId, setChatListGroupRenameGroupId] = useState<string | null>(null);
  const [chatListGroupRenameInput, setChatListGroupRenameInput] = useState('');
  const [chatListGroupRenameBusy, setChatListGroupRenameBusy] = useState(false);
  const [chatListGroupActionBusyId, setChatListGroupActionBusyId] = useState<string | null>(null);

  /** Avoid painting stats at 0 before the first `/api/connections` response (hydrates real counts). */
  const [connectionsInitialLoadComplete, setConnectionsInitialLoadComplete] = useState(false);
  const connectionsLoadUserIdRef = useRef<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const supabase = getSupabaseClient();
    if (!supabase) return { 'Content-Type': 'application/json' };
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, []);

  const openVerifiedCliqueMemberPicker = useCallback(async (memberUserIds: string[]) => {
    const ids = [...new Set(memberUserIds)].filter(Boolean).sort();
    if (ids.length === 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setGroupMemberPickerBusy(true);
    try {
      type UserMini = { id: string; name?: string | null; first_name?: string | null };
      let usersData: UserMini[] | null = null;
      const r1 = await supabase.from('users').select('id, name, full_name, first_name, last_name').in('id', ids);
      if (!r1.error && r1.data) {
        usersData = r1.data as UserMini[];
      } else {
        const r2 = await supabase.from('users').select('id, name').in('id', ids);
        if (!r2.error && r2.data) usersData = r2.data as UserMini[];
      }
      const labelFor = (u: { first_name?: string | null; name?: string | null }) => {
        const fn = u.first_name?.trim();
        if (fn) return fn;
        const n = u.name?.trim();
        if (n) return n.split(/\s+/)[0] ?? n;
        return 'Member';
      };
      const byId = new Map((usersData ?? []).map((u) => [u.id, labelFor(u)]));
      const rows = ids.map((id) => ({ userId: id, label: byId.get(id) ?? 'Member' }));
      setGroupMemberPickerRows(rows);
      setShowGroupMemberPicker(true);
    } finally {
      setGroupMemberPickerBusy(false);
    }
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

  useEffect(() => {
    groupRecordByChatIdRef.current = new Map(
      groupCliqueRecords
        .filter((r) => typeof r.groupChatId === 'string' && r.groupChatId.length > 0)
        .map((r) => [r.groupChatId as string, r]),
    );
  }, [groupCliqueRecords]);

  useEffect(() => {
    if (!user?.id) {
      setGroupCliqueRecords([]);
      setVerifiedClickMemberSetKeys(new Set());
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setGroupCliqueRecords([]);
      setVerifiedClickMemberSetKeys(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: memberships, error: memErr } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user.id);
        if (memErr || cancelled) {
          if (!cancelled) {
            setGroupCliqueRecords([]);
            setVerifiedClickMemberSetKeys(new Set());
          }
          return;
        }
        const groupIds = [...new Set((memberships ?? []).map((m: { group_id: string }) => m.group_id))];
        if (groupIds.length === 0) {
          if (!cancelled) {
            setGroupCliqueRecords([]);
            setVerifiedClickMemberSetKeys(new Set());
          }
          return;
        }
        const [
          { data: chats, error: chatErr },
          { data: groups, error: groupErr },
          { data: allMembers, error: membersKeyErr },
        ] = await Promise.all([
          supabase.from('chats').select('id, group_id, updated_at').in('group_id', groupIds),
          supabase.from('groups').select('id, name, created_by').in('id', groupIds),
          supabase.from('group_members').select('group_id, user_id').in('group_id', groupIds),
        ]);
        if (chatErr || groupErr || cancelled) {
          if (!cancelled) {
            setGroupCliqueRecords([]);
            setVerifiedClickMemberSetKeys(new Set());
          }
          return;
        }
        const byGroup = new Map<string, string[]>();
        if (!membersKeyErr && allMembers?.length) {
          for (const row of allMembers as { group_id: string; user_id: string }[]) {
            if (!row.group_id || !row.user_id) continue;
            const arr = byGroup.get(row.group_id) ?? [];
            arr.push(row.user_id);
            byGroup.set(row.group_id, arr);
          }
        }
        const memberKeys = new Set<string>();
        for (const gid of groupIds) {
          const ids = byGroup.get(gid);
          if (ids?.length) {
            memberKeys.add(memberSetKeySorted(ids));
          }
        }
        const groupMetaById = new Map(
          (groups ?? []).map((g: { id: string; name: string; created_by?: string }) => [
            g.id,
            { name: g.name, createdBy: g.created_by as string | undefined },
          ]),
        );
        const rows: ConnectionRecord[] = (chats ?? [])
          .filter((c: { group_id: string | null }) => c.group_id)
          .map((c: { id: string; group_id: string; updated_at: number | null }) => {
            const gid = c.group_id as string;
            const meta = groupMetaById.get(gid) as { name: string; createdBy?: string } | undefined;
            const title = meta?.name?.trim() || 'Click';
            const memberIds = (byGroup.get(gid) ?? []).slice().sort();
            return {
              id: gid,
              chatKind: 'group_clique' as const,
              groupChatId: c.id,
              groupCreatedByUserId: meta?.createdBy,
              userIds: memberIds,
              name: title,
              dateMet: new Date(),
              location: 'Verified click',
              status: 'active',
            };
          });
        if (!cancelled) {
          setGroupCliqueRecords(rows);
          setVerifiedClickMemberSetKeys(memberKeys);
        }
      } catch {
        if (!cancelled) {
          setGroupCliqueRecords([]);
          setVerifiedClickMemberSetKeys(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, groupClicksReloadNonce]);

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
          connection_id: invite.connectionId,
          room_name: invite.roomName,
          participant_name:
            displayNameFromUserMetadata(user.user_metadata) || user.email?.split('@')[0] || 'Click User',
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

      await room.connect(payload.ws_url, payload.token);
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
    if (!user?.id || (connectionRecords.length === 0 && groupCliqueRecords.length === 0)) {
      chatConnectionMapRef.current = new Map();
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const primeChatMap = async () => {
      const connectionIds = connectionRecords.map((connection) => connection.id);
      if (connectionIds.length > 0) {
        const { data, error } = await supabase
          .from('chats')
          .select('id, connection_id')
          .in('connection_id', connectionIds);

        if (error) {
          console.error('Error priming chat notification map:', error.message || error);
        } else if (!cancelled) {
          chatConnectionMapRef.current = new Map(
            (data ?? []).map((chat: any) => [String(chat.id), String(chat.connection_id)]),
          );
        }
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

            const groupConn = groupRecordByChatIdRef.current.get(message.chat_id);
            if (groupConn) {
              let raw = typeof message.content === 'string' ? message.content : '';
              let decryptFailed = false;
              if (raw.length > 0 && isGroupMessageEncrypted(raw)) {
                try {
                  const master = await unwrapGroupMasterKeyBytes(supabase, {
                    groupId: groupConn.id,
                    viewerUserId: user.id,
                  });
                  if (master) {
                    raw = await decryptGroupMessageContent(raw, master);
                  } else {
                    decryptFailed = true;
                    raw = '';
                  }
                } catch {
                  decryptFailed = true;
                  raw = '';
                }
              }
              const mt = coerceMessageType(message.message_type);
              const listPreview =
                decryptFailed && mt === 'text'
                  ? 'Tap to view message'
                  : previewLabelForMessage({
                      message_type: mt,
                      content: raw,
                    });
              setChatMetadataByConnectionId((current) => ({
                ...current,
                [groupConn.id]: {
                  preview: listPreview,
                  lastMessageAt: message.time_created,
                  chatUpdatedAt: message.time_created,
                },
              }));
              const isActiveVisibleChat =
                activeTabRef.current === 'chat' &&
                selectedConnectionRef.current?.id === groupConn.id &&
                typeof document !== 'undefined' &&
                document.visibilityState === 'visible';
              if (!notificationPreferencesRef.current.messagePushEnabled || isActiveVisibleChat) {
                return;
              }
              const preview =
                listPreview.length > 140 ? `${listPreview.slice(0, 137)}...` : listPreview;
              showBrowserNotification(
                groupConn.name,
                preview,
                () => {
                  setSelectedConnection(groupConn);
                  setActiveTab('chat');
                },
              );
              return;
            }

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
  }, [connectionRecords, groupCliqueRecords, showBrowserNotification, user?.id]);

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
    if (!user?.id) {
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
        .filter(
          (connection) =>
            isActiveChatListStatus(connection.status) || connection.status === 'archived',
        )
        .map((connection) => connection.id);

      if (connectionIds.length === 0) {
        return;
      }

      try {
        const { data: chats, error: chatError } = await supabase
          .from('chats')
          .select('id, connection_id, updated_at')
          .in('connection_id', connectionIds);

        if (chatError) {
          console.error('Error fetching chats for dashboard list:', chatError.message || chatError);
          return;
        }

        if (!chats || chats.length === 0) {
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

        setChatMetadataByConnectionId((prev) => {
          const next = { ...prev };
          for (const entry of latestMessages) {
            next[entry.connectionId] = {
              preview: entry.preview,
              lastMessageAt: entry.lastMessageAt,
              chatUpdatedAt: entry.chatUpdatedAt,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('Unexpected chat metadata load error:', error);
      }
    };

    loadChatMetadata();

    return () => {
      cancelled = true;
    };
  }, [connectionRecords, selectedConnection, user?.id]);

  useEffect(() => {
    if (!user?.id || groupCliqueRecords.length === 0) {
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let cancelled = false;

    const loadGroupChatMetadata = async () => {
      try {
        const entries = await Promise.all(
          groupCliqueRecords.map(async (row) => {
            const chatId = row.groupChatId;
            if (!chatId) {
              return {
                groupId: row.id,
                preview: null as string | null,
                lastMessageAt: null as number | null,
                chatUpdatedAt: null as number | null,
              };
            }
            const { data: chatRow } = await supabase
              .from('chats')
              .select('updated_at')
              .eq('id', chatId)
              .maybeSingle();
            const { data: message, error: messageError } = await supabase
              .from('messages')
              .select('content, time_created, message_type')
              .eq('chat_id', chatId)
              .order('time_created', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (messageError) {
              return {
                groupId: row.id,
                preview: null,
                lastMessageAt: null,
                chatUpdatedAt:
                  typeof (chatRow as { updated_at?: number } | null)?.updated_at === 'number'
                    ? (chatRow as { updated_at: number }).updated_at
                    : null,
              };
            }

            if (!message) {
              return {
                groupId: row.id,
                preview: null,
                lastMessageAt: null,
                chatUpdatedAt:
                  typeof (chatRow as { updated_at?: number } | null)?.updated_at === 'number'
                    ? (chatRow as { updated_at: number }).updated_at
                    : null,
              };
            }

            let raw: string = typeof message.content === 'string' ? message.content : '';
            let decryptFailed = false;
            if (raw.length > 0 && isGroupMessageEncrypted(raw)) {
              try {
                const master = await unwrapGroupMasterKeyBytes(supabase, {
                  groupId: row.id,
                  viewerUserId: user.id,
                });
                if (master) {
                  raw = await decryptGroupMessageContent(raw, master);
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
              groupId: row.id,
              preview,
              lastMessageAt: typeof message.time_created === 'number' ? message.time_created : null,
              chatUpdatedAt:
                typeof (chatRow as { updated_at?: number } | null)?.updated_at === 'number'
                  ? (chatRow as { updated_at: number }).updated_at
                  : null,
            };
          }),
        );

        if (cancelled) return;

        setChatMetadataByConnectionId((prev) => {
          const next = { ...prev };
          for (const e of entries) {
            next[e.groupId] = {
              preview: e.preview,
              lastMessageAt: e.lastMessageAt,
              chatUpdatedAt: e.chatUpdatedAt,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('Unexpected group chat metadata load error:', error);
      }
    };

    void loadGroupChatMetadata();

    return () => {
      cancelled = true;
    };
  }, [groupCliqueRecords, user?.id]);

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
    const markInitialLoadComplete = () => {
      setConnectionsInitialLoadComplete(true);
    };

    if (!user?.id) {
      setConnectionRecords([]);
      setMapConnectionRecords([]);
      setArchivedConnectionIds(new Set());
      markInitialLoadComplete();
      return;
    }

    const supabase = getSupabaseClient();

    const setEmptyConnections = () => {
      setConnectionRecords([]);
      setMapConnectionRecords([]);
      setArchivedConnectionIds(new Set());
    };

    try {
      const headers = await getAuthHeaders();
      const [activeRes, archivedRes, mapRes] = await Promise.all([
        fetch('/api/connections', { headers, cache: 'no-store' }),
        fetch('/api/connections?statusScope=archived', { headers, cache: 'no-store' }),
        fetch('/api/connections?statusScope=map', { headers, cache: 'no-store' }),
      ]);

      if (!activeRes.ok) {
        const errPayload = (await activeRes.json().catch(() => ({}))) as { error?: string };
        console.error('Error fetching connections:', errPayload.error || activeRes.statusText);
        setEmptyConnections();
        return;
      }

      if (!archivedRes.ok) {
        console.warn('Archived connections fetch skipped:', archivedRes.statusText);
      }

      if (!mapRes.ok) {
        console.warn('Map connections fetch skipped:', mapRes.statusText);
      }

      const activePayload = (await activeRes.json()) as { connections?: Record<string, unknown>[] };
      const archivedPayload = archivedRes.ok
        ? ((await archivedRes.json()) as { connections?: Record<string, unknown>[] })
        : { connections: [] };
      const mapPayload = mapRes.ok
        ? ((await mapRes.json()) as { connections?: Record<string, unknown>[] })
        : { connections: [] };

      const activeRows = activePayload.connections ?? [];
      const archivedRows = archivedPayload.connections ?? [];
      const mapRows = mapPayload.connections ?? [];

      const archivedIds = new Set(
        archivedRows
          .map((r) => r.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );
      setArchivedConnectionIds(archivedIds);
      const archiveKey = user.id ? `click:archived-connections:${user.id}` : null;
      if (archiveKey && typeof window !== 'undefined') {
        localStorage.setItem(archiveKey, JSON.stringify(Array.from(archivedIds)));
      }

      const mergedById = new Map<string, Record<string, unknown>>();
      for (const row of activeRows) {
        const id = row.id;
        if (typeof id === 'string') mergedById.set(id, row);
      }
      for (const row of archivedRows) {
        const id = row.id;
        if (typeof id === 'string' && !mergedById.has(id)) mergedById.set(id, row);
      }

      const merged = Array.from(mergedById.values());
      if (merged.length === 0) {
        setEmptyConnections();
        return;
      }

      const mergedIdSet = new Set(merged.map((r) => r.id).filter((id): id is string => typeof id === 'string'));
      const rowsForDisplayNames = [...merged, ...mapRows.filter((r) => typeof r.id === 'string' && !mergedIdSet.has(r.id))];

      const otherUserIds = rowsForDisplayNames
        .flatMap((conn) => {
          const ids = conn.user_ids;
          if (!Array.isArray(ids)) return [] as string[];
          return ids.filter((x): x is string => typeof x === 'string' && x !== user.id);
        })
        .filter((id, i, arr) => arr.indexOf(id) === i);

      let userNameMap: Record<string, string> = {};
      let userImageMap: Record<string, string | null> = {};
      if (otherUserIds.length > 0) {
        try {
          const nameRes = await fetch('/api/users/display-names', {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({ userIds: otherUserIds }),
          });
          if (nameRes.ok) {
            const payload = (await nameRes.json()) as DisplayNamesBatchResponse;
            userNameMap = payload.names ?? {};
            const batchImages = payload.images;
            if (batchImages && typeof batchImages === 'object') {
              for (const [uid, raw] of Object.entries(batchImages)) {
                if (typeof uid !== 'string' || !uid.trim()) continue;
                userImageMap[uid] =
                  typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
              }
            }
          }
        } catch {
          // Fall through to direct DB lookup below.
        }

        if (Object.keys(userNameMap).length === 0 && supabase) {
          let usersData: any[] | null = null;
          const { data: d1, error: e1 } = await supabase
            .from('users')
            .select('id, name, full_name, first_name, last_name, email, image')
            .in('id', otherUserIds);
          if (!e1 && d1) {
            usersData = d1;
          } else {
            const { data: d2 } = await supabase
              .from('users')
              .select('id, name, email, image')
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
            userImageMap = Object.fromEntries(
              usersData.map((u: any) => {
                const img = typeof u.image === 'string' && u.image.trim() ? u.image.trim() : null;
                return [u.id, img] as [string, string | null];
              }),
            );
          }
        }
      }

      let selfIntentRows: AvailabilityIntentRow[] = [];
      const peerIntentByUserId = new Map<string, AvailabilityIntentRow[]>();
      if (supabase) {
        try {
          const { data: mine } = await supabase
            .from('availability_intents')
            .select('id,timeframe,intent_tag,expires_at')
            .eq('user_id', user.id);
          selfIntentRows = normalizeAvailabilityIntentRows(mine ?? []);

          if (otherUserIds.length > 0) {
            const { data: peerRows, error: peerIntentErr } = await supabase
              .from('availability_intents')
              .select('user_id,id,timeframe,intent_tag,expires_at')
              .in('user_id', otherUserIds);
            if (!peerIntentErr && peerRows) {
              const acc = new Map<string, unknown[]>();
              for (const row of peerRows as Record<string, unknown>[]) {
                const uid = row.user_id;
                if (typeof uid !== 'string' || !uid.trim()) continue;
                const cur = acc.get(uid) ?? [];
                cur.push(row);
                acc.set(uid, cur);
              }
              for (const [uid, rows] of acc) {
                peerIntentByUserId.set(uid, normalizeAvailabilityIntentRows(rows));
              }
            }
          }
        } catch {
          /* overlap badges are optional */
        }
      }

      const mapRowToRecord = (conn: Record<string, unknown>): ConnectionRecord => {
        const userIds = (conn.user_ids as string[] | undefined) ?? [];
        const otherUserId = userIds.find((id) => id !== user.id);
        const otherUserName = (otherUserId && userNameMap[otherUserId]) || null;

        const encs = parseConnectionEncounters(conn);
        const latestEnc = encs[0];
        const originEnc = encs.length > 0 ? encs[encs.length - 1] : undefined;

        const semanticFromEncounter =
          latestEnc?.locationName?.trim() || latestEnc?.displayLocation?.trim();
        const hasExistingSemantic =
          typeof conn.semantic_location === 'string' && conn.semantic_location.trim().length > 0;
        const connForExtras: Record<string, unknown> =
          hasExistingSemantic || !semanticFromEncounter
            ? conn
            : { ...conn, semantic_location: semanticFromEncounter };

        let geoLoc: { latitude: number; longitude: number } | undefined;
        if (
          latestEnc &&
          typeof latestEnc.gpsLat === 'number' &&
          typeof latestEnc.gpsLon === 'number' &&
          Number.isFinite(latestEnc.gpsLat) &&
          Number.isFinite(latestEnc.gpsLon) &&
          !(latestEnc.gpsLat === 0 && latestEnc.gpsLon === 0)
        ) {
          geoLoc = { latitude: latestEnc.gpsLat, longitude: latestEnc.gpsLon };
        } else {
          const geo = conn.geo_location as Record<string, unknown> | null | undefined;
          if (geo && typeof geo === 'object') {
            const rawLat = geo.lat ?? geo.latitude;
            const rawLon = geo.lon ?? geo.longitude ?? geo.lng ?? geo.long;
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
        }

        const displayName =
          (typeof otherUserName === 'string' && otherUserName.trim()) ||
          'Connection';

        const rawDateValue = conn.created_utc || conn.created || conn.created_at || 0;
        const createdMs =
          typeof conn.created === 'number' && Number.isFinite(conn.created)
            ? conn.created
            : new Date(typeof rawDateValue === 'number' ? rawDateValue : String(rawDateValue)).getTime();

        const dateMetValue =
          originEnc?.encounteredAt ??
          conn.created_utc ??
          conn.created ??
          conn.created_at ??
          0;

        const overlapLabel =
          otherUserId != null && otherUserId.length > 0
            ? computeIntentOverlapLabel(selfIntentRows, peerIntentByUserId.get(otherUserId) ?? [])
            : null;

        const peerAvatarUrl =
          otherUserId != null && otherUserId.length > 0 ? userImageMap[otherUserId] ?? null : null;

        return {
          id: String(conn.id),
          otherUserId,
          userIds,
          name: displayName,
          avatarUrl: peerAvatarUrl,
          dateMet: new Date(typeof dateMetValue === 'number' ? dateMetValue : String(dateMetValue ?? 0)),
          location:
            latestEnc?.locationName ??
            latestEnc?.displayLocation ??
            originEnc?.locationName ??
            originEnc?.displayLocation ??
            ((typeof connForExtras.semantic_location === 'string' && connForExtras.semantic_location.trim())
              ? connForExtras.semantic_location.trim()
              : 'A new location'),
          context: extractEventContext(connForExtras),
          weatherSummary: extractWeatherSummary(connForExtras),
          noiseSummary: extractNoiseSummary(connForExtras),
          noiseCategory: normalizeNoiseCategory(connForExtras),
          status: normalizeConnectionStatus(conn),
          lastMessageAt:
            typeof conn.last_message_at === 'number' && Number.isFinite(conn.last_message_at)
              ? conn.last_message_at
              : null,
          connectionCreatedMs: Number.isFinite(createdMs) ? createdMs : undefined,
          hasBegun: conn.has_begun === true,
          expiryState: typeof conn.expiry_state === 'string' ? conn.expiry_state : null,
          geo_location: geoLoc,
          encounters:
            encs.length > 0
              ? encs.map((e) => ({
                  id: e.id,
                  encounteredAt: new Date(e.encounteredAt),
                  locationName: e.locationName?.trim() || undefined,
                  displayLocation: e.displayLocation?.trim() || undefined,
                  contextTags: e.contextTags,
                  ...(typeof e.exactNoiseLevelDb === 'number' && Number.isFinite(e.exactNoiseLevelDb)
                    ? { exactNoiseLevelDb: e.exactNoiseLevelDb }
                    : {}),
                  ...(typeof e.exactBarometricElevationM === 'number' &&
                  Number.isFinite(e.exactBarometricElevationM)
                    ? { exactBarometricElevationM: e.exactBarometricElevationM }
                    : {}),
                  ...(typeof e.luxLevel === 'number' && Number.isFinite(e.luxLevel) ? { luxLevel: e.luxLevel } : {}),
                  ...(typeof e.motionVariance === 'number' && Number.isFinite(e.motionVariance)
                    ? { motionVariance: e.motionVariance }
                    : {}),
                  ...(typeof e.compassAzimuth === 'number' && Number.isFinite(e.compassAzimuth)
                    ? { compassAzimuth: e.compassAzimuth }
                    : {}),
                  ...(typeof e.batteryLevel === 'number' &&
                  Number.isFinite(e.batteryLevel) &&
                  e.batteryLevel >= 0 &&
                  e.batteryLevel <= 100
                    ? { batteryLevel: e.batteryLevel }
                    : {}),
                }))
              : undefined,
          intentOverlapLabel: overlapLabel,
        };
      };

      const records: ConnectionRecord[] = merged
        .map(mapRowToRecord)
        .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime());

      const mapRecords: ConnectionRecord[] = mapRows
        .map(mapRowToRecord)
        .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime());

      setConnectionRecords(records);
      setMapConnectionRecords(mapRes.ok ? mapRecords : records);
    } catch (err) {
      console.error('Unexpected error fetching connections:', err);
      setEmptyConnections();
    } finally {
      markInitialLoadComplete();
    }
  }, [user?.id, getAuthHeaders]);

  // Fetch user connections (initial load + refetch). Reset gate when the signed-in user changes.
  useEffect(() => {
    if (!user?.id) return;
    if (connectionsLoadUserIdRef.current !== user.id) {
      connectionsLoadUserIdRef.current = user.id;
      setConnectionsInitialLoadComplete(false);
      setConnectionRecords([]);
      setMapConnectionRecords([]);
      setArchivedConnectionIds(new Set());
    }
    void loadConnections();
  }, [user?.id, loadConnections]);

  // Stay in sync when a new connection is created or updated (e.g. app user scans this user’s web QR)
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const uid = user.id;
    const channel = supabase
      .channel(`dashboard-connections:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connections' },
        () => {
          void loadConnections();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_archives',
          filter: `user_id=eq.${uid}`,
        },
        () => {
          void loadConnections();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'connection_archives',
          filter: `user_id=eq.${uid}`,
        },
        () => {
          void loadConnections();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_hidden',
          filter: `user_id=eq.${uid}`,
        },
        () => {
          void loadConnections();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'connection_hidden',
          filter: `user_id=eq.${uid}`,
        },
        () => {
          void loadConnections();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, loadConnections]);

  // After a new connection appears, offer optional venue vibe capture (Business Insights).
  useEffect(() => {
    if (!user?.id) return;
    if (connectionRecords.length === 0) return;
    const ids = connectionRecords.map((c) => c.id);
    if (seenConnectionIdsRef.current === null) {
      seenConnectionIdsRef.current = new Set(ids);
      return;
    }
    const newOnes = connectionRecords.filter((c) => !seenConnectionIdsRef.current!.has(c.id));
    newOnes.forEach((c) => seenConnectionIdsRef.current!.add(c.id));
    const eligible = newOnes.find((c) => {
      if (typeof window === 'undefined') return false;
      try {
        return !window.sessionStorage.getItem(`click:vibe-skip:${c.id}`);
      } catch {
        return true;
      }
    });
    if (eligible) {
      setVibePromptConnection((cur) => cur ?? eligible);
    }
  }, [connectionRecords, user?.id]);

  // Handle CSV export
  const handleExport = useCallback(() => {
    downloadCSV(connectionRecords, `click-connections-${user.email?.split('@')[0] || 'user'}`);
  }, [connectionRecords, user]);

  // Shared handler: open chat for a specific connection
  const handleOpenChat = useCallback((conn: ConnectionRecord) => {
    setSelectedConnection(conn);
    setActiveTab('chat');
  }, []);

  const connectionRecordsWithChatPreview = useMemo(
    () =>
      connectionRecords.map((c) => ({
        ...c,
        chatPreview: chatMetadataByConnectionId[c.id]?.preview ?? c.chatPreview ?? null,
      })),
    [chatMetadataByConnectionId, connectionRecords],
  );

  const homeAvailabilityOverlapLines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of connectionRecords) {
      if (!c.otherUserId || !c.intentOverlapLabel) continue;
      if (seen.has(c.otherUserId)) continue;
      seen.add(c.otherUserId);
      const first = c.name.trim().split(/\s+/)[0] || 'them';
      out.push(`You and ${first} are both available right now!`);
    }
    return out;
  }, [connectionRecords]);

  const userName =
    displayNameFromUserMetadata(user?.user_metadata) || user?.email?.split('@')[0] || 'User';

  const archiveStorageKey = user?.id ? `click:archived-connections:${user.id}` : null;

  const isMissingArchiveTableError = useCallback((error: any) => {
    const code = error?.code;
    const message = String(error?.message || '').toLowerCase();
    return (
      code === 'PGRST205' ||
      message.includes('connection_archives') ||
      message.includes('connection_hidden') ||
      message.includes('schema cache')
    );
  }, []);

  const writeArchivedToLocalStorage = useCallback((ids: Set<string>) => {
    if (!archiveStorageKey || typeof window === 'undefined') return;
    localStorage.setItem(archiveStorageKey, JSON.stringify(Array.from(ids)));
  }, [archiveStorageKey]);

  useEffect(() => {
    const id = setInterval(() => setArchiveCountdownTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedConnection) return;
    const known =
      connectionRecords.some((c) => c.id === selectedConnection.id) ||
      groupCliqueRecords.some((c) => c.id === selectedConnection.id);
    if (!known) {
      setSelectedConnection(null);
    }
  }, [connectionRecords, groupCliqueRecords, selectedConnection]);

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

  const unarchiveConnection = useCallback(
    async (connectionId: string): Promise<boolean> => {
      setMenuConnectionId(null);
      setChatListTab('active');

      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/connections', {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'restore', connectionId }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          console.error('Restore failed:', payload.error || res.statusText);
          return false;
        }
        void loadConnections();
        return true;
      } catch (e) {
        console.error('Unexpected restore error:', e);
        return false;
      }
    },
    [getAuthHeaders, loadConnections],
  );

  const openActionMenu = useCallback((connectionId: string) => {
    setMenuConnectionId((prev) => (prev === connectionId ? null : connectionId));
  }, []);

  const removeConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    const prevRecords = connectionRecords;
    const prevArchived = new Set(archivedConnectionIds);
    setConnectionRecords((records) => records.filter((record) => record.id !== connectionId));
    updateArchivedIds((ids) => {
      const next = new Set(ids);
      next.delete(connectionId);
      return next;
    });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/connections?connectionId=${encodeURIComponent(connectionId)}`,
        { method: 'DELETE', headers },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Remove failed');
      }
      setMenuConnectionId(null);
      if (selectedConnection?.id === connectionId) {
        setSelectedConnection(null);
      }
      return true;
    } catch (err) {
      console.error('Error removing connection:', err);
      setConnectionRecords(prevRecords);
      setArchivedConnectionIds(prevArchived);
      writeArchivedToLocalStorage(prevArchived);
      return false;
    }
  }, [
    archivedConnectionIds,
    connectionRecords,
    getAuthHeaders,
    selectedConnection?.id,
    updateArchivedIds,
    writeArchivedToLocalStorage,
  ]);

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
    () =>
      [...connectionRecords, ...groupCliqueRecords]
        .filter((c) =>
          c.chatKind === 'group_clique'
            ? isActiveChatListStatus(c.status)
            : isActiveChatListStatus(c.status) || c.status === 'archived',
        )
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
    [chatMetadataByConnectionId, connectionRecords, groupCliqueRecords],
  );

  const activeConnections = useMemo(
    () =>
      chatCandidates.filter(
        (c) => !archivedConnectionIds.has(c.id) && c.status !== 'archived',
      ),
    [archivedConnectionIds, chatCandidates],
  );

  const archivedConnections = useMemo(() => {
    const serverArchived = chatCandidates.filter((c) => c.status === 'archived');
    const userArchivedOnly = chatCandidates.filter(
      (c) => archivedConnectionIds.has(c.id) && c.status !== 'archived',
    );
    const byId = new Map<string, (typeof chatCandidates)[number]>();
    for (const c of [...serverArchived, ...userArchivedOnly]) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const left = a.chatLastMessageAt ?? a.chatUpdatedAt ?? a.dateMet.getTime();
      const right = b.chatLastMessageAt ?? b.chatUpdatedAt ?? b.dateMet.getTime();
      return right - left;
    });
  }, [archivedConnectionIds, chatCandidates]);

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

  const clickFriendOptions = useMemo(() => {
    if (!user?.id) return [];
    return connectionRecords
      .filter(
        (c) =>
          c.chatKind !== 'group_clique' &&
          isActiveChatListStatus(c.status) &&
          !!c.otherUserId,
      )
      .map((c) => ({
        connectionId: c.id,
        userId: c.otherUserId as string,
        name: c.name,
      }));
  }, [connectionRecords, user?.id]);

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

  if (!connectionsInitialLoadComplete) {
    return <LoadingScreen />;
  }

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

      {user?.id && getSupabaseClient() ? (
        <CreateVerifiedClickDialog
          open={createClickOpen}
          onOpenChange={setCreateClickOpen}
          supabase={getSupabaseClient()!}
          currentUserId={user.id}
          currentUserLabel={userName}
          friends={clickFriendOptions}
          existingVerifiedMemberSetKeys={verifiedClickMemberSetKeys}
          onCreated={() => setGroupClicksReloadNonce((n) => n + 1)}
        />
      ) : null}

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
                    totalNetworkGrowthPercent={dashboardMetrics.totalNetworkGrowthPercent}
                    thisMonthTrendPercent={dashboardMetrics.thisMonthTrendPercent}
                  />
                </section>

                <MyAvailabilityIntentsCard getAuthHeaders={getAuthHeaders} />

                {homeAvailabilityOverlapLines.length > 0 ? (
                  <div className="space-y-2">
                    {homeAvailabilityOverlapLines.map((line, i) => (
                      <p
                        key={`${line}-${i}`}
                        className="text-sm font-medium text-amber-100/95"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}

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
                    connections={connectionRecordsWithChatPreview}
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

                <ConnectionMap connections={mapConnectionRecords} onConnectionClick={handleOpenChat} />
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
                        isArchived={
                          archivedConnectionIds.has(selectedConnection.id) ||
                          selectedConnection.status === 'archived'
                        }
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
                        onGroupChatChanged={() => {
                          setGroupClicksReloadNonce((n) => n + 1);
                        }}
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
                    <div className="flex w-full items-center gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="p-2 bg-[#8338EC]/20 rounded-xl">
                          <MessageCircle className="w-5 h-5 text-[#8338EC]" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xl font-bold">Messages</h2>
                          <p className="text-sm text-zinc-500">Chat with your Clicks</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCreateClickOpen(true)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800/80"
                      >
                        <Users className="h-4 w-4" />
                        New click
                      </button>
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
                                : 'Auto-archived chats and conversations you moved to Archived appear here. Tap Restore to move them back to Active.'}
                            </p>
                          </div>
                        ) : (
                          <div className="glass overflow-visible rounded-3xl border border-zinc-800 divide-y divide-zinc-800/50">
                            {visibleChatConnections.map((conn: ConnectionRecord, index) => {
                              const isUserArchived = archivedConnectionIds.has(conn.id);
                              const isServerArchived = conn.status === 'archived';
                              const isArchived = isUserArchived || isServerArchived;
                              const previewText = conn.chatPreview?.trim() || 'No messages yet';
                              const activityLabel = formatChatActivity(conn.chatLastMessageAt ?? conn.chatUpdatedAt);
                              const archiveRow = connectionRecordToArchiveRow(conn);
                              const archiveInfo = getArchiveCountdown(archiveRow, Date.now());
                              const archiveWarning =
                                archiveInfo && shouldShowArchiveWarning(archiveInfo)
                                  ? formatArchiveCountdownLabel(archiveInfo)
                                  : null;
                              const menuOpensUpward = index >= visibleChatConnections.length - 2;
                              const isGroupCliqueRow = conn.chatKind === 'group_clique';
                              const groupMemberIds = conn.userIds ?? [];
                              const listPeerId =
                                conn.otherUserId ??
                                (user?.id ? conn.userIds?.find((id) => id !== user.id) : undefined);
                              const listPeerOnline = !!(listPeerId && onlineUserIds.has(listPeerId));
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
                                    {isGroupCliqueRow ? (
                                      <button
                                        type="button"
                                        disabled={groupMemberPickerBusy || groupMemberIds.length === 0}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void openVerifiedCliqueMemberPicker(groupMemberIds);
                                        }}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8338EC] disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="View verified clique members"
                                      >
                                        <Users className="h-5 w-5" aria-hidden />
                                      </button>
                                    ) : listPeerId ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setProfileUserId(listPeerId);
                                        }}
                                        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8338EC]"
                                        aria-label={`View ${conn.name}'s profile`}
                                      >
                                        <ConnectionPeerAvatar
                                          label={conn.name}
                                          imageUrl={conn.avatarUrl}
                                          size="md"
                                          showOnline={listPeerOnline}
                                        />
                                      </button>
                                    ) : (
                                      <div className="shrink-0">
                                        <ConnectionPeerAvatar
                                          label={conn.name}
                                          imageUrl={conn.avatarUrl}
                                          size="md"
                                          showOnline={false}
                                        />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 items-center gap-2 pr-2">
                                        <p className="truncate font-semibold text-white">{conn.name}</p>
                                        {!isGroupCliqueRow && conn.intentOverlapLabel ? (
                                          <span
                                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.28)]"
                                            title={`Vibes match: ${conn.intentOverlapLabel}`}
                                          >
                                            <Zap className="h-3 w-3" aria-hidden />
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-0.5 truncate pr-2 text-sm text-zinc-300">
                                        {previewText}
                                      </p>
                                      <p className="mt-1 truncate pr-2 text-xs text-zinc-400">
                                        {conn.location} · {conn.dateMet.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </p>
                                      {(() => {
                                        const latest = conn.encounters?.[0];
                                        if (!latest) return null;
                                        const db =
                                          latest.exactNoiseLevelDb !== null &&
                                          latest.exactNoiseLevelDb !== undefined &&
                                          typeof latest.exactNoiseLevelDb === 'number' &&
                                          Number.isFinite(latest.exactNoiseLevelDb)
                                            ? latest.exactNoiseLevelDb
                                            : null;
                                        const el =
                                          latest.exactBarometricElevationM !== null &&
                                          latest.exactBarometricElevationM !== undefined &&
                                          typeof latest.exactBarometricElevationM === 'number' &&
                                          Number.isFinite(latest.exactBarometricElevationM)
                                            ? latest.exactBarometricElevationM
                                            : null;
                                        if (db === null && el === null) return null;
                                        return (
                                          <div className="mt-1.5 flex flex-wrap gap-1 pr-2">
                                            {db !== null ? (
                                              <span className="inline-flex items-center gap-0.5 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200">
                                                <Volume2 className="h-3 w-3 shrink-0 text-violet-300" aria-hidden />
                                                {Math.round(db)} dB
                                              </span>
                                            ) : null}
                                            {el !== null ? (
                                              <span className="inline-flex items-center gap-0.5 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200">
                                                <Mountain className="h-3 w-3 shrink-0 text-sky-300" aria-hidden />
                                                {Math.round(el)} m
                                              </span>
                                            ) : null}
                                          </div>
                                        );
                                      })()}
                                      {archiveWarning && !isGroupCliqueRow && !isServerArchived && !isUserArchived ? (
                                        <p
                                          className={`mt-1.5 flex items-center gap-1 truncate pr-2 text-[11px] ${
                                            archiveInfo?.isUrgent ? 'text-amber-300' : 'text-zinc-500'
                                          }`}
                                        >
                                          <Clock className="h-3 w-3 shrink-0" aria-hidden />
                                          <span className="truncate">{archiveWarning}</span>
                                        </p>
                                      ) : null}
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
                                              {isServerArchived ? 'Auto-archived' : 'Archived'}
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
                                      className={`absolute right-4 z-50 min-w-[160px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl ${menuOpensUpward ? 'bottom-[calc(50%+1.8rem)]' : 'top-[calc(50%+1.8rem)]'}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedConnection(conn);
                                          setMenuConnectionId(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-800"
                                      >
                                        Open chat
                                      </button>
                                      {isGroupCliqueRow ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setChatListGroupRenameGroupId(conn.id);
                                              setChatListGroupRenameInput(conn.name);
                                              setMenuConnectionId(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                                          >
                                            Edit group name
                                          </button>
                                          <button
                                            type="button"
                                            disabled={chatListGroupActionBusyId === conn.id}
                                            onClick={async () => {
                                              if (
                                                !window.confirm(
                                                  'Leave this verified clique? You will stop receiving messages in this group.',
                                                )
                                              ) {
                                                return;
                                              }
                                              const supabase = getSupabaseClient();
                                              if (!supabase) {
                                                window.alert('Sign in required.');
                                                return;
                                              }
                                              setChatListGroupActionBusyId(conn.id);
                                              try {
                                                await leaveCliqueRpc(supabase, conn.id);
                                                if (selectedConnectionRef.current?.id === conn.id) {
                                                  setSelectedConnection(null);
                                                }
                                                setGroupClicksReloadNonce((n) => n + 1);
                                                setMenuConnectionId(null);
                                              } catch (e) {
                                                window.alert(
                                                  e instanceof Error ? e.message : 'Could not leave group',
                                                );
                                              } finally {
                                                setChatListGroupActionBusyId(null);
                                              }
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                                          >
                                            Leave group
                                          </button>
                                          {user?.id === conn.groupCreatedByUserId ? (
                                            <button
                                              type="button"
                                              disabled={chatListGroupActionBusyId === conn.id}
                                              onClick={async () => {
                                                if (
                                                  !window.confirm(
                                                    'Delete this verified clique for everyone? All messages will be removed. This cannot be undone.',
                                                  )
                                                ) {
                                                  return;
                                                }
                                                const supabase = getSupabaseClient();
                                                if (!supabase) {
                                                  window.alert('Sign in required.');
                                                  return;
                                                }
                                                setChatListGroupActionBusyId(conn.id);
                                                try {
                                                  await deleteCliqueRpc(supabase, conn.id);
                                                  if (selectedConnectionRef.current?.id === conn.id) {
                                                    setSelectedConnection(null);
                                                  }
                                                  setGroupClicksReloadNonce((n) => n + 1);
                                                  setMenuConnectionId(null);
                                                } catch (e) {
                                                  window.alert(
                                                    e instanceof Error ? e.message : 'Could not delete group',
                                                  );
                                                } finally {
                                                  setChatListGroupActionBusyId(null);
                                                }
                                              }}
                                              className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800 disabled:opacity-40"
                                            >
                                              Delete group
                                            </button>
                                          ) : null}
                                        </>
                                      ) : (
                                        <>
                                          {isArchived ? (
                                            <button
                                              type="button"
                                              onClick={() => unarchiveConnection(conn.id)}
                                              className="w-full text-left px-3 py-2 text-sm text-[#7cc3ff] hover:bg-zinc-800"
                                            >
                                              {isServerArchived ? 'Restore' : 'Unarchive'}
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => archiveConnection(conn.id)}
                                              className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                                            >
                                              Archive
                                            </button>
                                          )}
                                          <button
                                            type="button"
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
                                              type="button"
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
                                              type="button"
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
                                            type="button"
                                            onClick={async () => {
                                              if (!window.confirm(`Remove your connection with ${conn.name}?`)) return;
                                              await removeConnection(conn.id);
                                              setMenuConnectionId(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800"
                                          >
                                            Remove connection
                                          </button>
                                        </>
                                      )}
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

      <AnimatePresence>
        {showGroupMemberPicker && groupMemberPickerRows.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowGroupMemberPicker(false)}
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">Members</h3>
                  <p className="mt-1 text-xs text-zinc-400">Choose someone to view their profile.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGroupMemberPicker(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-4 max-h-[min(50vh,280px)] space-y-1 overflow-y-auto pr-1">
                {groupMemberPickerRows.map((row) => (
                  <li key={row.userId}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white hover:bg-white/5"
                      onClick={() => {
                        setProfileUserId(row.userId);
                        setShowGroupMemberPicker(false);
                      }}
                    >
                      {row.label}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {chatListGroupRenameGroupId ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => {
              if (chatListGroupRenameBusy) return;
              setChatListGroupRenameGroupId(null);
            }}
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-white">Edit group name</h3>
              <textarea
                value={chatListGroupRenameInput}
                onChange={(e) => setChatListGroupRenameInput(e.target.value)}
                rows={2}
                className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8338EC]"
                placeholder="Group name"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={chatListGroupRenameBusy}
                  onClick={() => {
                    if (chatListGroupRenameBusy) return;
                    setChatListGroupRenameGroupId(null);
                  }}
                  className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!chatListGroupRenameInput.trim() || chatListGroupRenameBusy}
                  onClick={async () => {
                    const gid = chatListGroupRenameGroupId;
                    if (!gid) return;
                    const next = chatListGroupRenameInput.trim();
                    if (!next) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) {
                      window.alert('Sign in required.');
                      return;
                    }
                    setChatListGroupRenameBusy(true);
                    try {
                      await renameCliqueRpc(supabase, gid, next);
                      setSelectedConnection((prev) =>
                        prev?.id === gid ? { ...prev, name: next } : prev,
                      );
                      setChatListGroupRenameGroupId(null);
                      setGroupClicksReloadNonce((n) => n + 1);
                    } catch (e) {
                      window.alert(e instanceof Error ? e.message : 'Could not rename group');
                    } finally {
                      setChatListGroupRenameBusy(false);
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-[#8338EC] text-white hover:opacity-90 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <UserProfileModal
        userId={profileUserId}
        getAuthHeaders={getAuthHeaders}
        onClose={() => setProfileUserId(null)}
      />

      {vibePromptConnection ? (
        <PostConnectionVibePrompt
          connectionId={vibePromptConnection.id}
          venueLabel={vibePromptConnection.location || 'This place'}
          getAuthHeaders={getAuthHeaders}
          onClose={() => setVibePromptConnection(null)}
        />
      ) : null}

    </div>
  );
}