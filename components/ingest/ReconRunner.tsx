'use client';

import Link from 'next/link';
import { useWaferiqStore } from '@/store/waferiqStore';

// Small hint that lives on /ingest: signals that recon is available for
// the currently-loaded slices, and points at the /recon dashboard where
// the actual results view lives. Post-P4, the metrics + drill-down UI
// belongs on /recon, so this component intentionally stays terse.
export default function ReconRunner() {
  const posRecords = useWaferiqStore((s) => s.posRecords);
  const claims = useWaferiqStore((s) => s.claims);
  const reconResults = useWaferiqStore((s) => s.reconResults);
  const lastReconAt = useWaferiqStore((s) => s.lastReconAt);

  if (posRecords.length === 0 && claims.length === 0) return null;

  const readyToRun = posRecords.length > 0 && claims.length > 0;

  return (
    <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="font-medium text-[color:var(--ink-strong)]">Reconciliation</div>
          <div className="text-xs text-[color:var(--ink-muted)]">
            {posRecords.length} POS record{posRecords.length === 1 ? '' : 's'} · {claims.length} claim{claims.length === 1 ? '' : 's'}
            {reconResults.length > 0 && ` · ${reconResults.length} result${reconResults.length === 1 ? '' : 's'}`}
            {lastReconAt && ` · last run ${new Date(lastReconAt).toLocaleString()}`}
          </div>
        </div>
        <Link
          href="/recon"
          className={`ml-auto rounded px-3 py-1.5 text-sm font-medium ${
            readyToRun
              ? 'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]'
              : 'border border-[var(--hairline-strong)] text-[color:var(--ink-body)] hover:bg-[var(--surface-sunken)]'
          }`}
        >
          {reconResults.length > 0 ? 'Open dashboard' : readyToRun ? 'Reconcile' : 'View recon'}
        </Link>
      </div>
      {!readyToRun && (
        <p className="mt-2 text-xs text-[color:var(--ink-muted)]">
          Map at least one POS dataset and one claim dataset above to enable reconciliation.
        </p>
      )}
    </section>
  );
}
