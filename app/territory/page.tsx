import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { isLegacyTerritoryEnabled } from '@/lib/legacyFlags';

export const metadata: Metadata = {
  title: 'Sales Deployment (legacy)',
  description: 'Territory-planning UI parked behind NEXT_PUBLIC_LEGACY_TERRITORY_ENABLED post-WaferIQ pivot.',
};

const LegacyTerritoryClient = dynamic(
  () => import('@/legacy/app/TerritoryClient'),
);

export default function TerritoryPage() {
  if (!isLegacyTerritoryEnabled()) notFound();
  return <LegacyTerritoryClient />;
}
