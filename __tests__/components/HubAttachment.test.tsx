import { act, render, screen } from '@testing-library/react';
import HubAttachment from '@/components/dashboard/HubAttachment';
import type { HubThreadMessage } from '@/lib/hub/hubThread';

test('a disposable photo stays hidden until its scheduled reveal without a network refresh', () => {
  jest.useFakeTimers();
  try {
    const message: HubThreadMessage = {
      id: 'photo', hub_id: 'hub', user_id: 'sender', body: 'Photo', message_type: 'image',
      created_at: new Date().toISOString(), edited_at: null,
      metadata: { disposable_roll: true, collaboration_ttl: new Date(Date.now() + 2000).toISOString() },
    };
    render(<HubAttachment message={message} participantIds={[]} name="Photo" />);
    expect(screen.queryByRole('button', { name: 'Open attachment' })).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Open attachment' })).toBeInTheDocument();
  } finally { jest.useRealTimers(); }
});
