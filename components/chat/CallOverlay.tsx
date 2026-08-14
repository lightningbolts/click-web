'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import {
  Check,
  Grid2X2,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Rows3,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  formatCallDuration,
  gridRowSizes,
  initialsFor,
  pickActiveSpeaker,
  resolveCallLayoutMode,
  selfLabel,
  type CallLayoutMode,
  type CallParticipant,
} from '@/lib/calls/callLayoutPolicy';

type MediaTrack = any;

const EDGE_PADDING = 16;

export interface WebCallInvite {
  callId: string;
  connectionId: string;
  roomName: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  calleeName: string;
  videoEnabled: boolean;
  createdAt: number;
}

export type WebCallOverlayState =
  | { mode: 'idle' }
  | { mode: 'outgoing'; invite: WebCallInvite }
  | { mode: 'incoming'; invite: WebCallInvite }
  | { mode: 'connecting'; invite: WebCallInvite }
  | { mode: 'ended'; invite: WebCallInvite | null; reason: string };

export interface WebActiveCallState {
  status: 'idle' | 'connecting' | 'connected' | 'ended';
  invite: WebCallInvite | null;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  /** @deprecated Prefer participants[].videoTrack — kept for transitional callers. */
  remoteVideoTrack: MediaTrack | null;
  localVideoTrack: MediaTrack | null;
  participants: CallParticipant[];
  connectedAtMs?: number | null;
  reason?: string;
}

interface CallOverlayProps {
  currentUserId: string;
  overlayState: WebCallOverlayState;
  activeCall: WebActiveCallState;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onDismissEnded: () => void;
  onEndCall: () => void;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
}

function otherParticipantName(invite: WebCallInvite | null, currentUserId: string) {
  if (!invite) return 'Connection';
  return invite.callerId === currentUserId ? invite.calleeName : invite.callerName;
}

function VideoTrackSurface({
  track,
  mirror,
  fit = 'cover',
}: {
  track: MediaTrack | null;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !track) return;

    const element = track.attach();
    element.classList.add('h-full', 'w-full', fit === 'contain' ? 'object-contain' : 'object-cover');
    element.style.backgroundColor = 'black';
    if (mirror) {
      element.style.transform = 'scaleX(-1)';
    }
    container.innerHTML = '';
    container.appendChild(element);

    return () => {
      try {
        track.detach(element);
      } catch {}
      element.remove();
    };
  }, [fit, track, mirror]);

  return <div ref={containerRef} className="h-full w-full bg-black" />;
}

function ParticipantTile({
  participant,
  isActiveSpeaker,
  labelOverride,
}: {
  participant: CallParticipant;
  isActiveSpeaker: boolean;
  labelOverride?: string;
}) {
  const label = labelOverride ?? (participant.isLocal ? selfLabel(participant.displayName) : participant.displayName);
  const hasVideo = participant.videoTrack != null;

  return (
    <div
      className={`relative h-full min-h-0 w-full overflow-hidden rounded-[18px] border bg-[#1a1c1c] ${
        isActiveSpeaker ? 'border-primary' : 'border-border-hard'
      }`}
    >
      {hasVideo ? (
        <VideoTrackSurface track={participant.videoTrack} mirror={participant.isLocal} />
      ) : (
        <div className="flex h-full min-h-[120px] w-full items-center justify-center bg-[#2a2c2c]">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-hard bg-primary text-lg font-bold text-on-primary">
            {initialsFor(participant.displayName)}
          </div>
        </div>
      )}
      <div
        className={`absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border border-border-hard ${
          participant.isSpeaking && !participant.isMuted ? 'bg-primary' : 'bg-[#101212]/cc'
        }`}
      >
        {participant.isMuted ? <MicOff className="h-3.5 w-3.5 text-white" /> : <Mic className="h-3.5 w-3.5 text-white" />}
      </div>
      <div className="absolute bottom-2 left-2 max-w-[85%] truncate rounded-lg bg-black/55 px-2.5 py-1.5 text-sm font-semibold text-white">
        {label}
      </div>
    </div>
  );
}

function CallControlCapsule({
  microphoneEnabled,
  cameraEnabled,
  onToggleMicrophone,
  onToggleCamera,
  onEndCall,
}: {
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-border-hard bg-[#101212] px-4 py-3">
      <button
        type="button"
        onClick={onToggleMicrophone}
        aria-label={microphoneEnabled ? 'Mute' : 'Unmute'}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-border-hard bg-white text-black"
      >
        {microphoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={onToggleCamera}
        aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-border-hard bg-[#e8e8e8] text-black"
      >
        {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={onEndCall}
        aria-label="End call"
        className="flex h-14 w-14 items-center justify-center rounded-full border border-border-hard bg-red-600 text-white"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}

function DragHandle({
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (event: PointerEvent | React.PointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="mb-4 flex cursor-grab touch-none flex-col items-center active:cursor-grabbing"
      aria-label={label}
      role="button"
      tabIndex={-1}
    >
      <div className="h-1.5 w-14 rounded-full bg-white/30" />
    </div>
  );
}

function ActiveCallStage({
  activeCall,
  title,
  onEndCall,
  onToggleMicrophone,
  onToggleCamera,
}: {
  activeCall: WebActiveCallState;
  title: string;
  onEndCall: () => void;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
}) {
  const lastRosterRef = useRef<CallParticipant[]>([]);
  const roster = useMemo(() => {
    let next: CallParticipant[];
    if (activeCall.participants.length > 0) {
      next = activeCall.participants;
    } else {
      const fallback: CallParticipant[] = [];
      if (activeCall.localVideoTrack != null || activeCall.cameraEnabled) {
        fallback.push({
          identity: 'local',
          displayName: 'You',
          isLocal: true,
          isMuted: !activeCall.microphoneEnabled,
          isSpeaking: false,
          cameraEnabled: activeCall.cameraEnabled,
          videoTrack: activeCall.localVideoTrack,
        });
      }
      if (activeCall.remoteVideoTrack != null) {
        fallback.push({
          identity: 'remote',
          displayName: title,
          isLocal: false,
          isMuted: false,
          isSpeaking: false,
          cameraEnabled: true,
          videoTrack: activeCall.remoteVideoTrack,
        });
      }
      next =
        fallback.length > 0
          ? fallback
          : [
              {
                identity: 'local',
                displayName: 'You',
                isLocal: true,
                isMuted: !activeCall.microphoneEnabled,
                isSpeaking: false,
                cameraEnabled: activeCall.cameraEnabled,
                videoTrack: activeCall.localVideoTrack,
              },
              {
                identity: 'remote',
                displayName: title,
                isLocal: false,
                isMuted: false,
                isSpeaking: false,
                cameraEnabled: false,
                videoTrack: null,
              },
            ];
    }
    if (next.length > 0) lastRosterRef.current = next;
    return next.length > 0 ? next : lastRosterRef.current;
  }, [activeCall, title]);

  const [manualOverride, setManualOverride] = useState<CallLayoutMode | null>(null);
  const [overrideAtCount, setOverrideAtCount] = useState(0);
  const layoutMode = resolveCallLayoutMode(roster.length, manualOverride, overrideAtCount);
  const activeSpeaker = pickActiveSpeaker(roster);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const duration = formatCallDuration(
    activeCall.connectedAtMs != null ? now - activeCall.connectedAtMs : 0,
  );

  const remotes = roster.filter((p) => !p.isLocal);
  const local = roster.find((p) => p.isLocal);
  const primary = activeSpeaker && !activeSpeaker.isLocal ? activeSpeaker : remotes[0];
  const otherRemotes = remotes.filter((p) => p.identity !== primary?.identity);
  const rowSizes = gridRowSizes(roster.length);
  let gridIndex = 0;
  const gridRows = rowSizes.map((size) => {
    const slice = roster.slice(gridIndex, gridIndex + size);
    gridIndex += size;
    return slice;
  });

  return (
    <div className="pointer-events-auto fixed inset-0 z-[90] flex flex-col bg-[#101212] text-white">
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold sm:text-2xl">{title}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-on-primary-container">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            <span className="font-mono">
              {duration} · {roster.length} active
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = layoutMode === 'grid' ? 'speaker' : 'grid';
            setManualOverride(next);
            setOverrideAtCount(roster.length);
          }}
          className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border-hard bg-[#1a1c1c]"
          aria-label={layoutMode === 'grid' ? 'Speaker view' : 'Grid view'}
        >
          {layoutMode === 'grid' ? <Rows3 className="h-5 w-5" /> : <Grid2X2 className="h-5 w-5" />}
        </button>
      </header>

      <div className="relative min-h-0 flex-1 px-4 pb-28 sm:px-6">
        {layoutMode === 'grid' ? (
          <div className="flex h-full min-h-0 flex-col gap-2.5">
            {gridRows.map((row, rowIdx) => (
              <div key={`row-${rowIdx}`} className="flex min-h-0 flex-1 gap-2.5">
                {row.map((p) => (
                  <div key={p.identity} className="min-h-0 min-w-0 flex-1">
                    <ParticipantTile
                      participant={p}
                      isActiveSpeaker={p.identity === activeSpeaker?.identity}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative flex h-full min-h-0 flex-col gap-2.5">
            {primary ? (
              <div className={`min-h-0 ${otherRemotes.length > 0 ? 'flex-[1.6]' : 'flex-1'}`}>
                <ParticipantTile participant={primary} isActiveSpeaker />
              </div>
            ) : null}
            {otherRemotes.length > 0 ? (
              <div className="flex min-h-0 flex-1 gap-2.5">
                {otherRemotes.map((remote) => (
                  <div key={remote.identity} className="min-h-0 min-w-0 flex-1">
                    <ParticipantTile
                      participant={remote}
                      isActiveSpeaker={remote.identity === activeSpeaker?.identity}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {local && primary?.identity !== local.identity ? (
              <div className="pointer-events-none absolute bottom-3 right-3 h-36 w-[108px] overflow-hidden rounded-[14px] border border-border-hard shadow-lg">
                <ParticipantTile
                  participant={local}
                  isActiveSpeaker={false}
                  labelOverride={selfLabel(local.displayName)}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <div className="pointer-events-auto">
          <CallControlCapsule
            microphoneEnabled={activeCall.microphoneEnabled}
            cameraEnabled={activeCall.cameraEnabled}
            onToggleMicrophone={onToggleMicrophone}
            onToggleCamera={onToggleCamera}
            onEndCall={onEndCall}
          />
        </div>
      </div>
    </div>
  );
}

export default function CallOverlay({
  currentUserId,
  overlayState,
  activeCall,
  onAccept,
  onDecline,
  onCancel,
  onDismissEnded,
  onEndCall,
  onToggleMicrophone,
  onToggleCamera,
}: CallOverlayProps) {
  const previewConstraintsRef = useRef<HTMLDivElement | null>(null);
  const previewDragControls = useDragControls();
  const [safeTopOffset, setSafeTopOffset] = useState(EDGE_PADDING);
  const invite = overlayState.mode === 'idle' ? activeCall.invite : overlayState.invite;
  const name = otherParticipantName(invite, currentUserId);
  const isVideo = invite?.videoEnabled === true;
  const showActive =
    activeCall.status === 'connected' ||
    (overlayState.mode === 'ended' &&
      (activeCall.status === 'ended' || activeCall.status === 'connected'));
  const showPreview = overlayState.mode !== 'idle' && !showActive;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateSafeTopOffset = () => {
      const navbar = document.querySelector('[data-navbar-root="true"]') as HTMLElement | null;
      if (!navbar) {
        setSafeTopOffset(EDGE_PADDING);
        return;
      }

      const { bottom, height } = navbar.getBoundingClientRect();
      const resolvedOffset =
        bottom <= 0 || height <= 0
          ? EDGE_PADDING
          : Math.max(EDGE_PADDING, Math.ceil(bottom + EDGE_PADDING));

      setSafeTopOffset(resolvedOffset);
    };

    updateSafeTopOffset();

    const navbar = document.querySelector('[data-navbar-root="true"]') as HTMLElement | null;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && navbar ? new ResizeObserver(updateSafeTopOffset) : null;

    if (resizeObserver && navbar) {
      resizeObserver.observe(navbar);
    }

    window.addEventListener('resize', updateSafeTopOffset);
    window.addEventListener('scroll', updateSafeTopOffset, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateSafeTopOffset);
      window.removeEventListener('scroll', updateSafeTopOffset);
    };
  }, []);

  return (
    <AnimatePresence>
      {showPreview ? (
        <div
          ref={previewConstraintsRef}
          className="pointer-events-none fixed inset-0 z-[90] overflow-hidden"
          style={{
            paddingTop: safeTopOffset,
            paddingRight: EDGE_PADDING,
            paddingBottom: EDGE_PADDING,
            paddingLeft: EDGE_PADDING,
          }}
        >
          <div className="flex h-full items-start justify-center sm:justify-end">
            <motion.div
              key={`call-preview-${overlayState.mode}`}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              drag
              dragListener={false}
              dragControls={previewDragControls}
              dragConstraints={previewConstraintsRef}
              dragElastic={0.08}
              dragMomentum={false}
              className="pointer-events-auto w-full max-w-sm"
            >
              <div className="relative overflow-hidden rounded-[28px] border border-border-hard bg-[#101212] p-6 text-center">
                <DragHandle
                  label="Move call panel"
                  onPointerDown={(event) => previewDragControls.start(event)}
                />
                <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-border-hard bg-primary text-3xl font-bold text-on-primary">
                  {initialsFor(name)}
                </div>
                <p className="relative text-sm font-medium uppercase tracking-[0.18em] text-on-primary-container">
                  {overlayState.mode === 'outgoing' && (isVideo ? 'Starting video ring' : 'Starting voice ring')}
                  {overlayState.mode === 'incoming' && (isVideo ? 'Incoming video call' : 'Incoming voice call')}
                  {overlayState.mode === 'connecting' && (isVideo ? 'Joining video call' : 'Joining voice call')}
                  {overlayState.mode === 'ended' && 'Call ended'}
                </p>
                <h3 className="relative mt-2 text-2xl font-semibold text-white">{name}</h3>
                <p className="relative mt-2 text-sm text-zinc-400">
                  {overlayState.mode === 'ended'
                    ? overlayState.reason
                    : isVideo
                      ? 'Video call'
                      : 'Voice call'}
                </p>

                {overlayState.mode === 'connecting' ? (
                  <div className="relative mt-6 flex items-center justify-center gap-3 text-sm text-zinc-300">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Connecting…
                  </div>
                ) : null}

                <div className="relative mt-6 flex items-center justify-center gap-4">
                  {overlayState.mode === 'incoming' ? (
                    <>
                      <button
                        type="button"
                        onClick={onDecline}
                        className="flex h-14 w-14 items-center justify-center rounded-full border border-border-hard bg-red-600 text-white"
                        aria-label="Decline call"
                      >
                        <PhoneOff className="h-6 w-6" />
                      </button>
                      <button
                        type="button"
                        onClick={onAccept}
                        className="flex h-14 w-14 items-center justify-center rounded-full border border-border-hard bg-primary text-white"
                        aria-label="Accept call"
                      >
                        {isVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                      </button>
                    </>
                  ) : null}
                  {overlayState.mode === 'outgoing' || overlayState.mode === 'connecting' ? (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-border-hard bg-red-600 text-white"
                      aria-label="Cancel call"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </button>
                  ) : null}
                  {overlayState.mode === 'ended' ? (
                    <button
                      type="button"
                      onClick={onDismissEnded}
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-border-hard bg-primary text-white"
                      aria-label="Dismiss"
                    >
                      <Check className="h-6 w-6" />
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}

      {showActive ? (
        <ActiveCallStage
          activeCall={activeCall}
          title={name}
          onEndCall={onEndCall}
          onToggleMicrophone={onToggleMicrophone}
          onToggleCamera={onToggleCamera}
        />
      ) : null}
    </AnimatePresence>
  );
}
