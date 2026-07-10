import { describe, expect, it } from 'vitest';
import {
  suggestPOSRecordMapping,
  suggestShipAndDebitMapping,
  suggestPriceProtectionMapping,
} from './suggest';
import type { Column } from '@/ingestion/types';

const col = (over: Partial<Column> & { key: string }): Column => ({
  sourceHeader: over.label ?? over.key,
  label: over.label ?? over.key,
  type: 'text',
  required: false,
  discarded: false,
  ...over,
});

describe('suggestPOSRecordMapping', () => {
  it('matches canonical snake_case headers directly', () => {
    const suggestion = suggestPOSRecordMapping([
      col({ key: 'distributor' }),
      col({ key: 'part_number' }),
      col({ key: 'end_customer' }),
      col({ key: 'ship_date' }),
      col({ key: 'sell_date' }),
      col({ key: 'quantity' }),
      col({ key: 'resale_price' }),
      col({ key: 'extended_amount' }),
      col({ key: 'period' }),
    ]);
    expect(suggestion).toMatchObject({
      distributor: 'distributor',
      partNumber: 'part_number',
      endCustomer: 'end_customer',
      shipDate: 'ship_date',
      sellDate: 'sell_date',
      quantity: 'quantity',
      resalePrice: 'resale_price',
      extendedAmount: 'extended_amount',
      period: 'period',
    });
  });

  it('resolves common distributor synonyms', () => {
    // Realistic-ish messy headers: "Qty", "MPN", "Ext Total", "Ship Dt".
    const suggestion = suggestPOSRecordMapping([
      col({ key: 'disti', label: 'Disti' }),
      col({ key: 'mpn', label: 'MPN' }),
      col({ key: 'customer', label: 'Customer' }),
      col({ key: 'ship_dt', label: 'Ship Dt' }),
      col({ key: 'sold', label: 'Sold' }),
      col({ key: 'qty', label: 'Qty' }),
      col({ key: 'unit_price', label: 'Unit Price' }),
      col({ key: 'ext_total', label: 'Ext Total' }),
      col({ key: 'month', label: 'Month' }),
    ]);
    expect(suggestion.distributor).toBe('disti');
    expect(suggestion.partNumber).toBe('mpn');
    expect(suggestion.endCustomer).toBe('customer');
    expect(suggestion.shipDate).toBe('ship_dt');
    expect(suggestion.quantity).toBe('qty');
    expect(suggestion.period).toBe('month');
  });

  it('does not claim the same column twice', () => {
    // "price" alone could plausibly map to resalePrice; but if a more
    // specific column also exists, specific wins and generic stays free.
    const suggestion = suggestPOSRecordMapping([
      col({ key: 'resale_price' }),
      col({ key: 'price' }),
    ]);
    expect(suggestion.resalePrice).toBe('resale_price');
    // 'price' must NOT also be assigned to resalePrice.
    const values = Object.values(suggestion);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('leaves fields unset when nothing matches', () => {
    const suggestion = suggestPOSRecordMapping([
      col({ key: 'random_col_a' }),
      col({ key: 'unrelated_thing' }),
    ]);
    expect(suggestion.distributor).toBeUndefined();
    expect(suggestion.partNumber).toBeUndefined();
  });

  it('ignores discarded columns', () => {
    const suggestion = suggestPOSRecordMapping([
      col({ key: 'quantity', discarded: true }),
      col({ key: 'ship_qty' }),
    ]);
    expect(suggestion.quantity).toBe('ship_qty');
  });
});

describe('suggestShipAndDebitMapping', () => {
  it('resolves cost + authorized synonyms', () => {
    const suggestion = suggestShipAndDebitMapping([
      col({ key: 'distributor' }),
      col({ key: 'part_number' }),
      col({ key: 'end_customer' }),
      col({ key: 'period' }),
      col({ key: 'qty' }),
      col({ key: 'unit_cost', label: 'Unit Cost' }),
      col({ key: 'special_price', label: 'Special Price' }),
      col({ key: 'auth_no', label: 'Auth #' }),
    ]);
    expect(suggestion.costPrice).toBe('unit_cost');
    expect(suggestion.authorizedPrice).toBe('special_price');
    expect(suggestion.authorizationRef).toBe('auth_no');
  });
});

describe('suggestPriceProtectionMapping', () => {
  it('resolves original / new / effective synonyms', () => {
    const suggestion = suggestPriceProtectionMapping([
      col({ key: 'distributor' }),
      col({ key: 'part_number' }),
      col({ key: 'end_customer' }),
      col({ key: 'period' }),
      col({ key: 'qty' }),
      col({ key: 'old_price', label: 'Old Price' }),
      col({ key: 'new_price', label: 'New Price' }),
      col({ key: 'effective', label: 'Effective' }),
    ]);
    expect(suggestion.originalPrice).toBe('old_price');
    expect(suggestion.newPrice).toBe('new_price');
    expect(suggestion.effectiveDate).toBe('effective');
  });
});
