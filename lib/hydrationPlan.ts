import type { EntitlementMap } from './entitlements';

/** String-literal union of every collection owned by an add-on module. */
export type AddOnCollection = 'geo_nodes' | 'teams' | 'hierarchy_levels' | 'tasks';

/** Collections owned by each add-on module. Everything else is Core. */
const TERRITORY_COLLECTIONS = new Set<AddOnCollection>(['geo_nodes', 'teams', 'hierarchy_levels']);
const TASKS_COLLECTIONS = new Set<AddOnCollection>(['tasks']);

/**
 * Returns whether `collection` should be fetched given the current entitlements.
 * Core collections (any name not in the add-on sets) always return true.
 */
export function shouldFetch(collection: string, ents: EntitlementMap): boolean {
  if (TASKS_COLLECTIONS.has(collection as AddOnCollection)) return ents.tasks;
  if (TERRITORY_COLLECTIONS.has(collection as AddOnCollection)) return ents.territory;
  return true; // Core
}
