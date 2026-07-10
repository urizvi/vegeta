import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  title: 'WaferIQ — Reconcile distributor sell-through',
  description: 'Reconcile POS reports against ship-and-debit and price-protection claims. Missed credits, orphan claims, quantity + price discrepancies, with dollar impact.',
};

export default function Home() {
  return <HomeClient />;
}
