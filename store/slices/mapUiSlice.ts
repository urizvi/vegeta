import type { StateCreator } from 'zustand';
import { DEFAULT_THEME_ID, type MapThemeId } from '@/lib/mapThemes';
import type { TerritoryStore } from '../types';

export interface MapUiSlice {
  activeView: 'map' | 'spreadsheet';
  mapThemeId: MapThemeId;
  drillDownCountryCode: string | null;
  selectedEntityCode: string | null;
  hoveredEntityCode: string | null;
  hoveredEntityIso: string | null;
  showAccounts: boolean;
  mapAccountMetric: string;
  // ── Sub-project 2 (info density) ───────────────────────────────────────────
  showLabels: boolean;
  pinnedEntityIso: string | null;
  highlightedEntityCodes: string[];

  setActiveView: (view: 'map' | 'spreadsheet') => void;
  setMapTheme: (themeId: MapThemeId) => void;
  setDrillDownCountryCode: (code: string | null) => void;
  setSelectedEntityCode: (code: string | null) => void;
  setHoveredEntityCode: (code: string | null) => void;
  setHoveredEntityIso: (code: string | null) => void;
  toggleShowAccounts: () => void;
  setMapAccountMetric: (metric: string) => void;
  setShowLabels: (show: boolean) => void;
  toggleShowLabels: () => void;
  setPinnedEntityIso: (iso: string | null) => void;
  togglePinnedEntityIso: (iso: string) => void;
  setHighlightedEntityCodes: (codes: string[]) => void;
  clearHighlight: () => void;
}

export const mapUiPersistKeys = ['mapThemeId', 'mapAccountMetric'] as const satisfies readonly (keyof MapUiSlice)[];

export const createMapUiSlice: StateCreator<TerritoryStore, [], [], MapUiSlice> = (set) => ({
  activeView: 'map',
  mapThemeId: DEFAULT_THEME_ID,
  drillDownCountryCode: null,
  selectedEntityCode: null,
  hoveredEntityCode: null,
  hoveredEntityIso: null,
  showAccounts: true,
  mapAccountMetric: 'count',
  showLabels: false,
  pinnedEntityIso: null,
  highlightedEntityCodes: [],

  setActiveView: (view) => set({ activeView: view }),
  setMapTheme: (themeId) => set({ mapThemeId: themeId }),
  setDrillDownCountryCode: (code) => set({ drillDownCountryCode: code }),
  setSelectedEntityCode: (code) => set({ selectedEntityCode: code }),
  setHoveredEntityCode: (code) => set({ hoveredEntityCode: code }),
  setHoveredEntityIso: (code) => set({ hoveredEntityIso: code }),
  toggleShowAccounts: () => set((s) => ({ showAccounts: !s.showAccounts })),
  setMapAccountMetric: (metric) => set({ mapAccountMetric: metric }),
  setShowLabels: (showLabels) => set({ showLabels }),
  toggleShowLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setPinnedEntityIso: (iso) => set({ pinnedEntityIso: iso }),
  togglePinnedEntityIso: (iso) =>
    set((s) => ({ pinnedEntityIso: s.pinnedEntityIso === iso ? null : iso })),
  setHighlightedEntityCodes: (codes) => set({ highlightedEntityCodes: codes }),
  clearHighlight: () => set({ highlightedEntityCodes: [] }),
});
