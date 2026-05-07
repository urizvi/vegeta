'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';

const TasksApp = dynamic(
  () => import('@/components/tasks/TasksApp'),
  { ssr: false },
);

export default function TasksClient() {
  return (
    <DirectusHydrationBoundary>
      <TasksApp />
    </DirectusHydrationBoundary>
  );
}
