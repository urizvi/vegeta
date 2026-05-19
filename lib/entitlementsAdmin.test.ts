import { describe, expect, it } from 'vitest';
import { buildEntitlementPatch, isWorkspaceOwner } from './entitlementsAdmin';

describe('buildEntitlementPatch', () => {
  it('builds an active patch with null expiry', () => {
    expect(buildEntitlementPatch('ws1', 'tasks', 'active', '')).toEqual({
      workspace_id: 'ws1', module: 'tasks', status: 'active', expires_at: null,
    });
  });
  it('trial expiry date is the inclusive last day (end-of-day UTC)', () => {
    const p = buildEntitlementPatch('ws1', 'territory', 'trial', '2026-06-01');
    expect(p.status).toBe('trial');
    expect(p.expires_at).toBe('2026-06-01T23:59:59.999Z');
  });
});

describe('isWorkspaceOwner', () => {
  it('true only for the owner role', () => {
    expect(isWorkspaceOwner('owner')).toBe(true);
    expect(isWorkspaceOwner('member')).toBe(false);
    expect(isWorkspaceOwner(null)).toBe(false);
  });
});
