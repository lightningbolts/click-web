import {
  defaultCallLayoutMode,
  formatCallDuration,
  gridRowSizes,
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
    expect(resolveCallLayoutMode(4, 'speaker', 4)).toBe('speaker');
  });

  it('forces grid above speaker layout max so remotes are not dropped', () => {
    expect(resolveCallLayoutMode(5, 'speaker', 5)).toBe('grid');
    expect(resolveCallLayoutMode(8, null)).toBe('grid');
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

  it('uses FaceTime-style grid row sizes', () => {
    expect(gridRowSizes(0)).toEqual([]);
    expect(gridRowSizes(1)).toEqual([1]);
    expect(gridRowSizes(2)).toEqual([2]);
    expect(gridRowSizes(3)).toEqual([1, 2]);
    expect(gridRowSizes(4)).toEqual([2, 2]);
    expect(gridRowSizes(5)).toEqual([2, 3]);
    expect(gridRowSizes(6)).toEqual([3, 3]);
    expect(gridRowSizes(7)).toEqual([3, 2, 2]);
    expect(gridRowSizes(8)).toEqual([3, 3, 2]);
  });
});
