import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityRow } from '@/components/activity/ActivityRow';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({}) }));
const toastSuccess = jest.fn();
jest.mock('@/components/ds/Toast', () => ({ toast: { success: (m: string) => toastSuccess(m), error: jest.fn() } }));

const item = {
  id: 'a1',
  type: 'prior_connection_request',
  title: 'Sam wants to Click',
  body: 'You met in college',
  data: { connection_id: 'c1' },
  created_at: '2026-10-08T17:00:00Z',
  actor: { id: 'u1', name: 'Sam', avatar_url: null },
};

describe('ActivityRow (spec §7.9)', () => {
  it('links the row and answers a pending request inline', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(
      <ul>
        <ActivityRow item={item} nowMs={Date.parse('2026-10-08T18:00:00Z')} pendingRequestId="c1" isNew />
      </ul>,
    );
    expect(screen.getByRole('link', { name: /Sam wants to Click/ })).toHaveAttribute('href', '/clicks/c/c1');
    expect(screen.getByLabelText('New')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Request accepted'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ connection_id: 'c1', action: 'accept' });
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  it('shows no actions when nothing is pending', () => {
    render(
      <ul>
        <ActivityRow item={{ ...item, type: 'wave' }} nowMs={Date.now()} />
      </ul>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
