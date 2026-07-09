'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useWaferiqStore } from '@/store/waferiqStore';
import { reconcile } from '@/domain/pos-recon/engine';
import {
  emptyFilters,
  filterResults,
  indexById,
  summarize,
  type ReconFilters,
} from '@/lib/reconView';
import SummaryHeader from '@/components/recon/SummaryHeader';
import StatusBar from '@/components/recon/StatusBar';
import FiltersBar from '@/components/recon/FiltersBar';
import ResultsTable from '@/components/recon/ResultsTable';
import ExportButtons from '@/components/recon/ExportButtons';
import HealthPanel from '@/components/HealthPanel';

export default function ReconApp() {
  const posRecords = useWaferiqStore((s) => s.posRecords);
  const claims = useWaferiqStore((s) => s.claims);
  const reconResults = useWaferiqStore((s) => s.reconResults);
  const lastReconAt = useWaferiqStore((s) => s.lastReconAt);
  const setReconResults = useWaferiqStore((s) => s.setReconResults);
  const recordVisit = useWaferiqStore((s) => s.recordVisit);
  const recordReconRun = useWaferiqStore((s) => s.recordReconRun);

  useEffect(() => { recordVisit(); }, [recordVisit]);

  const [filters, setFilters] = useState<ReconFilters>(emptyFilters);

  const posById = useMemo(() => indexById(posRecords), [posRecords]);
  const claimsById = useMemo(() => indexById(claims), [claims]);
  const summary = useMemo(() => summarize(reconResults), [reconResults]);
  const filtered = useMemo(
    () => filterResults(reconResults, filters, posById),
    [reconResults, filters, posById],
  );

  const readyToRun = posRecords.length > 0 && claims.length > 0;
  const noRunYet = reconResults.length === 0;

  function run() {
    setReconResults(reconcile(posRecords, claims));
    recordReconRun();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[color:var(--ink-strong)]">Reconciliation</h1>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            {posRecords.length} POS record{posRecords.length === 1 ? '' : 's'} · {claims.length} claim{claims.length === 1 ? '' : 's'} loaded.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={run}
            disabled={!readyToRun}
            className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
              readyToRun ? 'bg-[var(--brand)] hover:bg-[var(--brand-hover)]' : 'bg-[color:var(--ink-faint)] cursor-not-allowed'
            }`}
          >
            {noRunYet ? 'Run reconciliation' : 'Re-run reconciliation'}
          </button>
          <ExportButtons results={filtered} posById={posById} claimsById={claimsById} />
        </div>
      </header>

      {!readyToRun && noRunYet ? (
        <EmptyState />
      ) : noRunYet ? (
        <div className="rounded-lg border border-dashed border-[var(--hairline-strong)] p-8 text-center text-sm text-[color:var(--ink-muted)]">
          Ready to reconcile. Hit “Run reconciliation” above.
        </div>
      ) : (
        <>
          <SummaryHeader summary={summary} lastReconAt={lastReconAt} />
          <StatusBar summary={summary} />
          <FiltersBar filters={filters} onChange={setFilters} />
          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-[color:var(--ink-muted)]">
              Showing {filtered.length} of {reconResults.length}
            </div>
            <ResultsTable results={filtered} posById={posById} claimsById={claimsById} />
          </div>
        </>
      )}

      <HealthPanel />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--hairline-strong)] p-10 text-center text-sm text-[color:var(--ink-muted)]">
      <p className="mb-2 font-medium text-[color:var(--ink-strong)]">Nothing to reconcile yet.</p>
      <p>
        Go to{' '}
        <Link href="/ingest" className="text-[color:var(--brand)] underline">
          /ingest
        </Link>{' '}
        to upload a POS report and at least one claims file, then map them into POS records + claims.
      </p>
    </div>
  );
}
