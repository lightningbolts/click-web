import { Suspense } from 'react';
import { BusinessSignupFlow } from './BusinessSignupFlow';

function SignupFallback() {
  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center text-zinc-400 text-sm">
      Loading…
    </div>
  );
}

export default function BusinessSignupPage() {
  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <Suspense fallback={<SignupFallback />}>
        <BusinessSignupFlow />
      </Suspense>
    </div>
  );
}
