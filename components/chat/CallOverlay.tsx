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

function VideoTrackSurface({ track, mirror }: { track: MediaTrack | null; mirror?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !track) return;

    const element = track.attach();
    element.classList.add('h-full', 'w-full', 'object-cover');
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
  }, [track, mirror]);

  return <div ref={containerRef} className="h-full w-full" />;
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
  const showPreview = overlayState.mode !== 'idle';
  const showActive = !showPreview && activeCall.status !== 'idle';

  return (
    <AnimatePresence>
      {showPreview ? (
        <motion.div
          key={`call-preview-${overlayState.mode}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(58,134,255,0.18),transparent_42%),linear-gradient(180deg,rgba(5,8,22,0.98),rgba(4,6,16,0.98))] px-6"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-zinc-950/90 p-8 text-center shadow-[0_24px_120px_rgba(58,134,255,0.18)]">
            <motion.div
              animate={{ scale: [0.96, 1.08, 0.96], opacity: [0.28, 0.5, 0.28] }}
              transition={{ repeat: Infinity, duration: 2.1, ease: 'easeInOut' }}
              className="absolute inset-x-16 top-16 h-40 rounded-full bg-[#3A86FF]/20 blur-3xl"
            />
            <div className="relative mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-4xl font-semibold text-white shadow-[0_0_50px_rgba(58,134,255,0.28)]">
              {name.charAt(0).toUpperCase()}
            </div>
            <p className="relative text-sm uppercase tracking-[0.28em] text-zinc-500">
              {overlayState.mode === 'outgoing' && (isVideo ? 'Placing Video Call' : 'Placing Voice Call')}
              {overlayState.mode === 'incoming' && (isVideo ? 'Incoming Video Call' : 'Incoming Voice Call')}
              {overlayState.mode === 'connecting' && (isVideo ? 'Joining Video Call' : 'Joining Voice Call')}
              {overlayState.mode === 'ended' && 'Call Ended'}
            </p>
            <h3 className="relative mt-3 text-3xl font-semibold text-white">{name}</h3>
            <p className="relative mt-3 text-sm text-zinc-400">
              {overlayState.mode === 'ended'
                ? overlayState.reason
                : isVideo
                  ? 'Camera and audio will connect as soon as the room opens.'
                  : 'Ringing until the other person accepts, declines, or times out.'}
            </p>

            {overlayState.mode === 'connecting' ? (
              <div className="relative mt-8 flex items-center justify-center gap-3 text-sm text-zinc-300">
                <Loader2 className="h-5 w-5 animate-spin" />
                Connecting…
              </div>
            ) : null}

            <div className="relative mt-10 flex items-center justify-center gap-4">
              {overlayState.mode === 'incoming' ? (
                <>
                  <button
                    onClick={onDecline}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/20 transition hover:scale-[1.03]"
                    aria-label="Decline call"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </button>
                  <button
                    onClick={onAccept}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-white shadow-lg shadow-[#3A86FF]/25 transition hover:scale-[1.03]"
                    aria-label="Accept call"
                  >
                    {isVideo ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                  </button>
                </>
              ) : null}

              {(overlayState.mode === 'outgoing' || overlayState.mode === 'connecting') ? (
                <button
                  onClick={onCancel}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/20 transition hover:scale-[1.03]"
                  aria-label="Cancel call"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
              ) : null}

              {overlayState.mode === 'ended' ? (
                <button
                  onClick={onDismissEnded}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-white shadow-lg shadow-[#3A86FF]/25 transition hover:scale-[1.03]"
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-[linear-gradient(180deg,rgba(4,6,16,0.98),rgba(6,10,26,0.98))] px-6 py-8"
        >
          <div className="mx-auto flex h-full max-w-5xl flex-col">
            <div className="text-center">
              <p className="text-sm uppercase tracking-[0.28em] text-zinc-500">
                {activeCall.status === 'connecting' && (isVideo ? 'Connecting Video Call' : 'Connecting Voice Call')}
                {activeCall.status === 'connected' && (isVideo ? 'Video Call' : 'Voice Call')}
                {activeCall.status === 'ended' && 'Call Ended'}
              </p>
              <h3 className="mt-3 text-3xl font-semibold text-white">{name}</h3>
              {activeCall.reason ? <p className="mt-2 text-sm text-zinc-400">{activeCall.reason}</p> : null}
            </div>

            <div className="mt-8 flex flex-1 flex-col gap-6 lg:flex-row">
              <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-zinc-900/80">
                {activeCall.remoteVideoTrack ? (
                  <VideoTrackSurface track={activeCall.remoteVideoTrack} />
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-zinc-400">
                    <div>
                      <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-3xl font-semibold text-white">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <p>{activeCall.status === 'connecting' ? 'Joining room…' : 'Waiting for video…'}</p>
                    </div>
                  </div>
                )}
              </div>

              {isVideo ? (
                <div className="relative h-56 overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900/80 lg:h-auto lg:w-64">
                  {activeCall.localVideoTrack ? (
                    <VideoTrackSurface track={activeCall.localVideoTrack} mirror />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">Local preview</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={onToggleMicrophone}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                aria-label={activeCall.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {activeCall.microphoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              {isVideo ? (
                <button
                  onClick={onToggleCamera}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
                  aria-label={activeCall.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                >
                  {activeCall.cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>
              ) : null}

              <button
                onClick={onEndCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/20 transition hover:scale-[1.03]"
                aria-label="End call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}