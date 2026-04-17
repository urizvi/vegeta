import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore as useStore } from '@/store/territoryStore';
import { MAP_THEMES } from '@/lib/mapThemes';

// Re-export the base store hook for direct access
export { useTerritoryStore } from '@/store/territoryStore';

// ── Typed selectors (prevent over-renders) ─────────────────────────────────

export const useActiveView = () => useStore((s) => s.activeView);
export const useMapTheme = () => useStore((s) => MAP_THEMES[s.mapThemeId]);
export const useDrillDownCountryCode = () => useStore((s) => s.drillDownCountryCode);
export const useHoveredEntityCode = () => useStore((s) => s.hoveredEntityCode);
export const useHoveredEntityIso = () => useStore((s) => s.hoveredEntityIso);
export const useAccounts = () => useStore((s) => s.accounts);
export const useAccountOrder = () => useStore((s) => s.accountOrder);
export const useShowAccounts = () => useStore((s) => s.showAccounts);
export const useMapAccountMetric = () => useStore((s) => s.mapAccountMetric);
export const useFieldDefs = () => useStore(useShallow((s) => s.fieldDefs));
export const useMetricFields = () =>
  useStore(useShallow((s) => s.fieldDefs.filter((f) => f.type === 'metric')));
export const useCategoricalFields = () =>
  useStore(useShallow((s) => s.fieldDefs.filter((f) => f.type === 'categorical')));

/** Returns aggregate stats for accounts in the given territory entity, or null if none. */
export const useEntityAccountStats = (entityIso: string | null) =>
  useStore((s) => {
    if (!entityIso || !s.showAccounts || s.accountOrder.length === 0) return null;
    const isState = entityIso.includes(':');
    const accts = s.accountOrder
      .map((id) => s.accounts[id])
      .filter(Boolean)
      .filter((a) => (isState ? a.state === entityIso : a.country === entityIso));
    if (accts.length === 0) return null;
    const byField: Record<string, number> = {};
    s.fieldDefs.forEach((def) => {
      if (def.type === 'metric') {
        byField[def.id] = accts.reduce((sum, a) => sum + (Number(a.fields[def.id]) || 0), 0);
      }
    });
    return { count: accts.length, byField };
  });

export const useSelectedEntityCode = () => useStore((s) => s.selectedEntityCode);

export const useTeams = () => useStore((s) => s.teams);
export const useTeamOrder = () => useStore((s) => s.teamOrder);
export const useMembers = () => useStore((s) => s.members);
export const useRegions = () => useStore((s) => s.regions);
export const useRegionOrder = () => useStore((s) => s.regionOrder);
export const useSubregions = () => useStore((s) => s.subregions);
export const useSubregionOrder = () => useStore((s) => s.subregionOrder);
export const useAssignments = () => useStore((s) => s.assignments);

export const useTeam = (id: string) => useStore((s) => s.teams[id]);

export const useCountryFillColor = (entityCode: string): string =>
  useStore((s) => {
    const unassigned = MAP_THEMES[s.mapThemeId].unassignedFill;

    // States ("US:US-CA") — color derives from the subregion that owns this state
    if (entityCode.includes(':')) {
      const sub = s.subregionOrder
        .map((sid) => s.subregions[sid])
        .find((r) => r?.stateCodes.includes(entityCode));
      if (sub?.teamId) return s.teams[sub.teamId]?.color ?? unassigned;
      return unassigned;
    }

    // Countries — first check subregions that have states in this specific country
    const subWithStates = s.subregionOrder
      .map((sid) => s.subregions[sid])
      .find((r) => r?.teamId && r.stateCodes.some((code) => code.startsWith(`${entityCode}:`)));
    if (subWithStates?.teamId) return s.teams[subWithStates.teamId]?.color ?? unassigned;

    // Fall back to any subregion in the same region (for countries with no state data)
    const regionId = s.regionOrder.find((rid) =>
      s.regions[rid]?.countryCodes.includes(entityCode),
    );
    if (regionId) {
      const sub = s.subregionOrder
        .map((sid) => s.subregions[sid])
        .find((r) => r?.parentRegionId === regionId && r?.teamId);
      if (sub?.teamId) return s.teams[sub.teamId]?.color ?? unassigned;
    }

    // Fall back to direct country-level assignment
    const a = s.assignments[entityCode];
    if (!a) return unassigned;
    return s.teams[a.teamId]?.color ?? unassigned;
  });

export const useEntityAssignment = (entityCode: string) =>
  useStore((s) => s.assignments[entityCode]);

export const useEntityAssignedTeam = (entityCode: string) =>
  useStore((s) => {
    const a = s.assignments[entityCode];
    if (!a) return null;
    return s.teams[a.teamId] ?? null;
  });

/**
 * For a region, returns the first team (by subregionOrder) that has a subregion
 * assigned within that region — the roll-up team for the world map country color.
 */
export const useRegionRollupTeam = (regionId: string | null) =>
  useStore((s) => {
    if (!regionId) return null;
    const sub = s.subregionOrder
      .map((sid) => s.subregions[sid])
      .find((r) => r?.parentRegionId === regionId && r?.teamId);
    return sub?.teamId ? (s.teams[sub.teamId] ?? null) : null;
  });

/** Returns the subregion that contains the given state entityCode, or null. */
export const useSubregionForState = (entityCode: string) =>
  useStore(
    useShallow((s) =>
      s.subregionOrder
        .map((sid) => s.subregions[sid])
        .find((r) => r?.stateCodes.includes(entityCode)) ?? null,
    ),
  );

/** Returns all subregions assigned to a team, ordered by subregionOrder. */
export const useTeamSubregions = (teamId: string) =>
  useStore(
    useShallow((s) =>
      s.subregionOrder
        .map((sid) => s.subregions[sid])
        .filter((r) => r?.teamId === teamId),
    ),
  );

// Actions are stable references in Zustand — read directly from getState()
// so no subscription or snapshot comparison is needed.
export const useActions = () => useStore.getState();
