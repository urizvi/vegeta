import { describe, expect, it } from 'vitest';
import { reconResultsToRows, rowsToWorkbook } from './reconExport';
import { indexById } from './reconView';
import type { Claim, POSRecord, ReconciliationResult } from '@/domain/pos-recon/entities';

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

function sdClaim(over: Partial<Extract<Claim, { type: 'ship_and_debit' }>> = {}): Claim {
  return {
    id: 's1', type: 'ship_and_debit',
    distributor: 'Arrow', period: '2026-06-01', partNumber: 'ABC-123', endCustomer: 'Acme',
    quantity: 100, costPrice: 5, authorizedPrice: 3, currency: 'USD',
    datasetId: 'd2', sourceRowIndex: 0,
    ...over,
  };
}

describe('reconResultsToRows', () => {
  it('flattens a matched row with claim data joined', () => {
    const results: ReconciliationResult[] = [{
      id: 'r1', posRecordId: 'p1', claimIds: ['s1', 's2'],
      status: 'matched', flags: [], calculatedCredit: 200,
    }];
    const rows = reconResultsToRows(
      results,
      indexById([pos()]),
      indexById([sdClaim({ id: 's1', quantity: 60 }), sdClaim({ id: 's2', quantity: 40 })]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'matched',
      partNumber: 'ABC-123',
      endCustomer: 'Acme',
      claimIds: 's1;s2',
      claimTypes: 's&d;s&d',
      claimQuantity: 100,
      calculatedCredit: 200,
      flagKinds: '',
      flagMessages: '',
    });
  });

  it('joins flag kinds + messages and sums absolute impact', () => {
    const results: ReconciliationResult[] = [{
      id: 'r1', posRecordId: 'p1', claimIds: ['s1'], status: 'flagged',
      flags: [
        { kind: 'quantity_mismatch', severity: 'error', message: 'qty off', amountImpact: -30 },
        { kind: 'date_out_of_window', severity: 'warning', message: 'late' },
      ],
    }];
    const [row] = reconResultsToRows(results, indexById([pos()]), indexById([sdClaim()]));
    expect(row!.flagKinds).toBe('quantity_mismatch;date_out_of_window');
    expect(row!.flagMessages).toBe('qty off | late');
    expect(row!.totalFlagImpact).toBe(30);
  });

  it('falls back to claim fields for orphan_claim (no POS)', () => {
    const results: ReconciliationResult[] = [{
      id: 'r1', claimIds: ['s1'], status: 'orphan_claim',
      flags: [{ kind: 'orphan_claim', severity: 'error', message: 'no pos' }],
    }];
    const [row] = reconResultsToRows(
      results,
      indexById([]),
      indexById([sdClaim({ endCustomer: 'Ghost Corp' })]),
    );
    expect(row!.endCustomer).toBe('Ghost Corp');
    expect(row!.posQuantity).toBe('');
    expect(row!.claimIds).toBe('s1');
  });

  it('leaves numeric fields as "" (not 0) when POS is absent', () => {
    const results: ReconciliationResult[] = [{
      id: 'r1', claimIds: ['s1'], status: 'orphan_claim', flags: [],
    }];
    const [row] = reconResultsToRows(results, indexById([]), indexById([sdClaim()]));
    expect(row!.posQuantity).toBe('');
    expect(row!.posResalePrice).toBe('');
    expect(row!.calculatedCredit).toBe('');
  });
});

describe('rowsToWorkbook', () => {
  it('produces a workbook with a Reconciliation sheet', () => {
    const wb = rowsToWorkbook([]);
    expect(wb.SheetNames).toEqual(['Reconciliation']);
  });
});
