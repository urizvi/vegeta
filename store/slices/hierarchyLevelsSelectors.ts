import { useTerritoryStore } from '../territoryStore';

export const useHierarchyLevels = () => useTerritoryStore((s) => s.hierarchyLevels);
export const useHierarchyLevelOrder = () => useTerritoryStore((s) => s.hierarchyLevelOrder);
export const useHierarchyLevel = (id: string) => useTerritoryStore((s) => s.hierarchyLevels[id]);
