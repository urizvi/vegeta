import { describe, expect, it } from 'vitest';
import {
  emptyFilters,
  filterResults,
  indexById,
  resolveResult,
  summarize,
} from './reconView';
import type { POSRecord, ReconciliationResult, Claim } from '@/domain/pos-recon/entities';

function pos(over: Partial<POSRecord> = {}): POSRecord {
  return {
    id: 'p1',
    distributor: 'Arrow', period: '2026-06-01', partNumber: 'ABC-123', endCustomer: 'Acme',
    shipDate: '2026-06-15', sellDate: '2026-06-15',
    quantity: 100, resalePrice: 3, extendedAmount: 300, currency: 'USD',
    datasetId: 'd1', sourceRowIndex: 0,
    ...over,
  };
}

function result(over: Partial<ReconciliationResult>): ReconciliationResult {
  return {
    id: 'r1', posRecordId: 'p1', claimIds: [], status: 'matched', flags: [],
    ...over,
  };
}

describe('summarize', () => {
  it('counts statuses and sums calculated credit + flag impact', () => {
    const s = summarize([
      result({ id: 'r1', status: 'matched', calculatedCredit: 200 }),
      result({ id: 'r2', status: 'flagged', calculatedCredit: 100, flags: [{ kind: 'quantity_mismatch', severity: 'error', message: 'x', amountImpact: -30 }] }),
      result({ id: 'r3', status: 'missing_claim', flags: [{ kind: 'missing_claim', severity: 'warning', message: 'y' }] }),
      result({ id: 'r4', status: 'orphan_claim', flags: [{ kind: 'orphan_claim', severity: 'error', message: 'z' }] }),
    ]);
    expect(s.total).toBe(4);
    expect(s.matched).toBe(1);
    expect(s.flagged).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.orphan).toBe(1);
    expect(s.totalCredit).toBe(300);
    expect(s.totalFlagImpact).toBe(30);
  });

  it('returns zeros for empty results', () => {
    expect(summarize([]).total).toBe(0);
  });
});

describe('filterResults', () => {
  const posById = indexById([
    pos({ id: 'p1', partNumber: 'ABC-1', endCustomer: 'Acme' }),
    pos({ id: 'p2', partNumber: 'XYZ-9', endCustomer: 'Beta Corp' }),
  ]);
  const results: ReconciliationResult[] = [
    result({ id: 'r1', posRecordId: 'p1', status: 'matched' }),
    result({ id: 'r2', posRecordId: 'p2', status: 'flagged', flags: [{ kind: 'quantity_mismatch', severity: 'error', message: 'x' }] }),
    result({ id: 'r3', posRecordId: 'p1', status: 'missing_claim', flags: [{ kind: 'missing_claim', severity: 'warning', message: 'y' }] }),
  ];

  it('returns all when filters are empty', () => {
    expect(filterResults(results, emptyFilters, posById)).toHaveLength(3);
  });

  it('filters by status', () => {
    const filtered = filterResults(results, { ...emptyFilters, statuses: new Set(['flagged']) }, posById);
    expect(filtered.map((r) => r.id)).toEqual(['r2']);
  });

  it('filters by flag kind', () => {
    const filtered = filterResults(results, { ...emptyFilters, flagKinds: new Set(['quantity_mismatch']) }, posById);
    expect(filtered.map((r) => r.id)).toEqual(['r2']);
  });

  it('filters by search across POS fields', () => {
    const filtered = filterResults(results, { ...emptyFilters, search: 'beta' }, posById);
    expect(filtered.map((r) => r.id)).toEqual(['r2']);
  });

  it('AND-combines status and flag filters', () => {
    const filtered = filterResults(
      results,
      { ...emptyFilters, statuses: new Set(['matched']), flagKinds: new Set(['quantity_mismatch']) },
      posById,
    );
    expect(filtered).toEqual([]);
  });

  it('excludes results with no POS when search is set', () => {
    // An orphan_claim result has no posRecordId → no POS to match search against.
    const orphan = result({ id: 'r4', posRecordId: undefined, claimIds: ['c1'], status: 'orphan_claim' });
    const filtered = filterResults([orphan], { ...emptyFilters, search: 'anything' }, posById);
    expect(filtered).toEqual([]);
  });
});

describe('resolveResult', () => {
  it('returns pos + claim entities for a result', () => {
    const posById = indexById([pos({ id: 'p1' })]);
    const claim: Claim = {
      id: 'c1', type: 'ship_and_debit',
      distributor: 'Arrow', period: '2026-06-01', partNumber: 'ABC', endCustomer: 'Acme',
      quantity: 10, costPrice: 5, authorizedPrice: 3, currency: 'USD',
      datasetId: 'd2', sourceRowIndex: 0,
    };
    const claimsById = indexById([claim]);
    const r = resolveResult(
      result({ id: 'r1', posRecordId: 'p1', claimIds: ['c1'] }),
      posById,
      claimsById,
    );
    expect(r.pos?.id).toBe('p1');
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]!.id).toBe('c1');
  });
});
