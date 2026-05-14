// store/slices/geoSelectionSelectors.ts
import { useTerritoryStore } from '../territoryStore';

export const useSelectedGeoNodeIds = () =>
  useTerritoryStore((s) => s.selectedGeoNodeIds);

export const useIsGeoSelected = (id: string) =>
  useTerritoryStore((s) => s.selectedGeoNodeIds.includes(id));

export const useGeoSelectionCount = () =>
  useTerritoryStore((s) => s.selectedGeoNodeIds.length);

export const useGeoSelectionAnchor = () =>
  useTerritoryStore((s) => s.selectionAnchorId);
