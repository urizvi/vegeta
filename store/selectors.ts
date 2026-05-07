import { useTerritoryStore } from './territoryStore';
import { MAP_THEMES } from '@/lib/mapThemes';
import {
  getEntityGeoColor,
  getEntityMetricVal,
  getAccountStatsByEntity,
  type AccountStatsByEntity,
  type EntityStats,
} from '@/lib/territoryIndex';
import { mixColor } from '@/lib/choropleth';

export const useCountryFillColor = (entityCode: string): string =>
  useTerritoryStore((s) => {
    const unassigned = MAP_THEMES[s.mapThemeId].unassignedFill;
    return getEntityGeoColor(s, entityCode) ?? unassigned;
  });

export const useEntityAssignedTeam = (entityCode: string) =>
  useTerritoryStore((s) => {
    const a = s.assignments[entityCode];
    if (!a) return null;
    return s.teams[a.teamId] ?? null;
  });

/**
 * For a region, returns the first team (by subregionOrder) that has a subregion
 * assigned within that region — the roll-up team for the world map country color.
 */
export const useRegionRollupTeam = (regionId: string | null) =>
  useTerritoryStore((s) => {
    if (!regionId) return null;
    const sub = s.subregionOrder
      .map((sid) => s.subregions[sid])
      .find((r) => r?.parentRegionId === regionId && r?.teamId);
    return sub?.teamId ? (s.teams[sub.teamId] ?? null) : null;
  });

/** Returns aggregate stats for accounts in the given territory entity, or null if none. */
export const useEntityAccountStats = (entityIso: string | null): EntityStats | null =>
  useTerritoryStore((s) => {
    if (!entityIso || !s.showAccounts) return null;
    const stats = getAccountStatsByEntity(s)[entityIso];
    return stats && stats.count > 0 ? stats : null;
  });

/** Full stats index, keyed by country ("US") or state ("US:US-CA"). */
export const useAccountStatsByEntity = (): AccountStatsByEntity =>
  useTerritoryStore((s) => getAccountStatsByEntity(s));

/**
 * Country/state path fill. Branches by metric:
 *   - 'count' (or unknown metric) → existing team-color behavior.
 *   - real metric:
 *       - assigned entity   → metric-driven ramp value.
 *       - unassigned entity → unassignedFill.
 *
 * `scaleMax` is read from a separately-built scale (callers pass it in), to
 * avoid recomputing the scale on every Geography render.
 */
export const useChoroplethFillColor = (
  entityCode: string,
  scaleMax: number,
  active: boolean,
): string =>
  useTerritoryStore((s) => {
    const unassigned = MAP_THEMES[s.mapThemeId].unassignedFill;
    if (!active) {
      // count mode — preserve existing behavior.
      return getEntityGeoColor(s, entityCode) ?? unassigned;
    }
    const assignedColor = getEntityGeoColor(s, entityCode);
    if (assignedColor === null) return unassigned;
    const stats = getAccountStatsByEntity(s)[entityCode];
    const value = getEntityMetricVal(stats, s.mapAccountMetric);
    const t = scaleMax > 0 ? value / scaleMax : 0;
    return mixColor(t);
  });

// Actions are stable references in Zustand — read directly from getState()
// so no subscription or snapshot comparison is needed.
export const useActions = () => useTerritoryStore.getState();
