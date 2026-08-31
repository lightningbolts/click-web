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

/** Speaker layout shows at most 3 remotes (+ local); above this always use grid. */
export const SPEAKER_LAYOUT_MAX_PARTICIPANTS = 4;

export function defaultCallLayoutMode(participantCount: number): CallLayoutMode {
  return participantCount <= SPEAKER_MAX_PARTICIPANTS ? 'speaker' : 'grid';
}

/**
 * Manual override sticks until participant count crosses the speaker/grid threshold
 * relative to when the override was set. Speaker is never used above
 * [SPEAKER_LAYOUT_MAX_PARTICIPANTS] so remotes are not silently dropped.
 */
export function resolveCallLayoutMode(
  participantCount: number,
  manualOverride: CallLayoutMode | null,
  overrideAtCount = 0,
): CallLayoutMode {
  if (participantCount > SPEAKER_LAYOUT_MAX_PARTICIPANTS) return 'grid';
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

/**
 * FaceTime-style row sizes that fill the stage instead of a sparse 2-column square grid.
 * 1: full; 2: side-by-side; 3: 1+2; 4: 2x2; 5: 2+3; 6: 3x2; 7: 3+2+2; 8: 3+3+2.
 */
export function gridRowSizes(participantCount: number): number[] {
  const n = Math.max(0, participantCount);
  switch (n) {
    case 0:
      return [];
    case 1:
      return [1];
    case 2:
      return [2];
    case 3:
      return [1, 2];
    case 4:
      return [2, 2];
    case 5:
      return [2, 3];
    case 6:
      return [3, 3];
    case 7:
      return [3, 2, 2];
    default: {
      const rows: number[] = [];
      let remaining = n;
      while (remaining > 0) {
        const take = remaining === 4 ? 2 : remaining >= 3 ? 3 : remaining;
        rows.push(take);
        remaining -= take;
      }
      return rows;
    }
  }
}

export function gridChunks<T>(items: T[]): T[][] {
  const sizes = gridRowSizes(items.length);
  const rows: T[][] = [];
  let index = 0;
  for (const size of sizes) {
    rows.push(items.slice(index, index + size));
    index += size;
  }
  return rows;
}
