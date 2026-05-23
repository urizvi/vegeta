'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';

const AccountDetail = dynamic(
  () => import('@/components/accounts/detail/AccountDetail'),
  { ssr: false },
);

export default function AccountDetailClient({ accountId }: { accountId: string }) {
  return (
    <DirectusHydrationBoundary>
      <AccountDetail accountId={accountId} />
    </DirectusHydrationBoundary>
  );
}
