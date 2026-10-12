import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as maplibregl from 'maplibre-gl';
import LandingPlayground from '@/components/landing/playground';
import ThemeToggle from '@/components/ThemeToggle';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

jest.mock('@/components/landing/playground/PlaygroundMapLazy', () => ({
  __esModule: true,
  default: require('@/components/landing/playground/PlaygroundMap').default,
}));

jest.mock('framer-motion', () => {
  const React = require('react');
  const Forward = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, { ...props, ref }),
    );
  const elements: Record<string, unknown> = {};
  return {
    motion: new Proxy({}, { get: (_target: unknown, prop: string) => elements[prop] ?? (elements[prop] = Forward(prop)) }),
    m: new Proxy({}, { get: (_target: unknown, prop: string) => elements[prop] ?? (elements[prop] = Forward(prop)) }),
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
    domMax: {},
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

function renderPlayground() {
  const result = render(
    <ThemeProvider>
      <ThemeToggle />
      <LandingPlayground />
    </ThemeProvider>,
  );
  fireEvent.click(sceneTab('Connect'));
  return result;
}

function sceneTab(name: string) {
  return within(screen.getByRole('tablist', { name: 'Product playground' })).getByRole('tab', { name });
}

function dashboardTab(name: string) {
  return within(screen.getByRole('tablist', { name: 'Dashboard tabs' })).getByRole('tab', { name });
}

async function openDashboardMap(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
  await user.click(dashboardTab('Map'));
  await waitFor(() => {
    expect(screen.getByTestId('playground-scene-map')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByLabelText('My Network')).toBeInTheDocument();
  });
}

describe('LandingPlayground', () => {
  it('starts on Home and shares availability with the web preview', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><LandingPlayground /></ThemeProvider>);
    expect(sceneTab('Home')).toHaveAttribute('aria-selected', 'true');
    const phone = within(screen.getAllByTestId('playground-scene-home')[0]);
    await user.click(phone.getByRole('button', { name: 'Walk' }));
    await user.click(sceneTab('Dashboard'));
    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['Home', 'Clicks', 'Map', 'Events', 'Add Click', 'Me']) {
      expect(dashboardTab(label)).toBeInTheDocument();
    }
  });

  it('opens the selected nearby event and routes a phone attendee into chat', async () => {
    const user = userEvent.setup();
    renderPlayground();
    await user.click(sceneTab('Home'));
    const phone = within(screen.getAllByTestId('playground-scene-home')[0]);
    await user.type(phone.getByRole('textbox', { name: 'Search people, places, events' }), 'Friday');
    await user.click(phone.getByRole('button', { name: /Friday Night Climb/ }));
    const events = within(screen.getAllByTestId('playground-scene-events')[0]);
    expect(events.getByTestId('playground-rsvp-climb')).toBeInTheDocument();
    await user.click(events.getByRole('button', { name: 'Ymir' }));
    expect(within(screen.getByTestId('playground-scene-clicks')).getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });

  it('keeps a joined hub conversation when switching between iOS and web', async () => {
    const user = userEvent.setup();
    renderPlayground();
    await user.click(sceneTab('Hubs'));
    const phone = within(screen.getByTestId('playground-scene-hubs'));
    await user.click(phone.getByRole('button', { name: 'Find nearby hubs' }));
    await user.click(phone.getByRole('button', { name: 'Join hub' }));
    await user.type(phone.getByRole('textbox', { name: 'Hub message' }), 'See you at the mixer!');
    await user.click(phone.getByRole('button', { name: 'Send' }));
    await user.click(sceneTab('Dashboard'));
    await user.click(screen.getByRole('button', { name: 'Explore hubs' }));
    await user.click(screen.getByRole('button', { name: 'Open hub' }));
    expect(screen.getByRole('list', { name: 'Hub messages' })).toHaveTextContent('See you at the mixer!');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('moves focus with the scene tabs and returns to Home from the app navigation', async () => {
    const user = userEvent.setup();
    renderPlayground();
    sceneTab('Connect').focus();
    await user.keyboard('{ArrowLeft}');
    expect(sceneTab('Home')).toHaveFocus();
    expect(sceneTab('Home')).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Add Click' }));
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(sceneTab('Home')).toHaveAttribute('aria-selected', 'true');
  });

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('switches scenes from the tablist', async () => {
    const user = userEvent.setup();
    renderPlayground();

    expect(screen.getByTestId('playground-scene-connect')).toBeInTheDocument();

    await user.click(sceneTab('Events'));
    expect(screen.getByTestId('playground-scene-events')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
    expect(screen.getByTestId('playground-scene-dashboard')).toBeInTheDocument();

    await openDashboardMap(user);
    expect(screen.getByLabelText('Events')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('playground-pin-overlay')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('playground-map-pin').length).toBeGreaterThan(0);
    expect(screen.getByTestId('playground-pin-overlay')).toHaveTextContent('Campus Comedy Night');
    expect(screen.getByTestId('playground-pin-popup-card')).toHaveStyle({ background: 'var(--surface)' });
    expect(global.fetch).not.toHaveBeenCalled();
    const mapOptions = (maplibregl.Map as unknown as jest.Mock).mock.calls[0][0] as {
      style: unknown;
      transformRequest: (url: string) => { url: string };
      maxBounds: unknown;
      pixelRatio: number;
    };
    expect(mapOptions.style).toBe('https://basemaps.cartocdn.com/gl/positron-gl-style/style.json');
    expect(mapOptions.pixelRatio).toBe(1);
    expect(mapOptions.maxBounds).toEqual([
      [-122.38, 47.58],
      [-122.25, 47.68],
    ]);
    expect(mapOptions.transformRequest(`${window.location.origin}/api/map/beacons`).url).toBe(
      'about:blank',
    );
  });

  it('keeps the map mounted and does not fetch when toggling theme', async () => {
    const user = userEvent.setup();
    renderPlayground();
    await openDashboardMap(user);
    await waitFor(() => {
      expect(screen.getByTestId('playground-pin-overlay')).toBeInTheDocument();
    });

    const mapMock = maplibregl.Map as unknown as jest.Mock;
    const constructed = mapMock.mock.calls.length;
    const mapInstance = mapMock.mock.results[0]?.value as {
      remove: jest.Mock;
      setStyle: jest.Mock;
    };
    const removeCalls = mapInstance.remove.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Toggle light or dark theme' }));

    expect(mapMock).toHaveBeenCalledTimes(constructed);
    expect(mapInstance.remove).toHaveBeenCalledTimes(removeCalls);
    expect(mapInstance.setStyle).toHaveBeenCalledWith(
      'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      { diff: true },
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('playground-scene-map')).toBeInTheDocument();
    expect(screen.getByTestId('playground-pin-overlay')).toHaveTextContent('Campus Comedy Night');
    expect(screen.getByLabelText('My Network')).toBeInTheDocument();
  });

  it('opens chats from the app Clicks tab', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(screen.getByRole('button', { name: 'Clicks' }));
    expect(screen.getByTestId('playground-scene-clicks')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('playground-clicks-chat-maya'));
    expect(
      within(screen.getByTestId('playground-scene-clicks')).getByLabelText('Message'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('playground-scene-clicks')).getByText('You going to comedy night?'),
    ).toBeInTheDocument();
  });

  it('opens Settings without a theme toggle', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByTestId('playground-scene-settings')).toBeInTheDocument();
    expect(screen.queryByText('Dark mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
  });

  it('renders a real QR code on My QR', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(screen.getByRole('button', { name: 'My QR' }));
    expect(screen.getByTitle('Click QR Code for Alex Rivera')).toBeInTheDocument();
  });

  it('adds a Tap connection that appears on the Dashboard', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(screen.getByTestId('playground-tap-jordan'));
    await user.click(screen.getByRole('button', { name: 'Save memory' }));
    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));

    expect(screen.getAllByText('Jordan Hale').length).toBeGreaterThan(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('toggles an event RSVP onto the Dashboard', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(sceneTab('Events'));
    expect(screen.getByTestId('playground-rsvp-mixer')).toHaveTextContent('RSVP');

    await user.click(screen.getByTestId('playground-rsvp-mixer'));
    expect(screen.getByTestId('playground-rsvp-mixer')).toHaveTextContent('Cancel RSVP');

    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
    expect(screen.getAllByText('Dawg Daze Mixer').length).toBeGreaterThan(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('opens a chat thread from the dashboard inbox', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
    await user.click(dashboardTab('Clicks'));
    await user.click(screen.getByRole('button', { name: /Maya Chen/i }));

    expect(screen.getByText('You going to comedy night?')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows a new Click as say-hi, then sends a plan that lands in Coming up', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(screen.getByTestId('playground-tap-jordan'));
    await user.click(screen.getByRole('button', { name: 'Save memory' }));
    await user.click(screen.getByRole('button', { name: 'Clicks' }));
    const clicks = screen.getByTestId('playground-scene-clicks');
    expect(within(clicks).getByText('New Click · say hi')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('playground-clicks-chat-jordan'));
    const thread = screen.getByTestId('playground-scene-clicks');
    expect(within(thread).getByTestId('playground-say-hi')).toBeInTheDocument();
    await user.click(within(thread).getByRole('button', { name: 'Plan a hangout with Jordan' }));
    // The phone thread and the web companion show the same conversation.
    const cards = screen.getAllByTestId('playground-plan-card');
    expect(cards[0]).toHaveTextContent('Coffee');
    expect(within(cards[0]).getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
    await user.click(dashboardTab('Home'));
    expect(screen.getByTestId('playground-coming-up')).toHaveTextContent('Coffee with Jordan');
    expect(screen.queryByText(/Retention Rate|Connection Streak/)).not.toBeInTheDocument();
  });
});
