import { render, screen, waitFor } from '@testing-library/react';
import MessageBubble from '@/components/chat/MessageBubble';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import type { Message } from '@/lib/chat/types';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer t' }) }));

function message(content: string, reaction: boolean, id = 'm1'): Message {
  return {
    id,
    chat_id: 'c1',
    user_id: 'u-other',
    content,
    time_created: Date.now(),
    time_edited: null,
    is_read: false,
    message_type: 'text',
    metadata: { drop_reply: { kind: 'shared', id: `drop-${id}`, reaction } },
  };
}

function renderBubble(m: Message, isMine = false) {
  return render(
    <ThemeProvider>
      <MessageBubble message={m} isMine={isMine} currentUserId="me" first last onReact={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} />
    </ThemeProvider>,
  );
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('MessageBubble drop replies', () => {
  it('shows the drop over a reply, story-reply style', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ drops: [{ kind: 'shared', id: 'drop-m1', status: 'developed', developed_at: 'x', url: 'https://x/drop.jpg' }] }),
    })) as never;
    const { container } = renderBubble(message('so good', false));
    expect(screen.getByText('Replied to your drop')).toBeInTheDocument();
    expect(screen.getByText('so good')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('img[src="https://x/drop.jpg"]')).not.toBeNull());
  });

  it('pins a reaction’s emoji to the photo instead of a text bubble', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as never;
    renderBubble(message('🔥', true, 'm2'), true);
    expect(screen.getByText('You reacted to their drop')).toBeInTheDocument();
    expect(screen.getByText('🔥').closest('button')).not.toBeNull();
  });

  it('says when the drop is gone', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ drops: [{ kind: 'shared', id: 'drop-m3', status: 'not_found' }] }) })) as never;
    renderBubble(message('hey', false, 'm3'));
    expect(await screen.findByText('Drop no longer available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Replied to your drop/ })).toBeDisabled();
  });
});
