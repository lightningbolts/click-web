import { Suspense } from 'react';
import { BusinessSignupFlow } from './BusinessSignupFlow';

function SignupFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-on-surface-variant text-sm">
      Loading…
    </div>
  );
}

export default function BusinessSignupPage() {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <Suspense fallback={<SignupFallback />}>
        <BusinessSignupFlow />
      </Suspense>
    </div>
  );
}
