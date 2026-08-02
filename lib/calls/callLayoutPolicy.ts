export type CallLayoutMode = 'grid' | 'speaker';

export type CallParticipant = {
  identity: string;
  displayName: string;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  cameraEnabled: boolean;
  /** Present when a camera video track is available for this participant. */
  videoTrack: unknown | null;
};

export const SPEAKER_MAX_PARTICIPANTS = 3;

export function defaultCallLayoutMode(participantCount: number): CallLayoutMode {
  return participantCount <= SPEAKER_MAX_PARTICIPANTS ? 'speaker' : 'grid';
}

/**
 * Manual override sticks until participant count crosses the speaker/grid threshold
 * relative to when the override was set.
 */
export function resolveCallLayoutMode(
  participantCount: number,
  manualOverride: CallLayoutMode | null,
  overrideAtCount = 0,
): CallLayoutMode {
  if (!manualOverride) return defaultCallLayoutMode(participantCount);
  const wasSpeakerSide = overrideAtCount <= SPEAKER_MAX_PARTICIPANTS;
  const isSpeakerSide = participantCount <= SPEAKER_MAX_PARTICIPANTS;
  if (wasSpeakerSide !== isSpeakerSide) return defaultCallLayoutMode(participantCount);
  return manualOverride;
}

export function pickActiveSpeaker(participants: CallParticipant[]): CallParticipant | null {
  if (participants.length === 0) return null;
  const remotes = participants.filter((p) => !p.isLocal);
  const speaking = remotes.find((p) => p.isSpeaking);
  if (speaking) return speaking;
  const withVideo = remotes.find((p) => p.videoTrack != null || p.cameraEnabled);
  if (withVideo) return withVideo;
  if (remotes[0]) return remotes[0];
  return participants.find((p) => p.isLocal) ?? participants[0] ?? null;
}

export function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function selfLabel(displayName: string): string {
  return `You (${displayName})`;
}

export function formatCallDuration(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function participantHasVideo(participant: CallParticipant): boolean {
  return participant.videoTrack != null || (participant.cameraEnabled && participant.isLocal);
}
