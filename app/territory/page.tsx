import type { Metadata } from 'next';
import TerritoryClient from './TerritoryClient';

export const metadata: Metadata = {
  title: 'Sales Deployment',
  description: 'Manage global sales territory assignments',
};

export default function TerritoryPage() {
  return <TerritoryClient />;
}
