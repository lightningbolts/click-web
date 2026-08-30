import { render, screen } from '@testing-library/react';
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

function renderLanding() {
  return render(
    <ThemeProvider>
      <LandingPage />
    </ThemeProvider>,
  );
}

describe('LandingPage', () => {
  it('renders the Fold Map hero, tagline, waitlist CTA, and Why Click exists', () => {
    renderLanding();

    expect(screen.getByTestId('landing-fold-map')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Click' })).toBeInTheDocument();
    expect(screen.getByText(/from handshake to friendship/)).toBeInTheDocument();
    expect(screen.getByText(/Stop scrolling. Start living./)).toBeInTheDocument();
    expect(screen.getByText(/Your phones confirm you were in the same room/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Join the Waitlist' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Why Click exists' })).toHaveAttribute('href', '#why');
  });

  it('renders the playground and does not use product screenshot alts', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /Try it/ })).toBeInTheDocument();
    expect(screen.getByTestId('landing-playground-heading')).toBeInTheDocument();
    expect(screen.getByTestId('landing-playground')).toBeInTheDocument();
    expect(
      screen.queryByAltText(/Click web — Personal dashboard/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByAltText(/Click mobile/i)).not.toBeInTheDocument();
  });

  it('explains why the product exists', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: 'Why Click exists' })).toBeInTheDocument();
    expect(screen.getByText('The follow-back void')).toBeInTheDocument();
    expect(screen.getByText('The handle handoff')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Built for the moment you put your phone down' }),
    ).toBeInTheDocument();
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
    expect(screen.getByRole('dialog', { name: 'Join the Waitlist' })).toBeInTheDocument();
  });
});
