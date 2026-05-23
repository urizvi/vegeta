'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';
import ModuleGate from '@/components/ModuleGate';

const TasksApp = dynamic(() => import('@/components/tasks/TasksApp'), { ssr: false });

export default function TasksClient() {
  return (
    <ModuleGate moduleKey="tasks">
      <DirectusHydrationBoundary>
        <TasksApp />
      </DirectusHydrationBoundary>
    </ModuleGate>
  );
}
