'use client';

import { resolveEntitlementMap, type EntitlementMap, type EntitlementRow } from './entitlements';

const DENY_ALL: EntitlementMap = Object.freeze({ tasks: false, territory: false });

export async function fetchEntitlementRows(workspaceId: string): Promise<EntitlementRow[]> {
  const base = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!base) return [];
  const res = await fetch(
    `${base}/items/workspace_entitlements?filter[workspace_id][_eq]=${encodeURIComponent(workspaceId)}&fields=module,status,expires_at&limit=-1`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: EntitlementRow[] };
  return json.data ?? [];
}

const cache = new Map<string, EntitlementMap>();
const inflight = new Map<string, Promise<EntitlementMap>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeEntitlements(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Trigger a background fetch for the given workspace's entitlements.
 * Must only be called from effects or event handlers — never during render.
 * The module-level cache and listener set are browser-only singletons.
 */
export function loadEntitlementsIfNeeded(workspaceId: string): void {
  if (cache.has(workspaceId) || inflight.has(workspaceId)) return;
  const p = fetchEntitlementRows(workspaceId)
    .then((rows) => {
      const map = resolveEntitlementMap(rows);
      cache.set(workspaceId, map);
      return map;
    })
    .catch(() => {
      cache.set(workspaceId, DENY_ALL);
      return DENY_ALL;
    })
    .finally(() => {
      inflight.delete(workspaceId);
      notify();
    });
  inflight.set(workspaceId, p);
}

/** Snapshot. Defaults to DENY_ALL until the row resolves (safe default). */
export function getEntitlementSnapshot(workspaceId: string | null): EntitlementMap {
  if (!workspaceId) return DENY_ALL;
  return cache.get(workspaceId) ?? DENY_ALL;
}

/** Drop cache for a workspace (after admin edits). */
export function invalidateEntitlements(workspaceId: string): void {
  cache.delete(workspaceId);
  inflight.delete(workspaceId);
  notify();
}

export { DENY_ALL };
