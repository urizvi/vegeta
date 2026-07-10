import { describe, expect, it } from 'vitest';
import { reconcile, defaultConfig } from './engine';
import type {
  POSRecord,
  ShipAndDebitClaim,
  PriceProtectionClaim,
} from './entities';

// Helper builders keep test bodies focused on the interesting fields.
function pos(over: Partial<POSRecord> = {}): POSRecord {
  return {
    id: 'p1',
    distributor: 'Arrow',
    period: '2026-06-01',
    partNumber: 'ABC-123',
    endCustomer: 'Acme Inc.',
    shipDate: '2026-06-15',
    sellDate: '2026-06-15',
    quantity: 100,
    resalePrice: 3,
    extendedAmount: 300,
    currency: 'USD',
    datasetId: 'd1',
    sourceRowIndex: 0,
    ...over,
  };
}

function sd(over: Partial<ShipAndDebitClaim> = {}): ShipAndDebitClaim {
  return {
    id: 's1',
    type: 'ship_and_debit',
    distributor: 'Arrow',
    period: '2026-06-01',
    partNumber: 'ABC-123',
    endCustomer: 'Acme Inc.',
    quantity: 100,
    costPrice: 5,
    authorizedPrice: 3,
    currency: 'USD',
    datasetId: 'd2',
    sourceRowIndex: 0,
    ...over,
  };
}

function pp(over: Partial<PriceProtectionClaim> = {}): PriceProtectionClaim {
  return {
    id: 'p_pp1',
    type: 'price_protection',
    distributor: 'Arrow',
    period: '2026-06-01',
    partNumber: 'ABC-123',
    endCustomer: 'Acme Inc.',
    quantity: 100,
    originalPrice: 4,
    newPrice: 3,
    effectiveDate: '2026-06-01',
    currency: 'USD',
    datasetId: 'd3',
    sourceRowIndex: 0,
    ...over,
  };
}

describe('reconcile — happy path', () => {
  it('marks a clean S&D match as "matched" and computes credit', () => {
    const results = reconcile([pos()], [sd()]);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('matched');
    expect(results[0]!.flags).toEqual([]);
    // credit = (costPrice 5 - authorizedPrice 3) * qty 100 = 200
    expect(results[0]!.calculatedCredit).toBe(200);
    expect(results[0]!.claimIds).toEqual(['s1']);
  });

  it('marks a clean PP match and computes protected credit', () => {
    // resalePrice = 3 → matches authorizedPrice check trivially (PP doesn't check)
    const results = reconcile([pos()], [pp()]);
    expect(results[0]!.status).toBe('matched');
    // credit = (originalPrice 4 - newPrice 3) * qty 100 = 100
    expect(results[0]!.calculatedCredit).toBe(100);
  });
});

describe('reconcile — flag kinds', () => {
  it('emits missing_claim for a POS row with no claim', () => {
    const results = reconcile([pos()], []);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('missing_claim');
    expect(results[0]!.flags[0]!.kind).toBe('missing_claim');
    expect(results[0]!.claimIds).toEqual([]);
  });

  it('emits orphan_claim for a claim with no POS row', () => {
    const results = reconcile([], [sd()]);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('orphan_claim');
    expect(results[0]!.flags[0]!.kind).toBe('orphan_claim');
    expect(results[0]!.posRecordId).toBeUndefined();
  });

  it('emits quantity_mismatch when totals disagree beyond tolerance', () => {
    // qty 100 vs claim qty 110 = 10% diff, default tolerance 5%.
    const results = reconcile([pos({ quantity: 100 })], [sd({ quantity: 110 })]);
    expect(results[0]!.status).toBe('flagged');
    const flag = results[0]!.flags.find((f) => f.kind === 'quantity_mismatch');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('error');
  });

  it('does NOT flag qty when within tolerance', () => {
    // qty 100 vs 104 = 4% diff, under 5%.
    const results = reconcile([pos({ quantity: 100 })], [sd({ quantity: 104 })]);
    expect(results[0]!.status).toBe('matched');
    expect(results[0]!.flags).toEqual([]);
  });

  it('emits price_mismatch on S&D when POS resale ≠ authorized (beyond tolerance)', () => {
    // resalePrice 5 vs authorizedPrice 3 → 66% diff, default 5%.
    const results = reconcile(
      [pos({ resalePrice: 5 })],
      [sd({ authorizedPrice: 3 })],
    );
    expect(results[0]!.status).toBe('flagged');
    expect(results[0]!.flags.some((f) => f.kind === 'price_mismatch')).toBe(true);
  });

  it('does NOT emit price_mismatch on PP claims (no POS-side price semantics)', () => {
    // pp() defaults: newPrice = 3, POS resalePrice = 3. But even at a diff,
    // PP shouldn't fire price_mismatch — that's an S&D-only check.
    const results = reconcile([pos({ resalePrice: 10 })], [pp()]);
    // The pp default matches other fields; the price disparity should NOT
    // produce a price_mismatch flag.
    expect(results[0]!.flags.some((f) => f.kind === 'price_mismatch')).toBe(false);
  });

  it('emits date_out_of_window (soft) but still matches', () => {
    // POS ship = 2026-06-15; claim period 2026-01-01 → ~165d off.
    // Default hardDateWindow = 90d, so this should be REJECTED (orphan+missing).
    const rejected = reconcile([pos()], [sd({ period: '2026-01-01' })]);
    expect(rejected).toHaveLength(2);
    expect(rejected.some((r) => r.status === 'missing_claim')).toBe(true);
    expect(rejected.some((r) => r.status === 'orphan_claim')).toBe(true);

    // Now use a period 45d off — inside hard, outside soft.
    const softed = reconcile([pos()], [sd({ period: '2026-05-01' })]);
    expect(softed).toHaveLength(1);
    expect(softed[0]!.status).toBe('flagged');
    expect(softed[0]!.flags.some((f) => f.kind === 'date_out_of_window')).toBe(true);
  });

  it('emits duplicate_claim when multiple claims match one POS row', () => {
    const results = reconcile(
      [pos()],
      [sd({ id: 's1', quantity: 60 }), sd({ id: 's2', quantity: 40 })],
    );
    // Total claim qty 100 = POS qty 100 → no qty_mismatch.
    expect(results[0]!.status).toBe('flagged');
    expect(results[0]!.flags.some((f) => f.kind === 'duplicate_claim')).toBe(true);
    expect(results[0]!.claimIds).toEqual(['s1', 's2']);
    // credit sums: each row (5-3)*60 + (5-3)*40 = 120+80 = 200
    expect(results[0]!.calculatedCredit).toBe(200);
  });
});

describe('reconcile — matcher behavior', () => {
  it('accepts customer name variants via LocalMatcher normalization', () => {
    const results = reconcile(
      [pos({ endCustomer: 'Acme, Inc.' })],
      [sd({ endCustomer: 'ACME INC' })],
    );
    expect(results[0]!.status).toBe('matched');
  });

  it('does not match a totally different customer', () => {
    const results = reconcile(
      [pos({ endCustomer: 'Acme Inc.' })],
      [sd({ endCustomer: 'Zed Corp' })],
    );
    // Two results: pos → missing_claim, claim → orphan.
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.status === 'missing_claim')).toBe(true);
    expect(results.some((r) => r.status === 'orphan_claim')).toBe(true);
  });

  it('normalizes part numbers with dashes and case', () => {
    const results = reconcile(
      [pos({ partNumber: 'abc123' })],
      [sd({ partNumber: 'ABC-123' })],
    );
    expect(results[0]!.status).toBe('matched');
  });
});

describe('reconcile — determinism + empty inputs', () => {
  it('is deterministic across input orderings', () => {
    const a = reconcile(
      [pos({ id: 'p1' }), pos({ id: 'p2', partNumber: 'XYZ-9', endCustomer: 'Beta' })],
      [sd({ id: 's1' }), sd({ id: 's2', partNumber: 'XYZ-9', endCustomer: 'Beta' })],
    );
    const b = reconcile(
      [pos({ id: 'p2', partNumber: 'XYZ-9', endCustomer: 'Beta' }), pos({ id: 'p1' })],
      [sd({ id: 's2', partNumber: 'XYZ-9', endCustomer: 'Beta' }), sd({ id: 's1' })],
    );
    expect(a).toEqual(b);
  });

  it('returns [] on empty inputs', () => {
    expect(reconcile([], [])).toEqual([]);
  });
});

describe('reconcile — config override', () => {
  it('respects a tightened qty tolerance', () => {
    // 3% diff — passes with default (5%), fails with tightened (2%).
    const cfg = { ...defaultConfig, quantityTolerancePercent: 2 };
    const results = reconcile([pos({ quantity: 100 })], [sd({ quantity: 103 })], cfg);
    expect(results[0]!.status).toBe('flagged');
    expect(results[0]!.flags.some((f) => f.kind === 'quantity_mismatch')).toBe(true);
  });
});
