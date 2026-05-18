'use client';

import type { EntitlementStatus, ModuleKey } from './entitlements';
import { invalidateEntitlements } from './entitlementsClient';

export interface EntitlementPatch {
  workspace_id: string;
  module: ModuleKey;
  status: EntitlementStatus;
  expires_at: string | null;
}

/**
 * Build an EntitlementPatch from form values.
 * expiryDate is the inclusive last day of access (interpreted as end-of-day UTC); '' means no expiry.
 */
export function buildEntitlementPatch(
  workspaceId: string,
  module: ModuleKey,
  status: EntitlementStatus,
  expiryDate: string, // '' or 'YYYY-MM-DD' from a date input
): EntitlementPatch {
  return {
    workspace_id: workspaceId,
    module,
    status,
    expires_at: expiryDate ? new Date(`${expiryDate}T23:59:59.999Z`).toISOString() : null,
  };
}

export function isWorkspaceOwner(role: string | null): boolean {
  return role === 'owner';
}

/**
 * Upsert a workspace_entitlements row (one row per workspace+module). Looks up
 * an existing row id then PATCHes, else POSTs — mirrors
 * `lib/workspace.ts:updateWorkspaceSettings`.
 */
export async function setEntitlement(patch: EntitlementPatch): Promise<void> {
  const base = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!base) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const lookup = await fetch(
    `${base}/items/workspace_entitlements?filter[workspace_id][_eq]=${encodeURIComponent(patch.workspace_id)}&filter[module][_eq]=${patch.module}&fields=id&limit=1`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!lookup.ok) throw new Error(`entitlement lookup failed: ${lookup.status}`);
  const json = (await lookup.json()) as { data?: Array<{ id: string }> };
  const rowId = json.data?.[0]?.id;
  const res = rowId
    ? await fetch(`${base}/items/workspace_entitlements/${encodeURIComponent(rowId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: patch.status, expires_at: patch.expires_at }),
      })
    : await fetch(`${base}/items/workspace_entitlements`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
  if (!res.ok) throw new Error(`save entitlement failed: ${res.status}`);
  invalidateEntitlements(patch.workspace_id);
}
