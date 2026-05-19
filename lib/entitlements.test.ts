import { describe, expect, it } from 'vitest';
import { resolveEntitlement, resolveEntitlementMap, type EntitlementRow } from './entitlements';

const NOW = Date.parse('2026-05-17T00:00:00Z');
const row = (p: Partial<EntitlementRow>): EntitlementRow => ({
  module: 'tasks', status: 'active', expires_at: null, ...p,
});

describe('resolveEntitlement', () => {
  it('missing row is not entitled (default deny)', () => {
    expect(resolveEntitlement(undefined, NOW)).toBe(false);
  });
  it('active with no expiry is entitled', () => {
    expect(resolveEntitlement(row({ status: 'active' }), NOW)).toBe(true);
  });
  it('disabled is never entitled', () => {
    expect(resolveEntitlement(row({ status: 'disabled' }), NOW)).toBe(false);
  });
  it('trial with future expiry is entitled', () => {
    expect(resolveEntitlement(row({ status: 'trial', expires_at: '2026-06-01T00:00:00Z' }), NOW)).toBe(true);
  });
  it('trial with past expiry is not entitled', () => {
    expect(resolveEntitlement(row({ status: 'trial', expires_at: '2026-05-01T00:00:00Z' }), NOW)).toBe(false);
  });
  it('active with past expiry is not entitled', () => {
    expect(resolveEntitlement(row({ status: 'active', expires_at: '2026-05-01T00:00:00Z' }), NOW)).toBe(false);
  });
  it('disabled overrides a future expiry', () => {
    expect(resolveEntitlement(row({ status: 'disabled', expires_at: '2099-01-01T00:00:00Z' }), NOW)).toBe(false);
  });
  it('trial with null expiry is treated as unlimited (entitled)', () => {
    expect(resolveEntitlement(row({ status: 'trial', expires_at: null }), NOW)).toBe(true);
  });
  it('expiry exactly at now is denied (boundary)', () => {
    expect(resolveEntitlement(row({ status: 'active', expires_at: '2026-05-17T00:00:00Z' }), NOW)).toBe(false);
  });
});

describe('resolveEntitlementMap', () => {
  it('absent key defaults to deny, present active key is true', () => {
    const result = resolveEntitlementMap(
      [{ module: 'tasks', status: 'active', expires_at: null }],
      NOW,
    );
    expect(result).toEqual({ tasks: true, territory: false });
  });
});
