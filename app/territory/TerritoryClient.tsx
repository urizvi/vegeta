'use client';

import dynamic from 'next/dynamic';

// Skip SSR entirely — TerritoryApp uses Zustand (useSyncExternalStore) which
// triggers "getServerSnapshot should be cached" during pre-rendering.
const TerritoryApp = dynamic(
  () => import('@/components/territory/TerritoryApp'),
  { ssr: false },
);

export default function TerritoryClient() {
  return <TerritoryApp />;
}
