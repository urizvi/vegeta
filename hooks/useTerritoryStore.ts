import { useTerritoryStore as useStore } from '@/store/territoryStore';

// Re-export the base store hook for direct access
export { useTerritoryStore } from '@/store/territoryStore';

// ── Typed selectors (prevent over-renders) ─────────────────────────────────

export const useActiveView = () => useStore((s) => s.activeView);
export const useDrillDownCountryCode = () => useStore((s) => s.drillDownCountryCode);
export const useHoveredEntityCode = () => useStore((s) => s.hoveredEntityCode);
export const useSelectedEntityCode = () => useStore((s) => s.selectedEntityCode);

export const useTeams = () => useStore((s) => s.teams);
export const useTeamOrder = () => useStore((s) => s.teamOrder);
export const useMembers = () => useStore((s) => s.members);
export const useRegions = () => useStore((s) => s.regions);
export const useRegionOrder = () => useStore((s) => s.regionOrder);
export const useAssignments = () => useStore((s) => s.assignments);

export const useTeam = (id: string) => useStore((s) => s.teams[id]);

export const useCountryFillColor = (entityCode: string): string =>
  useStore((s) => {
    const a = s.assignments[entityCode];
    if (!a) return '#d1d5db'; // unassigned gray
    return s.teams[a.teamId]?.color ?? '#d1d5db';
  });

export const useEntityAssignment = (entityCode: string) =>
  useStore((s) => s.assignments[entityCode]);

export const useEntityAssignedTeam = (entityCode: string) =>
  useStore((s) => {
    const a = s.assignments[entityCode];
    if (!a) return null;
    return s.teams[a.teamId] ?? null;
  });

// Actions are stable references in Zustand — read directly from getState()
// so no subscription or snapshot comparison is needed.
export const useActions = () => useStore.getState();
