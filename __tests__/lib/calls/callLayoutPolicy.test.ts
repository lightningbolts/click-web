import {
  defaultCallLayoutMode,
  formatCallDuration,
  initialsFor,
  pickActiveSpeaker,
  resolveCallLayoutMode,
  selfLabel,
  type CallParticipant,
} from '@/lib/calls/callLayoutPolicy';

function participant(
  overrides: Partial<CallParticipant> & Pick<CallParticipant, 'identity'>,
): CallParticipant {
  return {
    displayName: overrides.identity,
    isLocal: false,
    isMuted: false,
    isSpeaking: false,
    cameraEnabled: false,
    videoTrack: null,
    ...overrides,
  };
}

describe('callLayoutPolicy', () => {
  it('defaults to speaker for <=3 and grid for >=4', () => {
    expect(defaultCallLayoutMode(1)).toBe('speaker');
    expect(defaultCallLayoutMode(3)).toBe('speaker');
    expect(defaultCallLayoutMode(4)).toBe('grid');
    expect(defaultCallLayoutMode(8)).toBe('grid');
  });

  it('honors manual override within the same threshold side', () => {
    expect(resolveCallLayoutMode(2, 'grid', 2)).toBe('grid');
    expect(resolveCallLayoutMode(5, 'speaker', 5)).toBe('speaker');
  });

  it('clears override when participant count crosses the threshold', () => {
    expect(resolveCallLayoutMode(4, 'speaker', 2)).toBe('grid');
    expect(resolveCallLayoutMode(2, 'grid', 5)).toBe('speaker');
  });

  it('picks active speaker with speaking → video → remote → local fallback', () => {
    const local = participant({ identity: 'me', isLocal: true, cameraEnabled: true });
    const quiet = participant({ identity: 'a', videoTrack: {} });
    const talking = participant({ identity: 'b', isSpeaking: true });
    expect(pickActiveSpeaker([local, quiet, talking])).toEqual(talking);
    expect(pickActiveSpeaker([local, quiet])).toEqual(quiet);
    expect(pickActiveSpeaker([local, participant({ identity: 'c' })])?.identity).toBe('c');
    expect(pickActiveSpeaker([local])).toEqual(local);
    expect(pickActiveSpeaker([])).toBeNull();
  });

  it('formats initials, self label, and duration', () => {
    expect(initialsFor('Alex Smith')).toBe('AS');
    expect(initialsFor('Alex')).toBe('AL');
    expect(initialsFor('   ')).toBe('?');
    expect(selfLabel('David')).toBe('You (David)');
    expect(formatCallDuration(0)).toBe('00:00');
    expect(formatCallDuration(45_000)).toBe('00:45');
    expect(formatCallDuration(12 * 60_000 + 46_000)).toBe('12:46');
  });
});
