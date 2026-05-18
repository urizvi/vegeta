'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';
import ModuleGate from '@/components/ModuleGate';

const TeamsAdminView = dynamic(
  () => import('@/components/teams/TeamsAdminView'),
  { ssr: false },
);

export default function TeamsClient() {
  return (
    <ModuleGate moduleKey="territory">
      <DirectusHydrationBoundary>
        <TeamsAdminView />
      </DirectusHydrationBoundary>
    </ModuleGate>
  );
}
