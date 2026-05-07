'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';

const WorkspaceSettingsForm = dynamic(
  () => import('@/components/settings/WorkspaceSettingsForm'),
  { ssr: false },
);

export default function SettingsWorkspaceClient() {
  return (
    <DirectusHydrationBoundary>
      <WorkspaceSettingsForm />
    </DirectusHydrationBoundary>
  );
}
