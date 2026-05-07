import type { Metadata } from 'next';
import TasksClient from './TasksClient';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'All tasks across accounts.',
};

export default function TasksPage() {
  return <TasksClient />;
}
