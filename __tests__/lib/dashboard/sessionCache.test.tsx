import { act, render } from '@testing-library/react';
import { clearSessionCache, readSessionCache, useSessionCachedState } from '@/lib/dashboard/sessionCache';

function Probe({ userId, onValue }: { userId: string; onValue: (set: (v: number) => void, value: number) => void }) {
  const [value, setValue] = useSessionCachedState(userId, 'count', 0);
  onValue(setValue, value);
  return null;
}

describe('dashboard session cache', () => {
  afterEach(() => clearSessionCache());

  it('rehydrates a remount with the last value instead of the empty default', () => {
    let set: (v: number) => void = () => {};
    const seen: number[] = [];
    const first = render(<Probe userId="u1" onValue={(s, v) => { set = s; seen.push(v); }} />);
    act(() => set(7));
    first.unmount();

    const again: number[] = [];
    render(<Probe userId="u1" onValue={(_s, v) => again.push(v)} />);
    expect(again[0]).toBe(7);
  });

  it('is scoped per user and cleared on sign-out', () => {
    let set: (v: number) => void = () => {};
    const view = render(<Probe userId="u1" onValue={(s) => { set = s; }} />);
    act(() => set(3));
    view.unmount();
    expect(readSessionCache('u2', 'count')).toBeUndefined();
    clearSessionCache();
    expect(readSessionCache('u1', 'count')).toBeUndefined();
  });
});
