'use client';

import dynamic from 'next/dynamic';

// Zustand's useSyncExternalStore trips the "getServerSnapshot should be
// cached" warning during pre-render. Load the app client-only. The
// dynamic() call must live inside a Client Component in Next 16.
const IngestApp = dynamic(() => import('./IngestApp'), { ssr: false });

export default function IngestClient() {
  return <IngestApp />;
}
