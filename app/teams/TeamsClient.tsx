'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';

const TeamsAdminView = dynamic(
  () => import('@/components/teams/TeamsAdminView'),
  { ssr: false },
);

export default function TeamsClient() {
  return (
    <DirectusHydrationBoundary>
      <TeamsAdminView />
    </DirectusHydrationBoundary>
  );
}
