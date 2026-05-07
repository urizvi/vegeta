import type { Metadata } from 'next';
import TeamsClient from './TeamsClient';

export const metadata: Metadata = {
  title: 'Teams | Sales Deployment',
  description: 'Create and manage sales teams and their members.',
};

export default function TeamsPage() {
  return <TeamsClient />;
}
