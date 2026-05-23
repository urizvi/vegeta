import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEntitlementRows, getEntitlementSnapshot, invalidateEntitlements, loadEntitlementsIfNeeded } from './entitlementsClient';

afterEach(() => vi.unstubAllGlobals());

describe('cache machinery', () => {
  afterEach(() => {
    // Clean up workspace ids used in this describe to prevent cross-test bleed
    invalidateEntitlements('snap-null-fallback');
    invalidateEntitlements('unknown-ws');
    invalidateEntitlements('wsX');
    invalidateEntitlements('wsY');
  });

  it('getEntitlementSnapshot returns deny-all for null workspaceId', () => {
    expect(getEntitlementSnapshot(null)).toEqual({ tasks: false, territory: false });
  });

  it('getEntitlementSnapshot returns deny-all for unknown workspace', () => {
    expect(getEntitlementSnapshot('unknown-ws')).toEqual({ tasks: false, territory: false });
  });

  it('loadEntitlementsIfNeeded dedupes: fetch called exactly once for concurrent calls', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ module: 'tasks', status: 'active', expires_at: null }] }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    // Call twice synchronously — only one inflight should be created
    loadEntitlementsIfNeeded('wsX');
    loadEntitlementsIfNeeded('wsX');

    // Flush microtasks so the promise settles
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getEntitlementSnapshot('wsX')).toEqual({ tasks: true, territory: false });
  });

  it('invalidateEntitlements causes a second fetch after a successful load', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ module: 'territory', status: 'active', expires_at: null }] }),
    }));
    vi.stubGlobal('fetch', mockFetch);

    loadEntitlementsIfNeeded('wsY');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalledTimes(1);

    invalidateEntitlements('wsY');
    loadEntitlementsIfNeeded('wsY');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchEntitlementRows', () => {
  it('returns rows for the workspace', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ module: 'tasks', status: 'active', expires_at: null }] }),
    })));
    const rows = await fetchEntitlementRows('ws1');
    expect(rows).toEqual([{ module: 'tasks', status: 'active', expires_at: null }]);
  });

  it('returns [] (default deny) when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
    expect(await fetchEntitlementRows('ws1')).toEqual([]);
  });
});
