import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '../territoryStore';

export const useSubregions = () => useTerritoryStore((s) => s.subregions);
export const useSubregionOrder = () => useTerritoryStore((s) => s.subregionOrder);

/** Returns the subregion that contains the given state entityCode, or null. */
export const useSubregionForState = (entityCode: string) =>
  useTerritoryStore(
    useShallow((s) =>
      s.subregionOrder
        .map((sid) => s.subregions[sid])
        .find((r) => r?.stateCodes.includes(entityCode)) ?? null,
    ),
  );

/** Returns all subregions assigned to a team, ordered by subregionOrder. */
export const useTeamSubregions = (teamId: string) =>
  useTerritoryStore(
    useShallow((s) =>
      s.subregionOrder
        .map((sid) => s.subregions[sid])
        .filter((r) => r?.teamId === teamId),
    ),
  );
