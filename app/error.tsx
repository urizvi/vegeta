'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zM8 5.25a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0V6A.75.75 0 018 5.25zM9.75 11a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Something went wrong
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {error.message || 'An unexpected error occurred while rendering this page.'}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-[10px] text-slate-400">ref: {error.digest}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={() => window.location.assign('/')}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Go home
          </button>
          <button
            onClick={() => unstable_retry()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
