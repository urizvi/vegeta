import { describe, expect, it } from 'vitest';
import { normalizePartNumber, normalizeCustomer, dateDiffDays } from './normalize';

describe('normalizePartNumber', () => {
  it('uppercases and strips punctuation', () => {
    expect(normalizePartNumber('abc-123')).toBe('ABC123');
    expect(normalizePartNumber('ABC 123')).toBe('ABC123');
    expect(normalizePartNumber('abc/123.rev.a')).toBe('ABC123REVA');
  });
});

describe('normalizeCustomer', () => {
  it('collapses whitespace and drops punctuation', () => {
    expect(normalizeCustomer('  Acme,  Inc.  ')).toBe('acme');
  });
  it('strips common suffixes', () => {
    expect(normalizeCustomer('Beta Corporation')).toBe('beta');
    expect(normalizeCustomer('Gamma Ltd')).toBe('gamma');
    expect(normalizeCustomer('Delta GmbH')).toBe('delta');
  });
  it('leaves non-suffix words intact', () => {
    expect(normalizeCustomer('First National Bank')).toBe('first national bank');
  });
});

describe('dateDiffDays', () => {
  it('returns absolute integer days', () => {
    expect(dateDiffDays('2026-01-01', '2026-01-10')).toBe(9);
    expect(dateDiffDays('2026-01-10', '2026-01-01')).toBe(9);
    expect(dateDiffDays('2026-01-01', '2026-01-01')).toBe(0);
  });
  it('returns NaN on unparseable input', () => {
    expect(dateDiffDays('not-a-date', '2026-01-01')).toBeNaN();
  });
});
