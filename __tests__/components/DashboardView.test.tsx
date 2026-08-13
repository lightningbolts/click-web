import { render, screen, act, waitFor } from '@testing-library/react';
import DashboardView from '@/components/DashboardView';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

/* ------------------------------------------------------------------ */
/*  Mocks — isolate DashboardView from external services & children   */
/* ------------------------------------------------------------------ */

const mockSignOut = jest.fn();
jest.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('livekit-client', () => ({
  Room: jest.fn(),
  RoomEvent: {},
  Track: { Source: { Camera: 'camera' } },
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
  };
});

jest.mock('@/components/SettingsView', () => {
  return function MockSettingsView() {
    return <div data-testid="settings-view" />;
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

jest.mock('@/components/chat/CallOverlay', () => {
  const MockCallOverlay = () => <div data-testid="call-overlay" />;
  MockCallOverlay.displayName = 'CallOverlay';
  return {
    __esModule: true,
    default: MockCallOverlay,
  };
});

jest.mock('@/components/dashboard', () => ({
  ConnectionTable: () => <div data-testid="connection-table" />,
  TimeCapsule: () => <div data-testid="time-capsule" />,
  QRIdentityCard: () => <div data-testid="qr-identity-card" />,
  StatsOverview: () => <div data-testid="stats-overview" />,
  AchievementBadge: ({ title }: { title: string }) => (
    <div data-testid="achievement-badge">{title}</div>
  ),
  MilestoneProgress: () => <div data-testid="milestone-progress" />,
  ConnectionMap: () => <div data-testid="connection-map" />,
}));

jest.mock('@/components/dashboard/MyAvailabilityIntentsCard', () => ({
  __esModule: true,
  default: () => <div data-testid="my-availability-intents" />,
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
  },
  loadNotificationPreferences: jest.fn(async () => ({
    messagePushEnabled: true,
    callPushEnabled: true,
    eventReminderPushEnabled: true,
    availabilityMatchPushEnabled: true,
    hubMessagePushEnabled: true,
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

async function renderDashboard(user: Record<string, unknown> = buildMockUser()) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ThemeProvider>
        <DashboardView user={user} />
      </ThemeProvider>,
    );
  });
  // Wait until loading gates clear (connections + birthday profile).
  await waitFor(() => {
    expect(screen.getByTestId('call-overlay')).toBeInTheDocument();
  });
  return result!;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('DashboardView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/users/') && url.includes('/profile')) {
        return jsonResponse({ user: { birthday: '2000-01-01' } });
      }
      if (url.includes('/api/connections')) {
        return jsonResponse({ active: [], archived: [], map: [], core: [] });
      }
      return jsonResponse({});
    }) as jest.Mock;
  });

  it('renders without crashing when given a minimal user prop', async () => {
    const { container } = await renderDashboard();
    expect(container).toBeTruthy();
  });

  it('displays the user name in the welcome header', async () => {
    await renderDashboard();
    expect(await screen.findByText(/Alice Smith/)).toBeInTheDocument();
  });

  it('falls back to the email prefix when full_name is absent', async () => {
    await renderDashboard(
      buildMockUser({ user_metadata: {}, email: 'bob@example.com' }),
    );
    expect(await screen.findByText(/bob/)).toBeInTheDocument();
  });

  it('prefers first_name and last_name in user_metadata over full_name', async () => {
    await renderDashboard(
      buildMockUser({
        user_metadata: {
          first_name: 'Pat',
          last_name: 'Lee',
          full_name: 'Ignored Legacy',
        },
      }),
    );
    expect(await screen.findByText(/Pat Lee/)).toBeInTheDocument();
  });

  it('renders all five navigation tabs', async () => {
    await renderDashboard();

    const expectedLabels = ['Memory Box', 'Map', 'Chat', 'QR Identity', 'Settings'];
    for (const label of expectedLabels) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it('shows the Memory Box tab content by default (stats + milestones)', async () => {
    await renderDashboard();

    expect(await screen.findByTestId('stats-overview')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-progress')).toBeInTheDocument();
    expect(screen.getByTestId('time-capsule')).toBeInTheDocument();
    expect(screen.getByTestId('connection-table')).toBeInTheDocument();
  });

  it('shows "No achievements yet" when the achievements list is empty', async () => {
    await renderDashboard();
    expect(
      await screen.findByText(/No achievements yet/),
    ).toBeInTheDocument();
  });

  it('renders the data sovereignty notice', async () => {
    await renderDashboard();
    expect(await screen.findByText(/Your data belongs to you/)).toBeInTheDocument();
  });

  it('renders the CallOverlay component', async () => {
    await renderDashboard();
    expect(screen.getByTestId('call-overlay')).toBeInTheDocument();
  });

  it('does not crash when user has no email or metadata', async () => {
    const { container } = await renderDashboard({ id: 'user-bare' });
    expect(container).toBeTruthy();
  });
});
