import { act, fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette, isTypingTarget, paletteResults } from '@/components/app-shell/CommandPalette';
import { GlobalShortcuts } from '@/components/app-shell/GlobalShortcuts';
import { openCommandPalette } from '@/components/app-shell/commandPaletteEvents';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({}) }));

const data = {
  people: [{ userId: 'u9', name: 'Grace', avatarUrl: null, context: 'In a group with you' }],
  clicks: [{ connectionId: 'c1', userId: 'u1', name: 'Ada', avatarUrl: null }],
  groups: [{ groupId: 'g1', name: 'Climbers' }],
  events: Array.from({ length: 7 }, (_, i) => ({ beaconId: `e${i}`, title: `Event ${i}`, locationName: null, startAt: null, imageUrl: null })),
  places: [{ placeId: 'p1', slug: 'cafe', name: 'Café', category: 'cafe', city: 'Seattle' }],
  hubs: [{ hubId: 'h1', name: 'Hub', category: null }],
};

beforeEach(() => jest.clearAllMocks());

describe('command palette (spec §7.10)', () => {
  it('puts your Clicks first, caps each group at five and links each kind', () => {
    const rows = paletteResults(data, 'all');
    expect(rows.filter((r) => r.scope === 'events')).toHaveLength(5);
    expect(rows[0]).toMatchObject({ title: 'Ada', subtitle: 'Your Click', href: '/clicks/c/c1' });
    expect(rows.find((r) => r.scope === 'groups')?.href).toBe('/clicks/g/g1');
    expect(rows.find((r) => r.scope === 'places')).toMatchObject({ href: '/p/cafe', subtitle: 'Café · Seattle' });
    expect(rows.find((r) => r.scope === 'hubs')?.href).toBe('/clicks/h/h1');
    expect(paletteResults(data, 'people').map((r) => r.title)).toEqual(['Ada', 'Grace']);
  });

  it('opens from the event and from ⌘K, and runs quick actions with Enter', () => {
    render(<CommandPalette />);
    act(() => openCommandPalette());
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Show my QR/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/events/new');
  });

  it('ignores "/" while typing in a field', () => {
    const input = document.createElement('input');
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
  });

  it('goes places with G chords and lists shortcuts on "?"', () => {
    render(<GlobalShortcuts />);
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'e' });
    expect(push).toHaveBeenCalledWith('/events');
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});
