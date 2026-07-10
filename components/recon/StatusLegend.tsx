'use client';

import { STATUS_DEFINITION, type ResultStatus } from '@/lib/waferiqGlossary';

const STATUS_ORDER: ResultStatus[] = ['matched', 'flagged', 'missing_claim', 'orphan_claim'];

const STATUS_TONE: Record<ResultStatus, string> = {
  matched: 'bg-emerald-100 text-emerald-800',
  flagged: 'bg-amber-100 text-amber-900',
  missing_claim: 'bg-slate-100 text-slate-700',
  orphan_claim: 'bg-rose-100 text-rose-800',
};

const STATUS_LABEL: Record<ResultStatus, string> = {
  matched: 'Matched',
  flagged: 'Flagged',
  missing_claim: 'Missing claim',
  orphan_claim: 'Orphan claim',
};

export default function StatusLegend() {
  return (
    <details className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm">
      <summary className="cursor-pointer select-none font-medium text-[color:var(--ink-strong)]">
        How to read the results
      </summary>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="flex gap-3">
            <span className={`h-fit rounded px-2 py-0.5 text-[10px] ${STATUS_TONE[s]}`}>
              {STATUS_LABEL[s]}
            </span>
            <dd className="text-[color:var(--ink-body)]">{STATUS_DEFINITION[s]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
