import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

jest.mock('@/lib/server/supabaseServer', () => ({
  createSupabaseServerClient: jest.fn(),
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
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    jest.resetAllMocks();
  });

  it('renders marketing HTML for anonymous visitors, not LoadingScreen', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    (createSupabaseServerClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const ui = await Home();
    render(<ThemeProvider>{ui}</ThemeProvider>);

    expect(screen.queryByText('Loading your connections...')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-authenticated')).not.toBeInTheDocument();
    expect(screen.getByText(/from handshake to friendship/)).toBeInTheDocument();
    expect(screen.getByText(/Stop scrolling. Start living./)).toBeInTheDocument();
  });
});
