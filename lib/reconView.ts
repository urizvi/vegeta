// Pure derivations for the /recon dashboard. Kept out of React so filter
// logic + summary math are testable in isolation. Any UI-only concerns
// (colors, labels) live with the components.

import type {
  Claim,
  DiscrepancyFlagKind,
  POSRecord,
  ReconciliationResult,
} from '@/domain/pos-recon/entities';

export type ResultStatus = ReconciliationResult['status'];

export interface ReconFilters {
  /** Empty set = "no status filter" (show all). */
  statuses: Set<ResultStatus>;
  /** Empty set = "no flag filter" (show all). Flags AND with statuses. */
  flagKinds: Set<DiscrepancyFlagKind>;
  /** Free-text over POS partNumber / endCustomer / distributor. Trimmed + lowercased. */
  search: string;
}

export const emptyFilters: ReconFilters = {
  statuses: new Set(),
  flagKinds: new Set(),
  search: '',
};

export interface ReconSummary {
  total: number;
  matched: number;
  flagged: number;
  missing: number;
  orphan: number;
  totalCredit: number;
  /** Sum of amountImpact across all flags where present. Rough "at-risk dollars". */
  totalFlagImpact: number;
}

export function summarize(results: readonly ReconciliationResult[]): ReconSummary {
  const s: ReconSummary = {
    total: results.length,
    matched: 0, flagged: 0, missing: 0, orphan: 0,
    totalCredit: 0, totalFlagImpact: 0,
  };
  for (const r of results) {
    if (r.status === 'matched') s.matched++;
    else if (r.status === 'flagged') s.flagged++;
    else if (r.status === 'missing_claim') s.missing++;
    else if (r.status === 'orphan_claim') s.orphan++;
    if (r.calculatedCredit) s.totalCredit += r.calculatedCredit;
    for (const flag of r.flags) {
      if (typeof flag.amountImpact === 'number') s.totalFlagImpact += Math.abs(flag.amountImpact);
    }
  }
  return s;
}

export function filterResults(
  results: readonly ReconciliationResult[],
  filters: ReconFilters,
  posById: ReadonlyMap<string, POSRecord>,
): ReconciliationResult[] {
  const q = filters.search.trim().toLowerCase();
  const hasStatus = filters.statuses.size > 0;
  const hasFlag = filters.flagKinds.size > 0;
  return results.filter((r) => {
    if (hasStatus && !filters.statuses.has(r.status)) return false;
    if (hasFlag && !r.flags.some((f) => filters.flagKinds.has(f.kind))) return false;
    if (q) {
      const pos = r.posRecordId ? posById.get(r.posRecordId) : undefined;
      if (!pos || !matchesSearch(pos, q)) return false;
    }
    return true;
  });
}

function matchesSearch(pos: POSRecord, q: string): boolean {
  return (
    pos.partNumber.toLowerCase().includes(q) ||
    pos.endCustomer.toLowerCase().includes(q) ||
    pos.distributor.toLowerCase().includes(q)
  );
}

export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of items) out.set(item.id, item);
  return out;
}

/** Given a result and lookup maps, return the linked POS + claim entities. */
export function resolveResult(
  result: ReconciliationResult,
  posById: ReadonlyMap<string, POSRecord>,
  claimsById: ReadonlyMap<string, Claim>,
): { pos: POSRecord | undefined; claims: Claim[] } {
  const pos = result.posRecordId ? posById.get(result.posRecordId) : undefined;
  const claims: Claim[] = [];
  for (const id of result.claimIds) {
    const c = claimsById.get(id);
    if (c) claims.push(c);
  }
  return { pos, claims };
}

export const STATUS_LABEL: Record<ResultStatus, string> = {
  matched: 'Matched',
  flagged: 'Flagged',
  missing_claim: 'Missing claim',
  orphan_claim: 'Orphan claim',
};

export const FLAG_LABEL: Record<DiscrepancyFlagKind, string> = {
  missing_claim: 'Missing claim',
  orphan_claim: 'Orphan claim',
  quantity_mismatch: 'Quantity mismatch',
  price_mismatch: 'Price mismatch',
  date_out_of_window: 'Date out of window',
  duplicate_claim: 'Duplicate claim',
};
