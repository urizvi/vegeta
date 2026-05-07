import { useTerritoryStore } from '../territoryStore';
import { MAP_THEMES } from '@/lib/mapThemes';

export const useActiveView = () => useTerritoryStore((s) => s.activeView);
export const useMapTheme = () => useTerritoryStore((s) => MAP_THEMES[s.mapThemeId]);
export const useDrillDownCountryCode = () => useTerritoryStore((s) => s.drillDownCountryCode);
export const useSelectedEntityCode = () => useTerritoryStore((s) => s.selectedEntityCode);
export const useHoveredEntityCode = () => useTerritoryStore((s) => s.hoveredEntityCode);
export const useHoveredEntityIso = () => useTerritoryStore((s) => s.hoveredEntityIso);
export const useShowAccounts = () => useTerritoryStore((s) => s.showAccounts);
export const useMapAccountMetric = () => useTerritoryStore((s) => s.mapAccountMetric);

export const useShowLabels = () => useTerritoryStore((s) => s.showLabels);
export const usePinnedEntityIso = () => useTerritoryStore((s) => s.pinnedEntityIso);
export const useHighlightedEntityCodes = () =>
  useTerritoryStore((s) => s.highlightedEntityCodes);

/** Effective focused entity = pinned (if any) else hovered. */
export const useFocusedEntityIso = () =>
  useTerritoryStore((s) => s.pinnedEntityIso ?? s.hoveredEntityIso);

/** Whether a given entity code is currently highlighted by a coverage badge. */
export const useEntityHighlight = (entityCode: string) =>
  useTerritoryStore((s) => s.highlightedEntityCodes.includes(entityCode));
