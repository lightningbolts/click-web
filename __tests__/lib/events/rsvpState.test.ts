import { eventAtCapacity, resolveRsvpState, type RsvpStateInput } from '@/lib/events/rsvpState';

const base: RsvpStateInput = {
  signedIn: true,
  going: false,
  requestStatus: null,
  rsvpEnabled: true,
  approvalRequired: false,
  atCapacity: false,
  ended: false,
};
const state = (over: Partial<RsvpStateInput>) => resolveRsvpState({ ...base, ...over });

describe('resolveRsvpState (spec §7.6.2 RSVP card)', () => {
  it.each([
    ['open', {}],
    ['approval', { approvalRequired: true }],
    ['going', { going: true }],
    ['requested', { requestStatus: 'pending' as const }],
    ['waitlist', { requestStatus: 'waitlisted' as const }],
    ['full', { atCapacity: true }],
    ['ended', { ended: true }],
    ['guest', { signedIn: false }],
    ['loading', { signedIn: null }],
    ['closed', { rsvpEnabled: false }],
  ])('%s', (expected, over) => {
    expect(state(over)).toBe(expected);
  });

  it('keeps your own standing when the event fills up', () => {
    expect(state({ going: true, atCapacity: true })).toBe('going');
    expect(state({ requestStatus: 'pending', atCapacity: true })).toBe('requested');
    expect(state({ requestStatus: 'waitlisted', atCapacity: true })).toBe('waitlist');
  });

  it('treats a denied request like no request', () => {
    expect(state({ requestStatus: 'denied' })).toBe('open');
    expect(state({ requestStatus: 'denied', approvalRequired: true })).toBe('approval');
  });

  it('ends for everyone once the event is over', () => {
    expect(state({ ended: true, going: true })).toBe('ended');
    expect(state({ ended: true, signedIn: false })).toBe('ended');
    expect(state({ ended: true, rsvpEnabled: false })).toBe('ended');
  });

  it('shows signed-out visitors the full state instead of a form that would be refused', () => {
    expect(state({ signedIn: false, atCapacity: true })).toBe('full');
  });

  it('still shows a going guest their RSVP after the host closes registration', () => {
    expect(state({ rsvpEnabled: false, going: true })).toBe('going');
  });
});

describe('eventAtCapacity', () => {
  it('matches the server policy', () => {
    expect(eventAtCapacity(null, 500)).toBe(false);
    expect(eventAtCapacity(10, 9)).toBe(false);
    expect(eventAtCapacity(10, 10)).toBe(true);
    expect(eventAtCapacity(0, 0)).toBe(true);
  });
});
