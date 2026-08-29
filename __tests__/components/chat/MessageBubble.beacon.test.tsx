import { render, screen } from '@testing-library/react';
import MessageBubble from '@/components/chat/MessageBubble';
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import type { Message } from '@/lib/chat/types';

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    chat_id: 'c1',
    user_id: 'u-other',
    content: 'Beacon: Testing',
    time_created: Date.now(),
    time_edited: null,
    is_read: false,
    message_type: 'beacon',
    metadata: { beacon_id: 'b1', title: 'Testing', beacon_type: 'event' },
    ...overrides,
  };
}

describe('MessageBubble beacon messages', () => {
  it('renders a beacon card instead of plaintext', () => {
    render(
      <ThemeProvider>
        <MessageBubble
          message={message()}
          isMine={false}
          currentUserId="me"
          onReact={jest.fn()}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('beacon-chat-card')).toBeInTheDocument();
    expect(screen.queryByText('Beacon: Testing')).not.toBeInTheDocument();
  });
});
