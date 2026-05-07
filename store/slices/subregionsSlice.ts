import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Subregion } from '@/types/territory';

export interface SubregionsSlice {
  subregions: Record<string, Subregion>;
  subregionOrder: string[];

  addSubregion: (name: string, parentRegionId: string, stateCodes: string[], teamId: string | null) => void;
  updateSubregion: (id: string, patch: Partial<Pick<Subregion, 'name' | 'stateCodes'>>) => void;
  removeSubregion: (id: string) => void;
  assignSubregionToTeam: (subregionId: string, teamId: string | null) => void;
}

export const subregionsPersistKeys = ['subregions', 'subregionOrder'] as const satisfies readonly (keyof SubregionsSlice)[];

export const createSubregionsSlice: StateCreator<TerritoryStore, [], [], SubregionsSlice> = (set) => ({
  subregions: {},
  subregionOrder: [],

  addSubregion(name, parentRegionId, stateCodes, teamId) {
    const id = `subregion-${crypto.randomUUID()}`;
    set((s) => ({
      subregions: { ...s.subregions, [id]: { id, name, parentRegionId, stateCodes, teamId } },
      subregionOrder: [...s.subregionOrder, id],
    }));
  },

  updateSubregion(id, patch) {
    set((s) => ({ subregions: { ...s.subregions, [id]: { ...s.subregions[id], ...patch } } }));
  },

  removeSubregion(id) {
    set((s) => {
      const subregions = { ...s.subregions };
      delete subregions[id];
      return { subregions, subregionOrder: s.subregionOrder.filter((sid) => sid !== id) };
    });
  },

  assignSubregionToTeam(subregionId, teamId) {
    set((s) => ({
      subregions: { ...s.subregions, [subregionId]: { ...s.subregions[subregionId], teamId } },
    }));
  },
});
