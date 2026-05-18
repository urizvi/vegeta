'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const COPY: Record<string, { title: string; blurb: string }> = {
  tasks: { title: 'Tasks', blurb: 'Track follow-ups and to-dos across your accounts.' },
  territory: { title: 'Territory & Team', blurb: 'Map-based territory design and team management.' },
};

export default function UpgradeClient() {
  const moduleKey = useSearchParams().get('module') ?? '';
  const c = COPY[moduleKey] ?? { title: 'This module', blurb: 'This module is not part of your plan.' };
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-[family-name:var(--font-fraunces)] text-2xl">{c.title} is not in your plan</h1>
      <p className="text-sm text-slate-500">{c.blurb}</p>
      <p className="text-sm text-slate-500">Contact your administrator to add it.</p>
      <Link href="/accounts" className="text-sm text-indigo-600 hover:underline">Back to Accounts</Link>
    </main>
  );
}
