'use client';

import { FormEvent, Suspense, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '@/lib/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      const next = searchParams.get('next') || '/territory';
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h1 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Sign in</h1>
      <p className="mb-5 text-sm text-zinc-500">Use your Directus credentials.</p>

      <label htmlFor={emailId} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Email
      </label>
      <input
        id={emailId}
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />

      <label htmlFor={passwordId} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Password
      </label>
      <input
        id={passwordId}
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />

      {error && (
        <p role="alert" className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
