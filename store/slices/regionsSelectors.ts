import { useTerritoryStore } from '../territoryStore';

export const useRegions = () => useTerritoryStore((s) => s.regions);
export const useRegionOrder = () => useTerritoryStore((s) => s.regionOrder);
