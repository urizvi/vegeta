'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDirectusAccounts } from '@/hooks/useDirectusAccounts';

export default function DirectusHydrationBoundary({ children }: { children: React.ReactNode }) {
  const { status, error } = useDirectusAccounts();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'error') {
    throw error ?? new Error('Failed to load accounts from Directus');
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading accounts…
      </div>
    );
  }

  return <>{children}</>;
}
