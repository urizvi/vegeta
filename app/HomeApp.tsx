'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useWaferiqStore } from '@/store/waferiqStore';
import { loadSampleData } from '@/lib/loadSampleData';
import HealthPanel from '@/components/HealthPanel';

/**
 * Home is a state-aware landing. Same page for first-time and returning
 * users, with the CTA shifting based on what's in the store:
 *   - empty        → "Get started" + "Load sample data"
 *   - has data     → snapshot + "Go to /ingest" or "Go to /recon" depending
 *                    on how far along they are
 *   - has recon    → "Open dashboard" jumps straight to /recon
 */
export default function HomeApp() {
  const datasets = useWaferiqStore((s) => s.datasets);
  const posRecords = useWaferiqStore((s) => s.posRecords);
  const claims = useWaferiqStore((s) => s.claims);
  const reconResults = useWaferiqStore((s) => s.reconResults);
  const lastReconAt = useWaferiqStore((s) => s.lastReconAt);
  const commitDataset = useWaferiqStore((s) => s.commitDataset);
  const recordVisit = useWaferiqStore((s) => s.recordVisit);
  const recordDatasetImport = useWaferiqStore((s) => s.recordDatasetImport);

  useEffect(() => { recordVisit(); }, [recordVisit]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage = useMemo<Stage>(() => classify({
    datasets: datasets.length,
    posRecords: posRecords.length,
    claims: claims.length,
    results: reconResults.length,
  }), [datasets.length, posRecords.length, claims.length, reconResults.length]);

  async function handleSample() {
    setBusy(true);
    setError(null);
    try {
      await loadSampleData({ commitDataset, recordDatasetImport });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sample data.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-medium tracking-tight text-[color:var(--ink-strong)]">
          WaferIQ
        </h1>
        <p className="max-w-3xl text-base text-[color:var(--ink-body)]">
          Reconcile distributor sell-through against ship-and-debit and
          price-protection claims. Drop your files, map columns, run the
          engine, and see the discrepancies with dollar impact — the missed
          credits, the orphan claims, the quantity and price mismatches.
        </p>
      </header>

      <StageCTA stage={stage} onSample={handleSample} busy={busy} lastReconAt={lastReconAt} />

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <SnapshotGrid
        datasets={datasets.length}
        posRecords={posRecords.length}
        claims={claims.length}
        results={reconResults.length}
      />

      <details className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm">
        <summary className="cursor-pointer select-none font-medium text-[color:var(--ink-strong)]">
          What is WaferIQ, exactly?
        </summary>
        <div className="mt-3 space-y-3 text-[color:var(--ink-body)]">
          <p>
            Semiconductor manufacturers sell through distributors like Arrow
            and Avnet. Every month, those distributors report what they
            actually sold (POS reports) and file claims for credits under two
            programs:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Ship-and-debit (S&amp;D):</strong> the distributor sold
              at an authorized special price and asks for the difference
              between their cost and the authorized price.
            </li>
            <li>
              <strong>Price protection (PP):</strong> the manufacturer cut
              prices, so the distributor asks for a credit on stock they
              already had.
            </li>
          </ul>
          <p>
            Reconciling POS reports against these claims is where the money
            lives — missed claims are unbilled credits, orphan claims might
            not be legitimate, and quantity/price mismatches are the
            distributor selling outside authorized terms. WaferIQ ingests the
            files, matches them, and flags every discrepancy with dollar
            impact.
          </p>
          <p className="text-xs text-[color:var(--ink-muted)]">
            The <strong>reconciliation engine</strong> uses part-number and
            customer-name normalization, quantity tolerance, date windows,
            and per-claim-type price checks. All configurable; sensible
            defaults ship. Everything runs locally in your browser — no data
            leaves your machine.
          </p>
        </div>
      </details>

      <HealthPanel />
    </div>
  );
}

type Stage = 'empty' | 'has_datasets_no_entities' | 'has_entities_no_run' | 'has_results';

function classify(counts: {
  datasets: number; posRecords: number; claims: number; results: number;
}): Stage {
  if (counts.results > 0) return 'has_results';
  if (counts.posRecords > 0 || counts.claims > 0) return 'has_entities_no_run';
  if (counts.datasets > 0) return 'has_datasets_no_entities';
  return 'empty';
}

function StageCTA({
  stage, onSample, busy, lastReconAt,
}: {
  stage: Stage;
  onSample: () => Promise<void>;
  busy: boolean;
  lastReconAt: string | null;
}) {
  if (stage === 'empty') {
    return (
      <section className="rounded-lg border border-[var(--brand-soft)] bg-[var(--brand-soft)]/40 p-5">
        <h2 className="text-base font-medium text-[color:var(--ink-strong)]">
          Get started
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ink-body)]">
          You&apos;ve got two ways in. If you have your own distributor files,
          head straight to Ingest. If you want to see what the flow looks like
          first, load the built-in sample data.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/ingest"
            className="rounded bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
          >
            Start with your own file
          </Link>
          <button
            type="button"
            onClick={onSample}
            disabled={busy}
            className={`rounded border border-[var(--field-border)] bg-white px-3 py-1.5 text-sm text-[color:var(--ink-strong)] hover:bg-[var(--surface-sunken)] ${busy ? 'cursor-wait opacity-60' : ''}`}
          >
            {busy ? 'Loading…' : 'Load sample data'}
          </button>
        </div>
      </section>
    );
  }

  if (stage === 'has_datasets_no_entities') {
    return (
      <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-5">
        <h2 className="text-base font-medium text-[color:var(--ink-strong)]">Next up: map your datasets</h2>
        <p className="mt-1 text-sm text-[color:var(--ink-body)]">
          You&apos;ve uploaded files but haven&apos;t told WaferIQ which columns are
          POS records and which are claims. Expand each dataset on Ingest and
          click &ldquo;Map to POS-recon&rdquo;.
        </p>
        <div className="mt-4">
          <Link
            href="/ingest"
            className="rounded bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
          >
            Continue on Ingest
          </Link>
        </div>
      </section>
    );
  }

  if (stage === 'has_entities_no_run') {
    return (
      <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-5">
        <h2 className="text-base font-medium text-[color:var(--ink-strong)]">Ready to reconcile</h2>
        <p className="mt-1 text-sm text-[color:var(--ink-body)]">
          Your POS records and claims are loaded. Head to Recon and run the
          engine to see the matches, misses, and flagged discrepancies.
        </p>
        <div className="mt-4">
          <Link
            href="/recon"
            className="rounded bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
          >
            Go to Recon
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-5">
      <h2 className="text-base font-medium text-[color:var(--ink-strong)]">
        Your latest reconciliation
      </h2>
      <p className="mt-1 text-sm text-[color:var(--ink-body)]">
        Results are ready to explore.
        {lastReconAt && (
          <> Last run{' '}
            <span className="text-[color:var(--ink-muted)]">
              {new Date(lastReconAt).toLocaleString()}
            </span>.
          </>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/recon"
          className="rounded bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
        >
          Open dashboard
        </Link>
        <Link
          href="/ingest"
          className="rounded border border-[var(--field-border)] bg-white px-3 py-1.5 text-sm text-[color:var(--ink-strong)] hover:bg-[var(--surface-sunken)]"
        >
          Import more data
        </Link>
      </div>
    </section>
  );
}

function SnapshotGrid({
  datasets, posRecords, claims, results,
}: {
  datasets: number; posRecords: number; claims: number; results: number;
}) {
  const items = [
    { label: 'Datasets', value: datasets },
    { label: 'POS records', value: posRecords },
    { label: 'Claims', value: claims },
    { label: 'Recon results', value: results },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4"
        >
          <dt className="text-xs uppercase tracking-wide text-[color:var(--ink-muted)]">
            {it.label}
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-[color:var(--ink-strong)]">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
