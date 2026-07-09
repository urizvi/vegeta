'use client';

import { useMemo } from 'react';
import { useWaferiqStore } from '@/store/waferiqStore';
import { reconcile } from '@/domain/pos-recon/engine';

export default function ReconRunner() {
  const posRecords = useWaferiqStore((s) => s.posRecords);
  const claims = useWaferiqStore((s) => s.claims);
  const reconResults = useWaferiqStore((s) => s.reconResults);
  const lastReconAt = useWaferiqStore((s) => s.lastReconAt);
  const setReconResults = useWaferiqStore((s) => s.setReconResults);

  const summary = useMemo(() => summarize(reconResults), [reconResults]);

  if (posRecords.length === 0 && claims.length === 0) return null;

  function run() {
    const results = reconcile(posRecords, claims);
    setReconResults(results);
  }

  const readyToRun = posRecords.length > 0 && claims.length > 0;

  return (
    <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <div className="text-sm font-medium text-[color:var(--ink-strong)]">
            Reconciliation
          </div>
          <div className="text-xs text-[color:var(--ink-muted)]">
            {posRecords.length} POS record{posRecords.length === 1 ? '' : 's'} · {claims.length} claim{claims.length === 1 ? '' : 's'}
            {lastReconAt && ` · last run ${formatTimestamp(lastReconAt)}`}
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!readyToRun}
          className={`ml-auto rounded px-3 py-1.5 text-sm font-medium text-white ${
            readyToRun
              ? 'bg-[var(--brand)] hover:bg-[var(--brand-hover)]'
              : 'bg-[color:var(--ink-faint)] cursor-not-allowed'
          }`}
        >
          Run reconciliation
        </button>
      </div>

      {summary && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Matched" value={summary.matched} tone="emerald" />
          <Metric label="Flagged" value={summary.flagged} tone="amber" />
          <Metric label="Missing claims" value={summary.missing} tone="slate" />
          <Metric label="Orphan claims" value={summary.orphan} tone="rose" />
        </dl>
      )}

      {summary && (summary.totalCredit !== 0) && (
        <div className="mt-3 text-xs text-[color:var(--ink-muted)]">
          Sum of calculated credit across matched + flagged results:{' '}
          <span className="font-mono text-[color:var(--ink-body)]">
            {formatMoney(summary.totalCredit)}
          </span>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'slate' | 'rose' }) {
  const toneMap: Record<typeof tone, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    slate: 'text-[color:var(--ink-muted)]',
    rose: 'text-rose-700',
  };
  return (
    <div className="rounded border border-[var(--hairline)] bg-[var(--surface-sunken)] p-3">
      <div className="text-xs uppercase tracking-wide text-[color:var(--ink-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneMap[tone]}`}>{value}</div>
    </div>
  );
}

interface Summary {
  matched: number;
  flagged: number;
  missing: number;
  orphan: number;
  totalCredit: number;
}

function summarize(results: readonly { status: string; calculatedCredit?: number }[]): Summary | null {
  if (results.length === 0) return null;
  const s: Summary = { matched: 0, flagged: 0, missing: 0, orphan: 0, totalCredit: 0 };
  for (const r of results) {
    if (r.status === 'matched') s.matched++;
    else if (r.status === 'flagged') s.flagged++;
    else if (r.status === 'missing_claim') s.missing++;
    else if (r.status === 'orphan_claim') s.orphan++;
    if (r.calculatedCredit) s.totalCredit += r.calculatedCredit;
  }
  return s;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
