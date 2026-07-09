'use client';

import dynamic from 'next/dynamic';

// Zustand's useSyncExternalStore trips SSR; load the app client-only.
// dynamic({ ssr: false }) must live inside a Client Component in Next 16.
const ReconApp = dynamic(() => import('./ReconApp'), { ssr: false });

export default function ReconClient() {
  return <ReconApp />;
}
