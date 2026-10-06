import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { HubThread } from '@/components/clicks/HubThread';
import { hubRequest, freshHubLocation } from '@/lib/hub/client';
import { resolveWebHubE2eeV2Session, encryptWebE2eeV2Message } from '@/lib/chat/e2eeV2Client';
import type { HubThreadMessage } from '@/lib/hub/hubThread';

jest.mock('@/lib/hub/client', () => ({ hubRequest: jest.fn(), freshHubLocation: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => null }));
jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/components/dashboard/HubAttachment', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/chat/e2eeV2Client', () => ({
  resolveWebHubE2eeV2Session: jest.fn(),
  encryptWebE2eeV2Message: jest.fn(),
  decryptWebE2eeV2Message: jest.fn(),
}));

const message: HubThreadMessage = {
  id: '00000000-0000-4000-8000-000000000001',
  hub_id: 'hub',
  user_id: 'me',
  body: 'Hello everyone',
  created_at: '2026-09-26T12:00:00.123456+00:00',
  edited_at: null,
  message_type: 'text',
  metadata: {},
};
let messages: HubThreadMessage[];
let reactions: { id: string; hub_message_id: string; user_id: string; reaction_type: string }[];
let event: boolean;

beforeEach(() => {
  jest.resetAllMocks();
  messages = [message];
  reactions = [];
  event = true;
  jest.mocked(resolveWebHubE2eeV2Session).mockResolvedValue(null);
  jest.mocked(hubRequest).mockImplementation(async (path, body, method) => {
    if (path === '/api/hub/hub') return { hub: { id: 'hub', name: 'Community', category: 'general', event_beacon_id: event ? 'event' : null } } as never;
    if (path.startsWith('/api/hub/messages?')) {
      return { messages: path.includes('before=') ? [] : messages, reactions, participant_ids: [], occupant_count: 3, sender_profiles_visible: true } as never;
    }
    if (path === '/api/users/display-names') return { names: { me: 'You', peer: 'Sam' } } as never;
    if (method === 'PATCH') messages = [{ ...message, body: (body as { body: string }).body }];
    if (method === 'DELETE' && path.startsWith('/api/hub/messages/')) messages = [];
    return {} as never;
  });
});

function mount() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <HubThread hubId="hub" userId="me" onBack={jest.fn()} />
    </SWRConfig>,
  );
}

test('searches locally and links only visible sender profiles', async () => {
  messages.push({ ...message, id: 'peer-message', user_id: 'peer', body: 'Coffee tomorrow' });
  mount();
  await screen.findByText('Coffee tomorrow');
  expect(await screen.findByRole('link', { name: 'Sam' })).toHaveAttribute('href', '/people/peer');
  fireEvent.click(screen.getByRole('button', { name: 'Search this hub' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'coffee' } });
  expect(screen.queryByText('Hello everyone')).not.toBeInTheDocument();
  expect(jest.mocked(hubRequest).mock.calls.some(([path]) => path.includes('coffee'))).toBe(false);
});

test('event edits encrypt the new body without requesting location', async () => {
  mount();
  await screen.findByText('Hello everyone');
  await screen.findByText('Community');
  jest.mocked(resolveWebHubE2eeV2Session).mockResolvedValue({ epochKeys: new Map() } as never);
  jest.mocked(encryptWebE2eeV2Message).mockResolvedValue({ wireContent: 'e2e2:updated', metadata: { epoch: 1 } } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Message Community' }), { target: { value: 'Updated' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));
  await waitFor(() =>
    expect(hubRequest).toHaveBeenCalledWith(`/api/hub/messages/${message.id}`, { hub_id: 'hub', body: 'e2e2:updated', metadata: { epoch: 1 } }, 'PATCH'),
  );
  expect(freshHubLocation).not.toHaveBeenCalled();
});

test('requires confirmation and fresh location before deleting', async () => {
  event = false;
  jest.mocked(freshHubLocation).mockRejectedValue(new Error('Location unavailable'));
  mount();
  await screen.findByText('Hello everyone');
  await screen.findByText('Community');
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(freshHubLocation).not.toHaveBeenCalled();
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
  await screen.findByText('Location unavailable');
  expect(jest.mocked(hubRequest).mock.calls.some(([, , method]) => method === 'DELETE')).toBe(false);
  expect(screen.getByText('Hello everyone')).toBeInTheDocument();
});

test('removes the current user’s existing reaction', async () => {
  reactions = [{ id: 'r', hub_message_id: message.id, user_id: 'me', reaction_type: '👍' }];
  mount();
  await screen.findByText('Hello everyone');
  await screen.findByText('Community');
  const reaction = screen.getByRole('button', { name: '👍 1' });
  expect(reaction).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(reaction);
  await waitFor(() =>
    expect(hubRequest).toHaveBeenCalledWith('/api/hub/reactions', { hub_id: 'hub', message_id: message.id, reaction_type: '👍' }, 'DELETE'),
  );
});

test('loads older history with the exact timestamp and row id', async () => {
  messages = Array.from({ length: 120 }, (_, index) => ({
    ...message,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    body: `Message ${index}`,
  }));
  mount();
  await screen.findByText('Message 0');
  fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));
  await waitFor(() =>
    expect(
      jest.mocked(hubRequest).mock.calls.some(([path]) => path.includes(`before=${encodeURIComponent(message.created_at)}&beforeId=${message.id}`)),
    ).toBe(true),
  );
  expect(within(screen.getByRole('list', { name: 'Hub messages' })).getAllByRole('listitem')).toHaveLength(120);
});
