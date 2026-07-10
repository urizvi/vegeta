'use client';

import type { Claim, POSRecord, ReconciliationResult } from '@/domain/pos-recon/entities';
import ResultRow from './ResultRow';

interface Props {
  results: ReconciliationResult[];
  posById: ReadonlyMap<string, POSRecord>;
  claimsById: ReadonlyMap<string, Claim>;
}

export default function ResultsTable({ results, posById, claimsById }: Props) {
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--hairline-strong)] p-6 text-center text-sm text-[color:var(--ink-muted)]">
        No results match the current filters.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {results.map((r) => {
        const pos = r.posRecordId ? posById.get(r.posRecordId) : undefined;
        const claims = r.claimIds.map((id) => claimsById.get(id)).filter((c): c is Claim => !!c);
        return <ResultRow key={r.id} result={r} pos={pos} claims={claims} />;
      })}
    </ul>
  );
}
