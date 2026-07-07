'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';
import ModuleGate from '@/components/ModuleGate';

// Skip SSR entirely — TerritoryApp uses Zustand (useSyncExternalStore) which
// triggers "getServerSnapshot should be cached" during pre-rendering.
const TerritoryApp = dynamic(
  () => import('@/legacy/components/territory/TerritoryApp'),
  { ssr: false },
);

export default function TerritoryClient() {
  return (
    <ModuleGate moduleKey="territory">
      <DirectusHydrationBoundary>
        <TerritoryApp />
      </DirectusHydrationBoundary>
    </ModuleGate>
  );
}
