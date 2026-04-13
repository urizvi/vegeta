import type { Metadata } from 'next';
import TerritoryApp from '@/components/territory/TerritoryApp';

export const metadata: Metadata = {
  title: 'Sales Deployment',
  description: 'Manage global sales territory assignments',
};

export default function TerritoryPage() {
  return <TerritoryApp />;
}
