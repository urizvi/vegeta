import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEntitlementPatch, isWorkspaceOwner, setEntitlement } from './entitlementsAdmin';

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

afterEach(() => vi.unstubAllGlobals());

describe('setEntitlement writes source-of-truth then workspace mirror', () => {
  it('upserts the entitlement row, then PATCHes workspaces.<module>_entitled_until', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      if (url.includes('/items/workspace_entitlements?')) {
        return { ok: true, json: async () => ({ data: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    }));

    await setEntitlement({
      workspace_id: 'ws1', module: 'territory', status: 'active', expires_at: null,
    });

    const seq = calls.map((c) => `${c.method} ${c.url.replace(/^https?:\/\/[^/]+/, '')}`);
    const entIdx = seq.findIndex((s) => s.startsWith('POST /items/workspace_entitlements'));
    const wsIdx  = seq.findIndex((s) => s.startsWith('PATCH /items/workspaces/ws1'));
    expect(entIdx).toBeGreaterThanOrEqual(0);
    expect(wsIdx).toBeGreaterThan(entIdx);
    expect(calls[wsIdx].body).toEqual({ territory_entitled_until: '9999-12-31T00:00:00.000Z' });
  });

  it('mirrors a disabled module as null', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && url.includes('/items/workspaces/')) {
        bodies.push(JSON.parse(init.body as string));
      }
      if (url.includes('/items/workspace_entitlements?')) {
        return { ok: true, json: async () => ({ data: [{ id: 'e1' }] }) };
      }
      return { ok: true, json: async () => ({}) };
    }));
    await setEntitlement({
      workspace_id: 'ws2', module: 'tasks', status: 'disabled', expires_at: null,
    });
    expect(bodies).toEqual([{ tasks_entitled_until: null }]);
  });
});
