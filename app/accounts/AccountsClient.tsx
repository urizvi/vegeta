'use client';

import dynamic from 'next/dynamic';

const AccountsApp = dynamic(
  () => import('@/components/accounts/AccountsApp'),
  { ssr: false },
);

export default function AccountsClient() {
  return <AccountsApp />;
}
