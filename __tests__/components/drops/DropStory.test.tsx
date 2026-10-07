import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DropsStrip } from '@/components/home/DropsStrip';
import { sendDirectText } from '@/lib/chat/chatTextSend';
import type { HomeDrop } from '@/lib/home/types';

jest.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer t' }) }));
jest.mock('@/lib/chat/chatTextSend', () => ({ sendDirectText: jest.fn(async () => undefined) }));
jest.mock('@/components/chat/EmojiPopover', () => ({ EmojiPopover: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/home/AddDropSheet', () => ({ AddDropSheet: () => null }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));

const NOW = Date.parse('2026-10-07T12:00:00Z');
const PAST = '2026-10-07T10:00:00Z';
const FUTURE = '2026-10-07T13:00:00Z';

function drop(id: string, userId: string, over: Partial<HomeDrop> = {}): HomeDrop {
  return {
    id,
    user: { id: userId, name: `${userId[0].toUpperCase()}${userId.slice(1)} Lee`, avatar_url: null },
    is_mine: false,
    connection_id: `c-${userId}`,
    created_at: PAST,
    reveal_at: PAST,
    developed_at: PAST,
    width: 3,
    height: 4,
    preview_url: `https://x/${id}-preview.jpg`,
    original_url: `https://x/${id}.jpg`,
    reactions: { mine: null, reactions: [], is_owner: false },
    caption: null,
    ...over,
  };
}

type Call = { url: string; method: string; body: unknown };
let calls: Call[];

beforeEach(() => {
  calls = [];
  jest.useFakeTimers({ now: NOW, doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() })) as never;
  // jsdom has no Web Animations or pointer capture.
  Element.prototype.animate = jest.fn(() => ({ finished: Promise.resolve(), cancel: jest.fn() })) as never;
  Element.prototype.getAnimations = () => [];
  HTMLElement.prototype.setPointerCapture = jest.fn();
  if (!('PointerEvent' in window)) {
    (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'touch';
      }
    };
  }
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ({ drawImage: jest.fn() }) });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', body });
    let payload: unknown = { success: true };
    if (url === '/api/drops/develop') {
      payload = { drops: [{ kind: 'shared', id: body.drops[0].id, status: 'developed', developed_at: PAST, url: `https://x/${body.drops[0].id}.jpg` }] };
    } else if (url.startsWith('/api/reactions/')) {
      payload = { mine: body?.emoji ?? null, reactions: [], is_owner: false };
    }
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as never;
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

/** Shows the live page's photo (the story's clock waits for it), and lets queued updates land. */
async function loadPhotos() {
  await act(async () => {
    document.querySelectorAll('[data-testid="drop-story"] img').forEach((img) => img.dispatchEvent(new Event('load')));
    jest.advanceTimersByTime(0);
  });
}

async function openStory(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  const story = await screen.findByTestId('drop-story');
  await loadPhotos();
  return story;
}

function tap(story: HTMLElement, clientX: number) {
  const zone = story.querySelector<HTMLElement>('[class*="touch-none"]')!;
  fireEvent.pointerDown(zone, { clientX, clientY: 10, pointerId: 1, button: 0 });
  fireEvent.pointerUp(zone, { clientX, clientY: 10, pointerId: 1 });
}

describe('Drops strip', () => {
  it('shows one tile per person with how many they shared', () => {
    render(<DropsStrip items={[drop('a2', 'ana'), drop('a1', 'ana'), drop('b1', 'ben')]} nowMs={NOW} />);
    expect(screen.getByRole('button', { name: 'Drops from Ana Lee, 2 drops. Opens them.' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Drops from Ben Lee. Opens them.' })).toBeEnabled();
  });

  it('can’t open a person whose drops are all still developing', () => {
    render(<DropsStrip items={[drop('a1', 'ana', { reveal_at: FUTURE, developed_at: null, original_url: null })]} nowMs={NOW} />);
    const tile = screen.getByRole('button', { name: 'Drops from Ana Lee, develops in 1h' });
    expect(tile).toBeDisabled();
  });

  it('turns a tile ready when its countdown reaches zero', () => {
    const reveal = new Date(NOW + 90_000).toISOString();
    render(<DropsStrip items={[drop('a1', 'ana', { reveal_at: reveal, developed_at: null, original_url: null })]} nowMs={NOW} />);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('button', { name: /develops in 1m/ })).toBeDisabled();
    act(() => {
      jest.setSystemTime(NOW + 91_000);
      jest.advanceTimersByTime(31_000);
    });
    expect(screen.getByRole('button', { name: 'Drops from Ana Lee, ready to develop. Opens them.' })).toBeEnabled();
  });
});

describe('Drop story', () => {
  it('develops a ready drop as it opens, then loads its reactions', async () => {
    render(<DropsStrip items={[drop('a1', 'ana', { developed_at: null, original_url: null, reactions: null })]} nowMs={NOW} />);
    await openStory(/ready to develop/);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/drops/develop')).toBe(true));
    expect(calls.find((c) => c.url === '/api/drops/develop')?.body).toEqual({ drops: [{ kind: 'shared', id: 'a1' }] });
    await waitFor(() => expect(calls.some((c) => c.url === '/api/reactions/shared_drop/a1' && c.method === 'GET')).toBe(true));
  });

  it('plays each person’s drops in order, then carries on to the next person', async () => {
    render(<DropsStrip items={[drop('a2', 'ana'), drop('a1', 'ana'), drop('b1', 'ben')]} nowMs={NOW} />);
    const story = await openStory(/Ana Lee/);
    await loadPhotos();
    expect(within(story).getByRole('list', { name: 'Drop 1 of 2' })).toBeInTheDocument();
    tap(story, 300);
    expect(within(story).getByRole('list', { name: 'Drop 2 of 2' })).toBeInTheDocument();
    // The clock running out at the end of Ana's drops turns to Ben's.
    await loadPhotos();
    const segment = within(story).getByRole('list', { name: 'Drop 2 of 2' }).querySelectorAll('span')[1];
    await act(async () => {
      fireEvent.animationEnd(segment);
    });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Drops from Ben Lee' })).toBeInTheDocument());
  });

  it('goes back with a tap on the left third', async () => {
    render(<DropsStrip items={[drop('a2', 'ana'), drop('a1', 'ana', { developed_at: PAST })]} nowMs={NOW} />);
    const story = await openStory(/Ana Lee/);
    await loadPhotos();
    tap(story, 300);
    expect(within(story).getByRole('list', { name: 'Drop 2 of 2' })).toBeInTheDocument();
    tap(story, -1);
    expect(within(story).getByRole('list', { name: 'Drop 1 of 2' })).toBeInTheDocument();
  });

  it('sends a reply to the poster’s chat, carrying the drop', async () => {
    render(<DropsStrip items={[drop('a1', 'ana')]} nowMs={NOW} />);
    const story = await openStory(/Ana Lee/);
    const field = within(story).getByPlaceholderText('Reply to Ana…');
    fireEvent.change(field, { target: { value: '  love this ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await act(async () => {});
    expect(sendDirectText).toHaveBeenCalledWith({
      connectionId: 'c-ana',
      viewerId: 'me',
      peerId: 'ana',
      content: 'love this',
      metadata: { drop_reply: { kind: 'shared', id: 'a1', reaction: false } },
    });
    expect(field).toHaveValue('');
  });

  it('reacts, and the reaction goes to the poster’s chat too', async () => {
    render(<DropsStrip items={[drop('a1', 'ana')]} nowMs={NOW} />);
    const story = await openStory(/Ana Lee/);
    await loadPhotos();
    fireEvent.click(within(story).getByRole('button', { name: 'React 🔥' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ url: '/api/reactions/shared_drop/a1', body: { emoji: '🔥' } });
    await waitFor(() => expect(sendDirectText).toHaveBeenCalledWith(expect.objectContaining({ content: '🔥', metadata: { drop_reply: { kind: 'shared', id: 'a1', reaction: true } } })));
    expect(within(story).getByRole('button', { name: 'React 🔥' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows who reacted on your own drop instead of the palette', async () => {
    const reactions = { mine: null, is_owner: true, reactions: [{ user_id: 'u2', name: 'Cam Diaz', avatar_url: null, emoji: '😍' }] };
    render(<DropsStrip items={[drop('m1', 'me', { is_mine: true, connection_id: null, reactions })]} nowMs={NOW} />);
    const story = await openStory(/Your drops/);
    expect(within(story).getByRole('list', { name: 'Who reacted' })).toHaveTextContent('Cam');
    expect(within(story).queryByRole('button', { name: 'React 🔥' })).not.toBeInTheDocument();
  });

  it('turns to the next person with a swipe left, and closes with a swipe down', async () => {
    render(<DropsStrip items={[drop('a1', 'ana'), drop('b1', 'ben')]} nowMs={NOW} />);
    const story = await openStory(/Ana Lee/);
    const zone = () => story.querySelector<HTMLElement>('[class*="touch-none"]')!;
    fireEvent.pointerDown(zone(), { clientX: 900, clientY: 100 });
    fireEvent.pointerMove(zone(), { clientX: 700, clientY: 102 });
    fireEvent.pointerMove(zone(), { clientX: 300, clientY: 104 });
    await act(async () => {
      fireEvent.pointerUp(zone(), { clientX: 300, clientY: 104 });
    });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Drops from Ben Lee' })).toBeInTheDocument());

    fireEvent.pointerDown(zone(), { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(zone(), { clientX: 202, clientY: 200 });
    fireEvent.pointerMove(zone(), { clientX: 204, clientY: 320 });
    await act(async () => {
      fireEvent.pointerUp(zone(), { clientX: 204, clientY: 320 });
    });
    await waitFor(() => expect(screen.queryByTestId('drop-story')).not.toBeInTheDocument());
  });

  it('closes on Escape', async () => {
    render(<DropsStrip items={[drop('a1', 'ana')]} nowMs={NOW} />);
    await openStory(/Ana Lee/);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('drop-story')).not.toBeInTheDocument());
  });
});
