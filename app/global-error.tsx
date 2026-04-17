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
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold">The app crashed</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {error.message || 'A fatal error occurred in the root layout.'}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-[10px] text-zinc-400">ref: {error.digest}</p>
            )}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => unstable_retry()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
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
