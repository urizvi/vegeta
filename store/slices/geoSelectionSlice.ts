// store/slices/geoSelectionSlice.ts
import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';

export interface GeoSelectionSlice {
  selectedGeoNodeIds: string[];
  selectionAnchorId: string | null;

  toggleGeoSelection: (id: string) => void;
  extendGeoSelection: (toId: string, visibleOrder: string[]) => void;
  clearGeoSelection: () => void;
}

export const createGeoSelectionSlice: StateCreator<TerritoryStore, [], [], GeoSelectionSlice> = (set) => ({
  selectedGeoNodeIds: [],
  selectionAnchorId: null,

  toggleGeoSelection: (id) =>
    set((s) => {
      const has = s.selectedGeoNodeIds.includes(id);
      const next = has
        ? s.selectedGeoNodeIds.filter((nid) => nid !== id)
        : [...s.selectedGeoNodeIds, id];
      return { selectedGeoNodeIds: next, selectionAnchorId: id };
    }),

  extendGeoSelection: (toId, visibleOrder) =>
    set((s) => {
      const anchor = s.selectionAnchorId ?? toId;
      const aIdx = visibleOrder.indexOf(anchor);
      const bIdx = visibleOrder.indexOf(toId);
      if (aIdx === -1 || bIdx === -1) {
        return { selectedGeoNodeIds: [toId], selectionAnchorId: toId };
      }
      const [lo, hi] = aIdx <= bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
      const range = visibleOrder.slice(lo, hi + 1);
      return { selectedGeoNodeIds: range, selectionAnchorId: anchor };
    }),

  clearGeoSelection: () => set({ selectedGeoNodeIds: [] }),
});
