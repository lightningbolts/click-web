import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { getServerUser } from '@/lib/server/getServerUser';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

jest.mock('@/lib/server/getServerUser', () => ({
  getServerUser: jest.fn(),
}));

jest.mock('@/lib/server/presenceHeatmap', () => ({
  loadPresenceHeatmap: jest.fn().mockResolvedValue({ cells: [], generatedAt: '2026-01-01T00:00:00.000Z' }),
}));

jest.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/components/HomeAuthenticated', () => ({
  __esModule: true,
  default: () => <div data-testid="home-authenticated">Loading your connections</div>,
}));

jest.mock('@/components/landing/fold-map/FoldMapLazy', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-fold-map-canvas" />,
}));

jest.mock('@/components/landing/playground/LandingPlaygroundLazy', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-playground" />,
}));

jest.mock('framer-motion', () => {
  const React = require('react');
  const Forward = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, { ...props, ref }),
    );
  return {
    motion: new Proxy({}, { get: (_target: unknown, prop: string) => Forward(prop) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

describe('Home SSR', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders marketing HTML for anonymous visitors, not LoadingScreen', async () => {
    (getServerUser as jest.Mock).mockResolvedValue(null);

    const ui = await Home();
    render(<ThemeProvider>{ui}</ThemeProvider>);

    expect(screen.queryByText('Loading your connections...')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-authenticated')).not.toBeInTheDocument();
    expect(screen.getByText(/from handshake to friendship/)).toBeInTheDocument();
    expect(screen.getByText(/Stop scrolling. Start living./)).toBeInTheDocument();
    const html = document.documentElement.innerHTML;
    expect(html).toContain('basemaps.cartocdn.com');
  });
});
