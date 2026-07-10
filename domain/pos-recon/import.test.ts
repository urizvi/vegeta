import { describe, expect, it } from 'vitest';
import {
  mapPOSRecords,
  mapShipAndDebitClaims,
  mapPriceProtectionClaims,
  mapClaims,
} from './import';
import type { POSRecordMapping, ShipAndDebitMapping, PriceProtectionMapping } from './import';
import type { Column, Dataset, Row } from '@/ingestion/types';

const col = (key: string, type: Column['type'] = 'text'): Column => ({
  key,
  sourceHeader: key,
  label: key,
  type,
  required: false,
  discarded: false,
});

const dataset = (rows: Row[], columns: Column[]): Dataset => ({
  id: 'd1',
  name: 'test',
  source: { fileName: 'test.csv', fileSize: 0, importedAt: '2026-07-09T00:00:00Z' },
  columns,
  rows,
  issues: [],
});

const POS_MAPPING: POSRecordMapping = {
  distributor: 'dist',
  period: 'period',
  partNumber: 'part',
  endCustomer: 'cust',
  shipDate: 'ship',
  sellDate: 'sell',
  quantity: 'qty',
  resalePrice: 'price',
  extendedAmount: 'ext',
};

describe('mapPOSRecords', () => {
  it('projects rows into typed POSRecords', () => {
    const d = dataset(
      [
        {
          dist: 'Arrow', period: '2026-06-01', part: 'ABC-1', cust: 'Acme',
          ship: '2026-06-15', sell: '2026-06-15', qty: 10, price: 5, ext: 50,
        },
      ],
      [col('dist'), col('period', 'date'), col('part'), col('cust'),
       col('ship', 'date'), col('sell', 'date'),
       col('qty', 'number'), col('price', 'number'), col('ext', 'number')],
    );
    const { entities, issues } = mapPOSRecords(d, POS_MAPPING);
    expect(issues).toEqual([]);
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      distributor: 'Arrow',
      partNumber: 'ABC-1',
      quantity: 10,
      resalePrice: 5,
      extendedAmount: 50,
      period: '2026-06-01',
      currency: 'USD',
      datasetId: 'd1',
      sourceRowIndex: 0,
    });
    expect(entities[0]!.id).toMatch(/^pos_d1_0$/);
  });

  it('flags missing_column and returns no entities', () => {
    const d = dataset([{ dist: 'Arrow' }], [col('dist')]);
    const { entities, issues } = mapPOSRecords(d, POS_MAPPING);
    expect(entities).toEqual([]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.kind === 'missing_column')).toBe(true);
    // Distributor column IS present; the others aren't. Expect one missing_column per absent field.
    expect(issues.map((i) => i.entityField).sort()).toEqual([
      'endCustomer', 'extendedAmount', 'partNumber', 'period', 'quantity', 'resalePrice', 'sellDate', 'shipDate',
    ]);
  });

  it('surfaces empty_required and drops the row', () => {
    const d = dataset(
      [
        {
          dist: null, period: '2026-06-01', part: 'ABC-1', cust: 'Acme',
          ship: '2026-06-15', sell: '2026-06-15', qty: 10, price: 5, ext: 50,
        },
      ],
      [col('dist'), col('period', 'date'), col('part'), col('cust'),
       col('ship', 'date'), col('sell', 'date'),
       col('qty', 'number'), col('price', 'number'), col('ext', 'number')],
    );
    const { entities, issues } = mapPOSRecords(d, POS_MAPPING);
    expect(entities).toEqual([]);
    expect(issues.some((i) => i.kind === 'empty_required' && i.entityField === 'distributor')).toBe(true);
  });

  it('surfaces type_coerce on unparsable numeric', () => {
    const d = dataset(
      [
        {
          dist: 'Arrow', period: '2026-06-01', part: 'ABC-1', cust: 'Acme',
          ship: '2026-06-15', sell: '2026-06-15', qty: 'not-a-number', price: 5, ext: 50,
        },
      ],
      [col('dist'), col('period', 'date'), col('part'), col('cust'),
       col('ship', 'date'), col('sell', 'date'),
       col('qty'), col('price', 'number'), col('ext', 'number')],
    );
    const { entities, issues } = mapPOSRecords(d, POS_MAPPING);
    expect(entities).toEqual([]);
    expect(issues.some((i) => i.kind === 'type_coerce' && i.entityField === 'quantity')).toBe(true);
  });

  it('strips currency symbols and commas from money fields', () => {
    const d = dataset(
      [
        {
          dist: 'Arrow', period: '2026-06-01', part: 'ABC-1', cust: 'Acme',
          ship: '2026-06-15', sell: '2026-06-15', qty: 10,
          price: '$5.00', ext: '$1,234.50',
        },
      ],
      [col('dist'), col('period', 'date'), col('part'), col('cust'),
       col('ship', 'date'), col('sell', 'date'), col('qty', 'number'),
       col('price'), col('ext')],
    );
    const { entities, issues } = mapPOSRecords(d, POS_MAPPING);
    expect(issues).toEqual([]);
    expect(entities[0]!.resalePrice).toBe(5);
    expect(entities[0]!.extendedAmount).toBe(1234.5);
  });
});

const SD_MAPPING: ShipAndDebitMapping = {
  distributor: 'dist', period: 'period', partNumber: 'part', endCustomer: 'cust',
  quantity: 'qty', costPrice: 'cost', authorizedPrice: 'auth',
};

describe('mapShipAndDebitClaims', () => {
  it('produces ship_and_debit-typed claims', () => {
    const d = dataset(
      [
        {
          dist: 'Arrow', period: '2026-06-01', part: 'ABC-1', cust: 'Acme',
          qty: 10, cost: 4, auth: 3,
        },
      ],
      [col('dist'), col('period', 'date'), col('part'), col('cust'),
       col('qty', 'number'), col('cost', 'number'), col('auth', 'number')],
    );
    const { entities } = mapShipAndDebitClaims(d, SD_MAPPING);
    expect(entities).toHaveLength(1);
    expect(entities[0]!.type).toBe('ship_and_debit');
    expect(entities[0]).toMatchObject({ costPrice: 4, authorizedPrice: 3 });
  });
});

const PP_MAPPING: PriceProtectionMapping = {
  distributor: 'dist', period: 'period', partNumber: 'part', endCustomer: 'cust',
  quantity: 'qty', originalPrice: 'orig', newPrice: 'new', effectiveDate: 'eff',
};

describe('mapPriceProtectionClaims', () => {
  it('produces price_protection-typed claims', () => {
    const d = dataset(
      [
        {
          dist: 'Arrow', period: '2026-06-01', part: 'ABC-1', cust: 'Acme',
          qty: 100, orig: 10, new: 8, eff: '2026-06-01',
        },
      ],
      [col('dist'), col('period', 'date'), col('part'), col('cust'),
       col('qty', 'number'), col('orig', 'number'), col('new', 'number'),
       col('eff', 'date')],
    );
    const { entities } = mapPriceProtectionClaims(d, PP_MAPPING);
    expect(entities).toHaveLength(1);
    expect(entities[0]!.type).toBe('price_protection');
    expect(entities[0]).toMatchObject({ originalPrice: 10, newPrice: 8, effectiveDate: '2026-06-01' });
  });
});

describe('mapClaims', () => {
  it('discriminates on spec.type', () => {
    const sdData = dataset(
      [{ dist: 'A', period: '2026-06-01', part: 'x', cust: 'y', qty: 1, cost: 2, auth: 1 }],
      [col('dist'), col('period', 'date'), col('part'), col('cust'), col('qty', 'number'), col('cost', 'number'), col('auth', 'number')],
    );
    const r = mapClaims(sdData, { type: 'ship_and_debit', mapping: SD_MAPPING });
    expect(r.entities[0]!.type).toBe('ship_and_debit');
  });
});
