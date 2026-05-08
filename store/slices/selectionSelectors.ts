// store/slices/selectionSelectors.ts
import { useTerritoryStore } from '../territoryStore';

export const useSelectedEntityCodes = () =>
  useTerritoryStore((s) => s.selectedEntityCodes);

export const useIsEntitySelected = (code: string) =>
  useTerritoryStore((s) => s.selectedEntityCodes.includes(code));

export const useSelectionCount = () =>
  useTerritoryStore((s) => s.selectedEntityCodes.length);
