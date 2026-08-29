import { render, screen } from '@testing-library/react';
import BeaconChatCard from '@/components/chat/BeaconChatCard';
import type { Message } from '@/lib/chat/types';

function beaconMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    chat_id: 'c1',
    user_id: 'u1',
    content: 'Beacon: Testing',
    time_created: 1,
    time_edited: null,
    is_read: false,
    message_type: 'beacon',
    metadata: {
      beacon_id: 'beacon-1',
      title: 'Testing',
      beacon_type: 'event',
      location_name: 'Park-N-Ride',
    },
    ...overrides,
  };
}

describe('BeaconChatCard', () => {
  it('renders a card with the beacon title, not plaintext Beacon: prefix', () => {
    render(<BeaconChatCard message={beaconMessage()} />);
    expect(screen.getByTestId('beacon-chat-card')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.queryByText('Beacon: Testing')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/e/beacon-1');
  });

  it('still renders a card when title metadata is missing', () => {
    render(
      <BeaconChatCard
        message={beaconMessage({
          metadata: { beacon_id: 'beacon-2' },
          content: 'Beacon: Testing',
        })}
      />,
    );
    expect(screen.getByTestId('beacon-chat-card')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
  });
});
