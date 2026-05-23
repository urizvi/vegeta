'use client';

import dynamic from 'next/dynamic';

const OnboardingFlow = dynamic(() => import('@/components/onboarding/OnboardingFlow'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Loading…
    </div>
  ),
});

export default function OnboardingClient() {
  return <OnboardingFlow />;
}
