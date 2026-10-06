import { render, screen, act, waitFor } from '@testing-library/react';
import DashboardView from '@/components/DashboardView';
import type { DashboardTab } from '@/lib/shell/personalProductNav';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

/* ------------------------------------------------------------------ */
/*  Mocks — isolate DashboardView from external services & children   */
/* ------------------------------------------------------------------ */

const mockSignOut = jest.fn();
const authState: {
  signOut: jest.Mock;
  profileImageUrl: string | null;
  user: { id: string } | null;
  loading: boolean;
} = {
  signOut: mockSignOut,
  profileImageUrl: null,
  user: { id: 'user-123' },
  loading: false,
};
jest.mock('@/lib/AuthContext', () => ({
  useAuth: () => authState,
}));

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => null,
}));

jest.mock('@/components/dashboard/DashboardEventsModule', () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-events-module" />,
}));

const searchState: { tab: string | null } = { tab: null };
const navFns = { push: jest.fn(), replace: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => navFns,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(searchState.tab ? `tab=${searchState.tab}` : ''),
}));

jest.mock('framer-motion', () => {
  const React = require('react');
  const Forward = (tag: string) =>
    React.forwardRef((props: any, ref: any) => React.createElement(tag, { ...props, ref }));
  return {
    motion: new Proxy(
      {},
      { get: (_target: any, prop: string) => Forward(prop) },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => true,
  };
});

jest.mock('@/components/chat', () => ({
  ChatView: () => <div data-testid="chat-view" />,
}));

jest.mock('@/components/InterestTagging', () => {
  return function MockInterestTagging() {
    return <div data-testid="interest-tagging" />;
  };
});

jest.mock('@/components/dashboard/ConnectionMap', () => ({
  __esModule: true,
  default: () => <div data-testid="connection-map" />,
}));
jest.mock('@/components/dashboard', () => ({
  ConnectionTable: () => <div data-testid="connection-table" />,
  ConnectionMap: () => <div data-testid="connection-map" />,
}));

jest.mock('@/lib/dashboard/mockData', () => ({
  mockConnections: [],
  mockChapters: [],
  downloadCSV: jest.fn(),
  generateChaptersFromConnections: jest.fn(() => []),
}));

jest.mock('@/lib/chat/crypto', () => ({
  deriveKeysForConnection: jest.fn(),
  decryptContent: jest.fn(),
  isEncrypted: jest.fn(() => false),
}));

jest.mock('@/lib/notifications/preferences', () => ({
  DEFAULT_NOTIFICATION_PREFERENCES: {
    messagePushEnabled: true,
    callPushEnabled: true,
    eventReminderPushEnabled: true,
    availabilityMatchPushEnabled: true,
    hubMessagePushEnabled: true,
    eventTeaserPushEnabled: true,
    reconnectNudgePushEnabled: true,
  },
  loadNotificationPreferences: jest.fn(async () => ({
    messagePushEnabled: true,
    callPushEnabled: true,
    eventReminderPushEnabled: true,
    availabilityMatchPushEnabled: true,
    hubMessagePushEnabled: true,
    eventTeaserPushEnabled: true,
    reconnectNudgePushEnabled: true,
  })),
  saveNotificationPreferences: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/lib/dashboard/userMetrics', () => ({
  buildDashboardMetrics: jest.fn(() => ({
    totalConnections: 0,
    thisMonth: 0,
    lastMonth: 0,
    streak: 0,
    retentionRate: 0,
    keptCount: 0,
    thisMonthTrendPercent: null,
    totalNetworkGrowthPercent: null,
  })),
  getNextMilestone: jest.fn(() => ({
    target: 5,
    label: 'First Five',
    reward: 'Badge',
  })),
  getUnlockedAchievements: jest.fn(() => []),
  getAllAchievements: jest.fn(() => [
    {
      id: 'first_connection',
      title: 'First Connection',
      description: 'Met someone on Click',
      unlocked: false,
    },
  ]),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function buildMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-123',
    email: 'alice@example.com',
    user_metadata: { full_name: 'Alice Smith' },
    ...overrides,
  };
}

async function renderDashboard(
  user: Record<string, unknown> = buildMockUser(),
  routeTab: DashboardTab = 'map',
) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ThemeProvider>
        <DashboardView user={user} routeTab={routeTab} />
      </ThemeProvider>,
    );
  });
  // Wait until loading gates clear (connections + birthday profile).
  await waitFor(() => {
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument();
  });
  return result!;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('DashboardView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.user = { id: 'user-123' };
    authState.loading = false;
    searchState.tab = null;
    navFns.replace.mockClear();
    navFns.push.mockClear();
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/users/') && url.includes('/profile')) {
        return jsonResponse({ user: { birthday: '2000-01-01' } });
      }
      if (url.includes('/api/connections')) {
        return jsonResponse({ active: [], archived: [], map: [], core: [] });
      }
      if (url.includes('/api/me/event-bookmarks')) {
        return jsonResponse({ bookmarks: [] });
      }
      return jsonResponse({});
    }) as jest.Mock;
  });

  it('renders without crashing when given a minimal user prop', async () => {
    const { container } = await renderDashboard();
    expect(container).toBeTruthy();
  });

  it('does not render product tabs inside the dashboard pane', async () => {
    await renderDashboard();
    expect(screen.queryByTestId('dashboard-tab-memory')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-tab-events')).not.toBeInTheDocument();
  });

  it('renders the map pane for /map', async () => {
    await renderDashboard(buildMockUser(), 'map');
    expect(await screen.findByTestId('connection-map')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });

  it('does not crash when user has no email or metadata', async () => {
    const { container } = await renderDashboard({ id: 'user-bare' });
    expect(container).toBeTruthy();
  });

  it('unmounts product chrome immediately when the session is gone', async () => {
    authState.user = null;
    await act(async () => {
      render(
        <ThemeProvider>
          <DashboardView user={buildMockUser()} routeTab="map" />
        </ThemeProvider>,
      );
    });
    expect(screen.queryByTestId('dashboard-root')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-tab-events')).not.toBeInTheDocument();
  });
});
