'use client';

import { FormEvent, Suspense, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '@/lib/auth';
import { getMyWorkspaces } from '@/lib/workspace';

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
      const next = searchParams.get('next');
      if (next) {
        router.replace(next);
      } else {
        const ws = await getMyWorkspaces().catch(() => []);
        router.replace(ws.length === 0 ? '/onboarding' : '/territory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative w-full max-w-[420px] rounded-2xl border border-hairline bg-panel/80 p-8 shadow-lg backdrop-blur-xl"
    >
      <div className="mb-7 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-brand to-brand-ink text-white shadow-brand"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
            <path d="M3 12.5V4.2c0-.4.2-.7.6-.9l4-2.1c.3-.1.5-.1.7 0l4 2.1c.4.2.6.5.6.9v8.3l-2-1V5L8 3.4 5 5v8.5l-2-1z" />
          </svg>
        </span>
        <div className="flex flex-col leading-none">
          <span className="display text-[18px] font-semibold tracking-tight text-ink">Vegeta</span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            Sales Deployment
          </span>
        </div>
      </div>

      <h1 className="display text-3xl font-semibold tracking-tight text-ink">
        Welcome back.
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Sign in to continue to your workspace.
      </p>

      <div className="mt-7 space-y-4">
        <div>
          <label htmlFor={emailId} className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.10em] text-ink-muted">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-hairline bg-panel px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-hairline-strong focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor={passwordId} className="block text-[11px] font-medium uppercase tracking-[0.10em] text-ink-muted">
              Password
            </label>
            <a className="text-[11px] font-medium text-brand hover:text-brand-hover" href="#">Forgot?</a>
          </div>
          <input
            id={passwordId}
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-hairline bg-panel px-3 py-2.5 text-sm text-ink outline-none transition-colors hover:border-hairline-strong focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-brand transition-all hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-60"
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Signing in…
          </span>
        ) : (
          <>
            Sign in
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L11 8.75H2.75a.75.75 0 010-1.5H11L8.22 4.03a.75.75 0 010-1.06z" /></svg>
          </>
        )}
      </button>

      <p className="mt-6 text-center text-[11px] text-ink-faint">
        Use your Directus credentials. By signing in you accept our terms.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-px w-[120%] -translate-x-1/2 -translate-y-1/2 -rotate-12 bg-gradient-to-r from-transparent via-hairline-strong to-transparent" />
      </div>

      <aside className="pointer-events-none absolute left-6 top-6 hidden flex-col gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint md:flex">
        <span>Vegeta</span>
        <span className="h-12 w-px bg-hairline-strong" />
        <span>Est. 2026</span>
      </aside>
      <aside className="pointer-events-none absolute right-6 top-6 hidden text-right text-[10px] font-medium uppercase tracking-[0.22em] text-ink-faint md:block">
        <span>Sales Deployment OS</span>
      </aside>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
