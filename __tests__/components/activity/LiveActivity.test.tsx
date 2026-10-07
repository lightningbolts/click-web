import { act, render } from '@testing-library/react';
import { LiveActivity } from '@/components/app-shell/LiveActivity';

const refreshActivity = jest.fn().mockResolvedValue(undefined);
jest.mock('@/components/activity/activityData', () => ({
  ACTIVITY_KEY: '/api/activity',
  refreshActivity: () => refreshActivity(),
}));
jest.mock('swr', () => ({ mutate: jest.fn() }));

type Hint = { payload: { kind?: string } };
let onHint: (hint: Hint) => void = () => undefined;
let onStatus: (status: string) => void = () => undefined;
const channelSpy = jest.fn();
const removeChannel = jest.fn();
const channel = {
  on: (_type: string, _filter: unknown, cb: (hint: Hint) => void) => {
    onHint = cb;
    return channel;
  },
  subscribe: (cb: (status: string) => void) => {
    onStatus = cb;
    return channel;
  },
};
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    channel: (topic: string, opts: unknown) => {
      channelSpy(topic, opts);
      return channel;
    },
    realtime: { setAuth: () => Promise.resolve() },
    removeChannel: (c: unknown) => removeChannel(c),
  }),
}));

describe('LiveActivity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    refreshActivity.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  async function mount() {
    const view = render(<LiveActivity viewerId="me" />);
    await act(async () => undefined); // setAuth resolves, then it subscribes
    act(() => onStatus('SUBSCRIBED'));
    return view;
  }

  it("joins the viewer's private topic and refetches once per burst of activity hints", async () => {
    const { unmount } = await mount();
    expect(channelSpy).toHaveBeenCalledWith('user:me', { config: { private: true } });

    act(() => {
      onHint({ payload: { kind: 'activity' } });
      onHint({ payload: { kind: 'activity' } });
      onHint({ payload: { kind: 'drops' } });
    });
    expect(refreshActivity).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(600));
    expect(refreshActivity).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it('catches up after the socket rejoins (hints sent while it was down were missed)', async () => {
    await mount();
    act(() => onStatus('CHANNEL_ERROR'));
    act(() => onStatus('SUBSCRIBED'));
    act(() => jest.advanceTimersByTime(600));
    expect(refreshActivity).toHaveBeenCalledTimes(1);
  });
});
