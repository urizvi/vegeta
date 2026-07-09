import type { Metadata } from 'next';
import ReconClient from './ReconClient';

export const metadata: Metadata = {
  title: 'Recon — WaferIQ',
  description: 'Reconciliation dashboard — matched vs flagged POS ↔ claim results with drill-down and export.',
};

export default function ReconPage() {
  return <ReconClient />;
}
