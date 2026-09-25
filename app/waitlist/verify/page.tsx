import type { Metadata } from 'next';
import VerifyWaitlistEmail from '@/components/marketing/VerifyWaitlistEmail';

export const metadata: Metadata = {
  title: 'Confirm your email | Click',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function WaitlistVerificationPage() {
  return <VerifyWaitlistEmail />;
}
