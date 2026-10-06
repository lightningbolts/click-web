import { render, screen } from '@testing-library/react';
import PlacePage, { generateMetadata } from '@/app/p/[slug]/page';
import type { PlaceDetail } from '@/lib/places/types';

const mockLoadPublicPlace = jest.fn();

jest.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
jest.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
jest.mock('@/components/places/ManagePlaceButton', () => ({ ManagePlaceButton: () => null }));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => ({}) }));
jest.mock('@/lib/server/places/publicPlace', () => ({
  placesPublicPagesEnabled: () => process.env.PLACES_PUBLIC_PAGES_ENABLED === 'true',
  loadPublicPlace: (...args: unknown[]) => mockLoadPublicPlace(...args),
}));

const TOKEN = 'f0000000-0000-4000-8000-000000000001';

const PLACE: PlaceDetail = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  slug: 'cafe-allegro-seattle',
  name: 'Café Allegro',
  category: 'cafe',
  photo_url: null,
  latitude: 47.6588,
  longitude: -122.3131,
  radius_meters: 75,
  distance_meters: null,
  address_line: '4214 University Way NE',
  city: 'Seattle',
  open_now: true,
  pulse: {
    state: 'live',
    label: 'lively',
    energy_score: 3,
    report_count: 1,
    newest_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    confidence: 'low',
    distribution: [0, 0, 1, 0],
    talkable: { yes: 0, no: 0 },
    category: null,
    window_minutes: 90,
  },
  here_now_count: 3,
  events_today_count: 0,
  next_event: null,
  hub_id: null,
  viewer: null,
  description: 'Espresso since 1975.',
  website_url: null,
  timezone: 'America/Los_Angeles',
  hours: { mon: [['07:00', '15:00']] },
  today_hours_label: '7 AM – 3 PM',
  directions: {
    apple_maps_url: 'https://maps.apple.com/?daddr=47.6588,-122.3131&q=Caf%C3%A9%20Allegro',
    google_maps_url: 'https://www.google.com/maps/dir/?api=1&destination=47.6588,-122.3131',
  },
  pattern: { label: 'lively', report_count: 6, weeks: 8 },
  upcoming_events: [],
  here_now_connections: [],
  clicks_been_here: null,
  you_met_here: null,
  own_history: null,
  check_in: null,
  pulse_eligibility: null,
  hub: null,
  is_manager: false,
};

async function renderPage(query: { t?: string } = {}) {
  const ui = await PlacePage({ params: Promise.resolve({ slug: PLACE.slug }), searchParams: Promise.resolve(query) });
  return render(ui);
}

describe('/p/[slug]', () => {
  const original = process.env.PLACES_PUBLIC_PAGES_ENABLED;
  afterEach(() => {
    process.env.PLACES_PUBLIC_PAGES_ENABLED = original;
    mockLoadPublicPlace.mockReset();
  });

  it('is a 404 when public Place pages are not enabled', async () => {
    delete process.env.PLACES_PUBLIC_PAGES_ENABLED;
    mockLoadPublicPlace.mockResolvedValue(PLACE);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockLoadPublicPlace).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown Place', async () => {
    process.env.PLACES_PUBLIC_PAGES_ENABLED = 'true';
    mockLoadPublicPlace.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders the Place with the Now copy', async () => {
    process.env.PLACES_PUBLIC_PAGES_ENABLED = 'true';
    mockLoadPublicPlace.mockResolvedValue(PLACE);
    const { container } = await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Café Allegro' })).toBeTruthy();
    expect(screen.getByText('Lively · 1 report · 4 min ago')).toBeTruthy();
    expect(screen.getByText('Early read')).toBeTruthy();
    expect(screen.getByText('Usually Lively around now · 6 reports over 8 weeks')).toBeTruthy();
    expect(screen.getByText('3 here now')).toBeTruthy();
    expect(container.innerHTML).not.toContain('place-qr-banner');
  });

  it('shows the QR banner and echoes the token only in the click:// button', async () => {
    process.env.PLACES_PUBLIC_PAGES_ENABLED = 'true';
    mockLoadPublicPlace.mockResolvedValue(PLACE);
    const { container } = await renderPage({ t: TOKEN });
    expect(screen.getByTestId('place-qr-banner').textContent).toContain("You scanned Café Allegro’s check-in code.");
    const withToken = Array.from(container.querySelectorAll('a')).filter((a) => a.getAttribute('href')?.includes(TOKEN));
    expect(withToken.map((a) => a.getAttribute('href'))).toEqual([`click://p/cafe-allegro-seattle?t=${TOKEN}`]);
    expect(container.innerHTML.split(TOKEN)).toHaveLength(2);

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: PLACE.slug }) });
    expect(JSON.stringify(metadata)).not.toContain(TOKEN);
    expect(metadata.title).toBe('Café Allegro · Click');
    expect(metadata.description).toBe("Café in Seattle. See what's on and how it feels right now.");
  });

  it('ignores a malformed token', async () => {
    process.env.PLACES_PUBLIC_PAGES_ENABLED = 'true';
    mockLoadPublicPlace.mockResolvedValue(PLACE);
    const { container } = await renderPage({ t: '"><script>x</script>' });
    expect(container.innerHTML).not.toContain('place-qr-banner');
    expect(container.innerHTML).not.toContain('<script>');
  });
});
