'use client';

import type { DiscrepancyFlagKind } from '@/domain/pos-recon/entities';
import { FLAG_DEFINITION } from '@/lib/waferiqGlossary';
import { FLAG_LABEL } from '@/lib/reconView';

const FLAG_ORDER: DiscrepancyFlagKind[] = [
  'missing_claim',
  'orphan_claim',
  'quantity_mismatch',
  'price_mismatch',
  'date_out_of_window',
  'duplicate_claim',
];

export default function FlagGlossary() {
  return (
    <details className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm">
      <summary className="cursor-pointer select-none font-medium text-[color:var(--ink-strong)]">
        Flag kinds explained
      </summary>
      <dl className="mt-3 space-y-2 text-xs">
        {FLAG_ORDER.map((k) => (
          <div key={k}>
            <dt className="font-mono text-[color:var(--ink-strong)]">
              {FLAG_LABEL[k]}
            </dt>
            <dd className="mt-0.5 text-[color:var(--ink-body)]">
              {FLAG_DEFINITION[k]}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
