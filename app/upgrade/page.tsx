import { Suspense } from 'react';
import type { Metadata } from 'next';
import UpgradeClient from './UpgradeClient';

export const metadata: Metadata = { title: 'Upgrade' };

export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <UpgradeClient />
    </Suspense>
  );
}
