'use client';

import { useState } from 'react';
import type { Claim, POSRecord, ReconciliationResult } from '@/domain/pos-recon/entities';
import { STATUS_LABEL } from '@/lib/reconView';
import ResultDetail from './ResultDetail';

interface Props {
  result: ReconciliationResult;
  pos: POSRecord | undefined;
  claims: Claim[];
}

const STATUS_TONE: Record<ReconciliationResult['status'], string> = {
  matched: 'bg-emerald-100 text-emerald-800',
  flagged: 'bg-amber-100 text-amber-900',
  missing_claim: 'bg-slate-100 text-slate-700',
  orphan_claim: 'bg-rose-100 text-rose-800',
};

export default function ResultRow({ result, pos, claims }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = pos ?? claims[0];

  return (
    <li className="overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-4 p-3 text-left text-sm hover:bg-[var(--surface-sunken)]"
      >
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[result.status]}`}>
          {STATUS_LABEL[result.status]}
        </span>
        <span className="min-w-0 truncate">
          <span className="font-mono">{anchor?.partNumber ?? '—'}</span>
          <span className="text-[color:var(--ink-muted)]"> · </span>
          <span>{anchor?.endCustomer ?? '—'}</span>
          <span className="text-[color:var(--ink-muted)]"> · </span>
          <span className="text-xs text-[color:var(--ink-muted)]">{anchor?.distributor ?? ''}</span>
        </span>
        <span className="whitespace-nowrap text-xs text-[color:var(--ink-muted)]">
          {result.flags.length > 0
            ? `${result.flags.length} flag${result.flags.length === 1 ? '' : 's'}`
            : ''}
        </span>
        <span className="whitespace-nowrap text-right font-mono text-xs text-[color:var(--ink-body)]">
          {typeof result.calculatedCredit === 'number' ? formatMoney(result.calculatedCredit) : ''}
        </span>
      </button>
      {open && <ResultDetail result={result} pos={pos} claims={claims} />}
    </li>
  );
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
