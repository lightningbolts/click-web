import {
  type Participant,
  type RemoteParticipant,
  type Room,
  Track,
  type Track as TrackType,
} from 'livekit-client';
import type { CallParticipant } from '@/lib/calls/callLayoutPolicy';

function displayNameFor(participant: Participant): string {
  const name = participant.name?.trim();
  if (name) return name;
  return participant.identity || 'Participant';
}

function cameraTrack(participant: Participant): TrackType | null {
  return (participant.getTrackPublication(Track.Source.Camera)?.track as TrackType | undefined) ?? null;
}

function isMicMuted(participant: Participant): boolean {
  return participant.getTrackPublication(Track.Source.Microphone)?.isMuted === true;
}

/**
 * Builds a CallParticipant roster from a LiveKit room.
 */
export function buildCallParticipantsFromRoom(
  room: Room,
  speakingIds: Set<string> = new Set(),
  localCameraEnabled = true,
): CallParticipant[] {
  const result: CallParticipant[] = [];
  const local = room.localParticipant;
  const localId = local.identity || 'local';
  const localVideo = cameraTrack(local);
  const localName = displayNameFor(local);

  result.push({
    identity: localId,
    displayName: localName === localId ? 'You' : localName,
    isLocal: true,
    isMuted: isMicMuted(local) || !local.isMicrophoneEnabled,
    isSpeaking: speakingIds.has(localId),
    cameraEnabled: localCameraEnabled && localVideo != null,
    videoTrack: localVideo,
  });

  room.remoteParticipants.forEach((remote: RemoteParticipant) => {
    const id = remote.identity;
    if (!id) return;
    const video = cameraTrack(remote);
    result.push({
      identity: id,
      displayName: displayNameFor(remote),
      isLocal: false,
      isMuted: isMicMuted(remote),
      isSpeaking: speakingIds.has(id),
      cameraEnabled: video != null,
      videoTrack: video,
    });
  });

  return result;
}
