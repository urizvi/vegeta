import type { Metadata } from 'next';
import AccountDetailClient from './AccountDetailClient';

export const metadata: Metadata = {
  title: 'Account detail',
};

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AccountDetailClient accountId={id} />;
}
