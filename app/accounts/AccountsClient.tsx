'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';

const AccountsApp = dynamic(
  () => import('@/components/accounts/AccountsApp'),
  { ssr: false },
);

export default function AccountsClient() {
  return (
    <DirectusHydrationBoundary>
      <AccountsApp />
    </DirectusHydrationBoundary>
  );
}
