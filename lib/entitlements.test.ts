import { describe, expect, it } from 'vitest';
import { resolveEntitlement, resolveEntitlementMap, entitledUntil, PERPETUAL_SENTINEL, type EntitlementRow } from './entitlements';

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

describe('entitledUntil', () => {
  it('disabled → null regardless of expiry', () => {
    expect(entitledUntil('disabled', null)).toBe(null);
    expect(entitledUntil('disabled', '2026-06-01T00:00:00.000Z')).toBe(null);
  });
  it('active with no expiry → far-future sentinel', () => {
    expect(entitledUntil('active', null)).toBe(PERPETUAL_SENTINEL);
  });
  it('trial with no expiry → far-future sentinel', () => {
    expect(entitledUntil('trial', null)).toBe(PERPETUAL_SENTINEL);
  });
  it('active with expiry → that expiry', () => {
    expect(entitledUntil('active', '2026-06-01T23:59:59.999Z')).toBe('2026-06-01T23:59:59.999Z');
  });
  it('trial with future expiry → that expiry', () => {
    expect(entitledUntil('trial', '2027-01-01T00:00:00.000Z')).toBe('2027-01-01T00:00:00.000Z');
  });
  it('trial with past expiry → that (past) expiry, not null', () => {
    expect(entitledUntil('trial', '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
  });
});
