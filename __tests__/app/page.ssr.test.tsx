import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadSessionBootstrap } from '@/lib/server/session';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

jest.mock('@/lib/server/getServerUser', () => ({
  getServerUser: jest.fn(),
}));

jest.mock('@/lib/server/presenceHeatmap', () => ({
  loadPresenceHeatmap: jest.fn().mockResolvedValue({ cells: [], generatedAt: '2026-01-01T00:00:00.000Z' }),
}));

jest.mock('@/lib/server/home/loadHome', () => ({ loadHome: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/server/session', () => ({
  loadSessionBootstrap: jest.fn(),
}));
jest.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
jest.mock('@/components/app-shell/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));
jest.mock('@/components/home/HomeGreeting', () => ({
  HomeGreeting: ({ firstName }: { firstName: string }) => <h1>Hello, {firstName}</h1>,
}));

jest.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
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
    expect(screen.getByText(/from handshake to friendship/)).toBeInTheDocument();
    expect(screen.getByText(/Stop scrolling. Start living./)).toBeInTheDocument();
    const html = document.documentElement.innerHTML;
    expect(html).toContain('basemaps.cartocdn.com');
  });

  it('renders the signed-in shell (not marketing) when the cookie session resolves', async () => {
    (getServerUser as jest.Mock).mockResolvedValue({ id: 'u1' });
    (loadSessionBootstrap as jest.Mock).mockResolvedValue({ viewer: { id: 'u1', name: 'Ada Lovelace', email: null, avatarUrl: null } });

    const ui = (await Home()) as React.ReactElement;
    // Async server component: resolve one level and inspect the tree instead of client-rendering it.
    const shell = await (ui.type as () => Promise<React.ReactElement<{ children: React.ReactNode }>>)();
    const { container } = render(<div>{(shell.props.children as React.ReactElement<{ children: React.ReactNode[] }>).props.children[0]}</div>);

    expect(screen.getByRole('heading', { name: 'Hello, Ada' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/from handshake to friendship/);
  });
});
