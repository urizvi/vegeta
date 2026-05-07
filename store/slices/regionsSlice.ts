import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Region, CanonicalRegion } from '@/types/territory';
import { BUILT_IN_REGIONS } from '@/lib/regionData';

export interface RegionsSlice {
  regions: Record<string, Region>;
  regionOrder: string[];

  addRegion: (name: string, canonicalKey: CanonicalRegion, countryCodes: string[]) => void;
  updateRegionCountries: (regionId: string, countryCodes: string[]) => void;
  removeRegion: (id: string) => void;
}

function buildSeedRegions(): { regions: Record<string, Region>; regionOrder: string[] } {
  const regions: Record<string, Region> = {};
  const regionOrder: string[] = [];
  BUILT_IN_REGIONS.forEach((r) => {
    const id = r.key.toLowerCase();
    regions[id] = { id, name: r.name, canonicalKey: r.key, countryCodes: r.countryCodes };
    regionOrder.push(id);
  });
  return { regions, regionOrder };
}

export const regionsPersistKeys = ['regions', 'regionOrder'] as const satisfies readonly (keyof RegionsSlice)[];

export const createRegionsSlice: StateCreator<TerritoryStore, [], [], RegionsSlice> = (set) => {
  const { regions, regionOrder } = buildSeedRegions();

  return {
    regions,
    regionOrder,

    addRegion(name, canonicalKey, countryCodes) {
      const id = `region-${crypto.randomUUID()}`;
      set((s) => ({
        regions: { ...s.regions, [id]: { id, name, canonicalKey, countryCodes } },
        regionOrder: [...s.regionOrder, id],
      }));
    },

    updateRegionCountries(regionId, countryCodes) {
      set((s) => ({
        regions: { ...s.regions, [regionId]: { ...s.regions[regionId], countryCodes } },
      }));
    },

    removeRegion(id) {
      set((s) => {
        const rest = { ...s.regions };
        delete rest[id];
        const removedSubregionIds = s.subregionOrder.filter(
          (sid) => s.subregions[sid]?.parentRegionId === id,
        );
        const subregions = { ...s.subregions };
        removedSubregionIds.forEach((sid) => delete subregions[sid]);
        return {
          regions: rest,
          regionOrder: s.regionOrder.filter((rid) => rid !== id),
          subregions,
          subregionOrder: s.subregionOrder.filter((sid) => !removedSubregionIds.includes(sid)),
        };
      });
    },
  };
};
