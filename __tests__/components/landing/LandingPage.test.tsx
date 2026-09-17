import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LandingPage from '@/components/landing/LandingPage';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';

jest.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/components/HomeAuthenticated', () => ({
  __esModule: true,
  default: () => <div data-testid="home-authenticated" />,
}));

jest.mock('@/components/landing/fold-map/FoldMapHero', () => ({
  __esModule: true,
  default: ({ onJoinWaitlist, cells }: { onJoinWaitlist: () => void; cells: readonly unknown[] }) => (
    <section data-testid="landing-fold-map" data-heatmap-cells={cells.length}>
      <img alt="Click" />
      <h1>Click: from handshake to friendship.</h1>
      <p>Stop scrolling. Start living.</p>
      <p>Your phones confirm you were in the same room.</p>
      <button type="button" onClick={onJoinWaitlist}>Join the Waitlist</button>
    </section>
  ),
}));

jest.mock('@/components/landing/playground/LandingPlaygroundLazy', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-playground" />,
}));

jest.mock('@/components/marketing/WaitlistModal', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Join the Waitlist">Waitlist</div> : null,
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

function renderLanding() {
  return render(
    <ThemeProvider>
      <LandingPage heatmap={{ cells: [{ lat: 47.61, lng: -122.33, weight: 2 }], generatedAt: 'test' }} />
    </ThemeProvider>,
  );
}

describe('LandingPage', () => {
  it('renders the Fold Map heatmap hero, tagline, and waitlist CTA', () => {
    renderLanding();

    expect(screen.getByTestId('landing-fold-map')).toHaveAttribute('data-heatmap-cells', '1');
    expect(screen.getByRole('img', { name: 'Click' })).toBeInTheDocument();
    expect(screen.getByText(/from handshake to friendship/)).toBeInTheDocument();
    expect(screen.getByText(/Stop scrolling. Start living./)).toBeInTheDocument();
    expect(screen.getByText(/Your phones confirm you were in the same room/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Join the Waitlist' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Why Click exists' })).not.toBeInTheDocument();
  });

  it('renders the refined playground framing and demo', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /Try Click before launch/i })).toBeInTheDocument();
    expect(screen.getByText(/Demo state is local to this page/i)).toBeInTheDocument();
    expect(screen.getByTestId('landing-playground-heading')).toBeInTheDocument();
    expect(screen.getByTestId('landing-playground')).toBeInTheDocument();
    expect(screen.queryByAltText(/Click web — Personal dashboard/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/Click mobile/i)).not.toBeInTheDocument();
  });

  it('pairs concise feature copy with existing product images and working links', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /Connect.*without.*the noise/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Discover.*real events/i })).toBeInTheDocument();
    expect(screen.getByAltText(/Add Click screen/)).toBeInTheDocument();
    expect(screen.getByAltText(/Click event details/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore events/ })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: /See how it works/ })).toHaveAttribute('href', '#how-it-works');
  });

  it('points enterprise traffic at /enterprise instead of an insights carousel', () => {
    renderLanding();

    expect(screen.getByRole('link', { name: /See Click for Business/i })).toHaveAttribute(
      'href',
      '/enterprise',
    );
    expect(screen.queryByText(/Partner insights/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vibe Stream/i)).not.toBeInTheDocument();
  });

  it('opens the waitlist dialog from the hero CTA', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getAllByRole('button', { name: 'Join the Waitlist' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Join the Waitlist' })).toBeInTheDocument();
    });
  });
});
