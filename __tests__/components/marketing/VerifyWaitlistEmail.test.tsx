import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyWaitlistEmail from '@/components/marketing/VerifyWaitlistEmail';

const originalFetch = global.fetch;
const mockVerify = jest.fn();
const token = 'a'.repeat(64);
beforeEach(() => {
  window.history.replaceState(null, '', `/waitlist/verify#token=${token}`);
  mockVerify.mockReset().mockResolvedValue({ ok: true, json: async () => ({ success: true, verified: true }) });
  global.fetch = mockVerify;
});
afterAll(() => { global.fetch = originalFetch; });

it('does not auto-confirm a prefetched link; explicitly confirms once clicked, including in StrictMode', async () => {
  const user = userEvent.setup();
  render(<StrictMode><VerifyWaitlistEmail /></StrictMode>);
  const button = await screen.findByRole('button', { name: 'Confirm email' });
  expect(mockVerify).not.toHaveBeenCalled();
  expect(window.location.hash).toBe('');
  await user.click(button);
  expect(await screen.findByRole('status')).toHaveTextContent('Your email is verified');
  expect(mockVerify).toHaveBeenCalledTimes(1);
  expect(mockVerify).toHaveBeenCalledWith('/api/waitlist/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
});

it.each(['', '#token=garbage'])('does not submit a missing or malformed token %p', async (hash) => {
  window.history.replaceState(null, '', `/waitlist/verify${hash}`);
  render(<VerifyWaitlistEmail />);
  expect(await screen.findByRole('alert')).toHaveTextContent('missing or invalid');
  expect(screen.queryByRole('button', { name: 'Confirm email' })).not.toBeInTheDocument();
  expect(mockVerify).not.toHaveBeenCalled();
});

it('shows expired/replayed links as invalid and offers a way back to signup', async () => {
  const user = userEvent.setup();
  mockVerify.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'This link has expired or has already been used.' }) });
  render(<VerifyWaitlistEmail />);
  await user.click(await screen.findByRole('button', { name: 'Confirm email' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('expired or has already been used');
  expect(screen.queryByRole('button', { name: 'Confirm email' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Click' })).toHaveAttribute('href', '/');
});

it('can retry a temporary failure with the same token', async () => {
  const user = userEvent.setup();
  mockVerify.mockRejectedValueOnce(new Error('offline'));
  render(<VerifyWaitlistEmail />);
  await user.click(await screen.findByRole('button', { name: 'Confirm email' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
  await user.click(screen.getByRole('button', { name: 'Confirm email' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Your email is verified');
  expect(mockVerify).toHaveBeenCalledTimes(2);
});

it('disables confirmation while waiting for the response', async () => {
  const user = userEvent.setup();
  let finish!: (value: unknown) => void;
  mockVerify.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  render(<VerifyWaitlistEmail />);
  await user.click(await screen.findByRole('button', { name: 'Confirm email' }));
  expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
  finish({ ok: true, json: async () => ({ verified: true }) });
  await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
});
