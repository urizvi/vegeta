import type { Metadata } from 'next';
import AccountsClient from './AccountsClient';

export const metadata: Metadata = {
  title: 'Accounts',
  description: 'Manage your records, classify by stage and segment, and assign owners.',
};

export default function AccountsPage() {
  return <AccountsClient />;
}
