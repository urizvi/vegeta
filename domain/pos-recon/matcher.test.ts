import { describe, expect, it } from 'vitest';
import { LocalMatcher } from './matcher';

const m = new LocalMatcher();

describe('LocalMatcher.customerScore', () => {
  it('scores exact-after-normalize as 1.0', () => {
    expect(m.customerScore('Acme Inc.', 'Acme, Inc')).toBe(1);
    expect(m.customerScore('Beta Corp', 'BETA CORPORATION')).toBe(1);
  });
  it('scores prefix/suffix relationships as 0.7', () => {
    expect(m.customerScore('Acme', 'Acme Manufacturing')).toBe(0.7);
    expect(m.customerScore('Acme Manufacturing', 'Manufacturing')).toBe(0.7);
  });
  it('scores unrelated names as 0', () => {
    expect(m.customerScore('Acme', 'Zed')).toBe(0);
  });
  it('scores empties as 0', () => {
    expect(m.customerScore('', 'Acme')).toBe(0);
    expect(m.customerScore('Inc', 'Inc')).toBe(0);
  });
});

describe('LocalMatcher.partScore', () => {
  it('scores exact-after-normalize as 1.0', () => {
    expect(m.partScore('abc-123', 'ABC 123')).toBe(1);
  });
  it('scores prefix as 0.7', () => {
    expect(m.partScore('ABC123', 'ABC123-REVA')).toBe(0.7);
  });
  it('scores unrelated as 0', () => {
    expect(m.partScore('ABC123', 'XYZ999')).toBe(0);
  });
});
