import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WaitlistModal from '@/components/marketing/WaitlistModal';

jest.mock('framer-motion', () => {
  const React = require('react');
  const Forward = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, { ...props, ref }),
    );
  return {
    motion: new Proxy({}, { get: (_target: unknown, prop: string) => Forward(prop) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

describe('WaitlistModal', () => {
  it('exposes a labelled email form and keeps the value after overlay dismiss', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const { rerender } = render(<WaitlistModal open onClose={onClose} source="homepage_hero" />);

    expect(screen.getByText(/We'll email you when the iOS and Android app opens/)).toBeInTheDocument();
    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'ada@example.com' } });
    expect(email).toHaveValue('ada@example.com');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();

    rerender(<WaitlistModal open={false} onClose={onClose} source="homepage_hero" />);
    rerender(<WaitlistModal open onClose={onClose} source="homepage_hero" />);
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
  });
});
