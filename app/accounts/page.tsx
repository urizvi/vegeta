import type { Metadata } from 'next';
import AccountsClient from './AccountsClient';

export const metadata: Metadata = {
  title: 'Accounts | Sales Deployment',
  description: 'Manage your account list, classify by stage and segment, and assign sales reps.',
};

export default function AccountsPage() {
  return <AccountsClient />;
}
