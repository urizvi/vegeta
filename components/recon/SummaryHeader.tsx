'use client';

import type { ReconSummary } from '@/lib/reconView';

interface Props {
  summary: ReconSummary;
  lastReconAt: string | null;
}

export default function SummaryHeader({ summary, lastReconAt }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Matched" value={summary.matched} tone="emerald" />
        <Metric label="Flagged" value={summary.flagged} tone="amber" />
        <Metric label="Missing claims" value={summary.missing} tone="slate" />
        <Metric label="Orphan claims" value={summary.orphan} tone="rose" />
      </div>
      <div className="flex flex-wrap gap-6 text-xs text-[color:var(--ink-muted)]">
        <span>
          Calculated credit:{' '}
          <span className="font-mono text-[color:var(--ink-body)]">{formatMoney(summary.totalCredit)}</span>
        </span>
        <span>
          At-risk (sum of flag impact):{' '}
          <span className="font-mono text-[color:var(--ink-body)]">{formatMoney(summary.totalFlagImpact)}</span>
        </span>
        {lastReconAt && (
          <span className="ml-auto">Last run {new Date(lastReconAt).toLocaleString()}</span>
        )}
      </div>
    </div>
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
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4">
      <div className="text-xs uppercase tracking-wide text-[color:var(--ink-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneMap[tone]}`}>{value}</div>
    </div>
  );
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
