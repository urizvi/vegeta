'use client';

import { useState } from 'react';

interface Props {
  /** Fired when the user picks "Load sample data". Fetches the CSVs and
   *  drives them through the normal import path. */
  onLoadSample: () => Promise<void> | void;
}

export default function OnboardingCard({ onLoadSample }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSample() {
    setBusy(true);
    setError(null);
    try {
      await onLoadSample();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample data.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--brand-soft)] bg-[var(--brand-soft)]/40 p-5">
      <h2 className="text-base font-medium text-[color:var(--ink-strong)]">
        Get started
      </h2>
      <ol className="mt-3 space-y-2 text-sm text-[color:var(--ink-body)]">
        <li>
          <span className="mr-2 font-mono text-xs text-[color:var(--brand-ink)]">1.</span>
          Drop a distributor POS report (CSV or XLSX) below.
        </li>
        <li>
          <span className="mr-2 font-mono text-xs text-[color:var(--brand-ink)]">2.</span>
          Review the inferred columns, fix anything that&apos;s wrong, save.
        </li>
        <li>
          <span className="mr-2 font-mono text-xs text-[color:var(--brand-ink)]">3.</span>
          Repeat for your ship-and-debit and price-protection claims files.
        </li>
        <li>
          <span className="mr-2 font-mono text-xs text-[color:var(--brand-ink)]">4.</span>
          Expand each dataset and hit &ldquo;Map to POS-recon&rdquo; — the column
          suggestions should be mostly right.
        </li>
        <li>
          <span className="mr-2 font-mono text-xs text-[color:var(--brand-ink)]">5.</span>
          Head to <span className="font-mono">/recon</span> and run reconciliation.
        </li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSample}
          disabled={busy}
          className={`rounded bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)] ${busy ? 'cursor-wait opacity-60' : ''}`}
        >
          {busy ? 'Loading…' : 'Load sample data'}
        </button>
        <span className="text-xs text-[color:var(--ink-muted)]">
          Adds three demo datasets (POS + S&amp;D + PP) so you can walk the flow without your own files.
        </span>
      </div>
      {error && (
        <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}
    </section>
  );
}
