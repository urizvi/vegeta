// store/slices/selectionSlice.ts
import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';

export interface SelectionSlice {
  selectedEntityCodes: string[];

  setSelection: (codes: string[]) => void;
  addToSelection: (codes: string[]) => void;
  toggleSelection: (code: string) => void;
  clearSelection: () => void;
}

export const createSelectionSlice: StateCreator<TerritoryStore, [], [], SelectionSlice> = (set) => ({
  selectedEntityCodes: [],

  setSelection: (codes) => set({ selectedEntityCodes: Array.from(new Set(codes)) }),
  addToSelection: (codes) =>
    set((s) => ({
      selectedEntityCodes: Array.from(new Set([...s.selectedEntityCodes, ...codes])),
    })),
  toggleSelection: (code) =>
    set((s) => ({
      selectedEntityCodes: s.selectedEntityCodes.includes(code)
        ? s.selectedEntityCodes.filter((c) => c !== code)
        : [...s.selectedEntityCodes, code],
    })),
  clearSelection: () => set({ selectedEntityCodes: [] }),
});
