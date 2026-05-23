/** Paid add-on modules. Accounts (Core) is always on and has no key. */
export type ModuleKey = 'tasks' | 'territory';

export type EntitlementStatus = 'active' | 'trial' | 'disabled';

export interface EntitlementRow {
  module: ModuleKey;
  status: EntitlementStatus;
  expires_at: string | null; // ISO timestamp
}

/**
 * Single source of truth for "is this module accessible?".
 * Default-deny: absent row ⇒ false. `disabled` ⇒ false. Any non-null
 * `expires_at` at or before `now` ⇒ false regardless of status.
 * A `trial` with `null` expires_at is treated as unlimited (entitled).
 */
export function resolveEntitlement(
  row: EntitlementRow | undefined,
  now: number = Date.now(),
): boolean {
  if (!row) return false;
  if (row.status === 'disabled') return false;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
  return row.status === 'active' || row.status === 'trial';
}

export type EntitlementMap = Record<ModuleKey, boolean>;

/** Resolve a list of rows into a complete, default-deny map. */
export function resolveEntitlementMap(
  rows: EntitlementRow[],
  now: number = Date.now(),
): EntitlementMap {
  const byModule = new Map(rows.map((r) => [r.module, r]));
  return {
    tasks: resolveEntitlement(byModule.get('tasks'), now),
    territory: resolveEntitlement(byModule.get('territory'), now),
  };
}

/** Far-future sentinel meaning "entitled with no expiry". */
export const PERPETUAL_SENTINEL = '9999-12-31T00:00:00.000Z';

/**
 * Project an entitlement (status + expires_at) onto the value stored in the
 * denormalized `workspaces.<module>_entitled_until` enforcement column.
 * `disabled` ⇒ null (deny). `active`/`trial` ⇒ the expiry, or the perpetual
 * sentinel when there is none. A past timestamp is returned as-is — the
 * Directus permission filter (`_gt $NOW`) denies it without a scheduler.
 */
export function entitledUntil(
  status: EntitlementStatus,
  expiresAt: string | null,
): string | null {
  if (status === 'disabled') return null;
  return expiresAt ?? PERPETUAL_SENTINEL;
}
