'use client';

import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[app/global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-sm font-semibold">The app crashed</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {error.message || 'A fatal error occurred in the root layout.'}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-[10px] text-slate-400">ref: {error.digest}</p>
            )}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => unstable_retry()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
