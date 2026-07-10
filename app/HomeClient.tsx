'use client';

import dynamic from 'next/dynamic';

// Zustand's useSyncExternalStore trips SSR. Load client-only.
// dynamic({ ssr: false }) must live inside a Client Component in Next 16.
const HomeApp = dynamic(() => import('./HomeApp'), { ssr: false });

export default function HomeClient() {
  return <HomeApp />;
}
