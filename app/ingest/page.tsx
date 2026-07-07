import type { Metadata } from 'next';
import IngestClient from './IngestClient';

export const metadata: Metadata = {
  title: 'Ingest — WaferIQ',
  description: 'Drop a CSV or XLSX and normalize columns into a validated dataset.',
};

export default function IngestPage() {
  return <IngestClient />;
}
