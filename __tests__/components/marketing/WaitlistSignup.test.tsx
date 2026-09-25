import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WaitlistModal from '@/components/marketing/WaitlistModal';
import ConnectPage from '@/app/connect/[userId]/page';
import { invalidWaitlistEmails } from '../../helpers/waitlistEmails';

const referrerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
jest.mock('next/navigation', () => ({
  useParams: () => ({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/lib/config', () => ({ APP_CONFIG: { app_launched: false } }));

const originalFetch = global.fetch;
const mockSignup = jest.fn();

beforeEach(() => {
  mockSignup.mockReset().mockResolvedValue({ json: async () => ({ success: true, verificationRequired: true, message: 'Check your inbox for a confirmation link. Your place is confirmed only after you verify your email.' }) });
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/qr') return Promise.resolve({ ok: true, json: async () => ({ success: true }) } as Response);
    return mockSignup(url, options);
  });
});
afterAll(() => { global.fetch = originalFetch; });

describe.each(['homepage_hero', 'enterprise_landing', 'deep_link'] as const)('%s waitlist signup', (source) => {
  async function showForm() {
    const user = userEvent.setup();
    if (source === 'deep_link') render(<ConnectPage />);
    else render(<WaitlistModal open onClose={jest.fn()} source={source} />);
    // Flush the referral page's user lookup before interacting with the form.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument());
    return user;
  }

  // type="email" inputs strip newlines before React receives their value;
  // raw newline injection is covered by the schema and API tests instead.
  it.each(invalidWaitlistEmails.filter((email) => !email.includes('\n')))('shows an inline error without sending %p', async (email) => {
    const user = await showForm();
    const input = screen.getByRole('textbox', { name: 'Email' });
    fireEvent.change(input, { target: { value: email } });
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email address.');
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('lets a user correct an invalid address and submit with Enter', async () => {
    const user = await showForm();
    const input = screen.getByRole('textbox', { name: 'Email' });
    fireEvent.change(input, { target: { value: 'ada@example' } });
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '  Ada.Lovelace+click@students.example.co.uk  ' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
    await user.click(input);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument());
    expect(mockSignup).toHaveBeenCalledTimes(1);
    expect(mockSignup).toHaveBeenCalledWith('/api/waitlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'Ada.Lovelace+click@students.example.co.uk', source,
        ...(source === 'deep_link' ? { referrer_user_id: referrerId } : {}),
      }),
    });
  });

  it('accepts terajzhang@gmail.com after rejecting made-up-invalid-email', async () => {
    const user = await showForm();
    const input = screen.getByRole('textbox', { name: 'Email' });
    await user.type(input, 'made-up-invalid-email');
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(mockSignup).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'terajzhang@gmail.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument());
    expect(mockSignup).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockSignup.mock.calls[0][1].body)).toEqual({
      email: 'terajzhang@gmail.com', source,
      ...(source === 'deep_link' ? { referrer_user_id: referrerId } : {}),
    });
  });

  it.each(['network', 'server'])('allows retry after a %s failure', async (failure) => {
    const user = await showForm();
    if (failure === 'network') mockSignup.mockRejectedValueOnce(new Error('offline'));
    else mockSignup.mockResolvedValueOnce({ json: async () => ({ error: 'Waitlist is temporarily unavailable' }) });
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'ada@example.com' } });
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'network' ? 'Network error. Please try again.' : 'Waitlist is temporarily unavailable');
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument());
    expect(mockSignup).toHaveBeenCalledTimes(2);
  });

  it('prevents resubmission while the request is pending', async () => {
    const user = await showForm();
    let finish!: (value: unknown) => void;
    mockSignup.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const input = screen.getByRole('textbox', { name: 'Email' });
    fireEvent.change(input, { target: { value: 'ada@example.com' } });
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    expect(screen.getByRole('button', { name: /Joining/ })).toBeDisabled();
    fireEvent.submit(input.closest('form')!);
    expect(mockSignup).toHaveBeenCalledTimes(1);
    finish({ json: async () => ({ success: true, message: "You're already on the waitlist!" }) });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument());
  });

  it('shows pending confirmation and allows correcting the address or requesting another link', async () => {
    const user = await showForm();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'terajzhang@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    expect(await screen.findByText(/Your place is confirmed only after you verify your email/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try another email or resend' }));
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('terajzhang@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Join the Waitlist' }));
    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(2));
  });
});
