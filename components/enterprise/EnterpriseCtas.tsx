import { Button } from '@/components/ds/Button';
import { APP_CONFIG } from '@/lib/config';

/** "Set up your Place" (free, self-serve) and "Talk to us" (spec §8.2). */
export default function EnterpriseCtas() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Button href="/business/get-started" variant="primary" size="lg" data-testid="enterprise-get-started">
        Set up your Place
      </Button>
      <Button
        href={`mailto:${APP_CONFIG.business_contact_email}?subject=${encodeURIComponent('Click for Business')}`}
        variant="secondary"
        size="lg"
      >
        Talk to us
      </Button>
    </div>
  );
}
