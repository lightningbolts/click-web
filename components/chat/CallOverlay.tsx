'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2, Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';

type MediaTrack = any;

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
  remoteVideoTrack: MediaTrack | null;
  localVideoTrack: MediaTrack | null;
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

function CallControlButton({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  const className = danger
    ? 'border-red-400/30 bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-400'
    : 'border-white/10 bg-white/5 text-white hover:bg-white/10';

  return (
    <button
      onClick={onClick}
      className={`flex min-w-[92px] flex-col items-center gap-2 rounded-[22px] border px-4 py-3 transition ${className}`}
      aria-label={label}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/15">{icon}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.18em]">{label}</span>
    </button>
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
  const invite = overlayState.mode === 'idle' ? activeCall.invite : overlayState.invite;
  const name = otherParticipantName(invite, currentUserId);
  const isVideo = invite?.videoEnabled === true;
  const hasVideoUi = isVideo || activeCall.cameraEnabled || activeCall.localVideoTrack != null || activeCall.remoteVideoTrack != null;
  const showPreview = overlayState.mode !== 'idle';
  const showActive = !showPreview && activeCall.status !== 'idle';

  return (
    <AnimatePresence>
      {showPreview ? (
        <motion.div
          key={`call-preview-${overlayState.mode}`}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          className="pointer-events-none fixed inset-x-4 top-4 z-[90] flex justify-center sm:justify-end"
        >
          <div className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/95 p-6 text-center shadow-[0_24px_80px_rgba(58,134,255,0.18)] backdrop-blur-xl">
            <motion.div
              animate={{ scale: [0.96, 1.08, 0.96], opacity: [0.28, 0.5, 0.28] }}
              transition={{ repeat: Infinity, duration: 2.1, ease: 'easeInOut' }}
              className="absolute inset-x-12 top-10 h-28 rounded-full bg-[#3A86FF]/20 blur-3xl"
            />
            <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-3xl font-semibold text-white shadow-[0_0_50px_rgba(58,134,255,0.28)]">
              {name.charAt(0).toUpperCase()}
            </div>
            <p className="relative text-sm uppercase tracking-[0.28em] text-zinc-500">
              {overlayState.mode === 'outgoing' && (isVideo ? 'Placing Video Call' : 'Placing Voice Call')}
              {overlayState.mode === 'incoming' && (isVideo ? 'Incoming Video Call' : 'Incoming Voice Call')}
              {overlayState.mode === 'connecting' && (isVideo ? 'Joining Video Call' : 'Joining Voice Call')}
              {overlayState.mode === 'ended' && 'Call Ended'}
            </p>
            <h3 className="relative mt-2 text-2xl font-semibold text-white">{name}</h3>
            <p className="relative mt-2 text-sm text-zinc-400">
              {overlayState.mode === 'ended'
                ? overlayState.reason
                : isVideo
                  ? 'Camera and audio will connect as soon as the room opens.'
                  : 'Ringing until the other person accepts, declines, or times out.'}
            </p>

            {overlayState.mode === 'connecting' ? (
              <div className="relative mt-6 flex items-center justify-center gap-3 text-sm text-zinc-300">
                <Loader2 className="h-5 w-5 animate-spin" />
                Connecting…
              </div>
            ) : null}

            <div className="relative mt-8 flex items-center justify-center gap-4">
              {overlayState.mode === 'incoming' ? (
                <>
                  <button
                    onClick={onDecline}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/20 transition hover:scale-[1.03]"
                    aria-label="Decline call"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </button>
                  <button
                    onClick={onAccept}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-white shadow-lg shadow-[#3A86FF]/25 transition hover:scale-[1.03]"
                    aria-label="Accept call"
                  >
                    {isVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                  </button>
                </>
              ) : null}

              {(overlayState.mode === 'outgoing' || overlayState.mode === 'connecting') ? (
                <button
                  onClick={onCancel}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/20 transition hover:scale-[1.03]"
                  aria-label="Cancel call"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
              ) : null}

              {overlayState.mode === 'ended' ? (
                <button
                  onClick={onDismissEnded}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-white shadow-lg shadow-[#3A86FF]/25 transition hover:scale-[1.03]"
                  aria-label="Dismiss call status"
                >
                  <Check className="h-6 w-6" />
                </button>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}

      {showActive ? (
        <motion.div
          key={`call-active-${activeCall.status}`}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.98 }}
          className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex justify-center sm:justify-end"
        >
          <div className="pointer-events-auto flex w-full max-w-[min(94vw,380px)] flex-col gap-4 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(4,6,16,0.96),rgba(8,12,28,0.96))] p-4 shadow-[0_24px_80px_rgba(4,6,16,0.4)] backdrop-blur-xl">
            <div className="text-center">
              <p className="text-sm uppercase tracking-[0.28em] text-zinc-500">
                {activeCall.status === 'connecting' && (isVideo ? 'Connecting Video Call' : 'Connecting Voice Call')}
                {activeCall.status === 'connected' && (isVideo ? 'Video Call' : 'Voice Call')}
                {activeCall.status === 'ended' && 'Call Ended'}
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{name}</h3>
              {activeCall.reason ? <p className="mt-2 text-sm text-zinc-400">{activeCall.reason}</p> : null}
            </div>

            <div className="grid min-h-0 items-start gap-3">
              <div className="relative min-h-[180px] overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900/80 aspect-[1.15/1]">
                {activeCall.remoteVideoTrack ? (
                  <VideoTrackSurface track={activeCall.remoteVideoTrack} fit="contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-zinc-400">
                    <div>
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-2xl font-semibold text-white">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <p>{activeCall.status === 'connecting' ? 'Joining room…' : 'Waiting for video…'}</p>
                    </div>
                  </div>
                )}
              </div>

              {hasVideoUi ? (
                <div className="relative h-28 overflow-hidden rounded-[20px] border border-white/10 bg-zinc-900/80">
                  {activeCall.localVideoTrack ? (
                    <VideoTrackSurface track={activeCall.localVideoTrack} mirror />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
                      {activeCall.cameraEnabled ? 'Starting camera…' : 'Camera is off'}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div>
              <div className="mx-auto flex w-full flex-wrap items-center justify-center gap-3 rounded-[24px] border border-white/10 bg-black/35 px-3 py-3 backdrop-blur-xl">
                <CallControlButton
                  label={activeCall.microphoneEnabled ? 'Mute' : 'Unmute'}
                  icon={activeCall.microphoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  onClick={onToggleMicrophone}
                />
                <CallControlButton
                  label={activeCall.cameraEnabled ? 'Camera Off' : 'Camera On'}
                  icon={activeCall.cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  onClick={onToggleCamera}
                />
                <CallControlButton
                  label="Hang Up"
                  icon={<PhoneOff className="h-5 w-5" />}
                  onClick={onEndCall}
                  danger
                />
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}