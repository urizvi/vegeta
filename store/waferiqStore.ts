'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDatasetsSlice, datasetsPersistKeys, type DatasetsSlice } from './slices/datasetsSlice';
import { createPOSRecordsSlice, posRecordsPersistKeys, type POSRecordsSlice } from './slices/posRecordsSlice';
import { createClaimsSlice, claimsPersistKeys, type ClaimsSlice } from './slices/claimsSlice';
import { createReconResultsSlice, reconResultsPersistKeys, type ReconResultsSlice } from './slices/reconResultsSlice';
import { createUsageSlice, usagePersistKeys, type UsageSlice } from './slices/usageSlice';
import { createGuardedStorage } from './persistedStorage';

// Store for the WaferIQ pivot. Composed from thin slices; persist middleware
// runs everything through a size-guarded localStorage adapter so a large
// dataset doesn't blow up the store (falls back to in-memory with a warning
// surfaced via getStorageState()).
//
// Slice layout:
//   datasets     — raw ingested files (from P1)
//   posRecords   — POS-recon "truth" side
//   claims       — POS-recon "asserted credit" side (S&D + PP union)
//   reconResults — output of the P3 matching engine
//   usage        — retention-thesis counters (visits, runs, exports)

export type WaferiqStore =
  & DatasetsSlice
  & POSRecordsSlice
  & ClaimsSlice
  & ReconResultsSlice
  & UsageSlice;

const PERSISTED_KEYS = [
  ...datasetsPersistKeys,
  ...posRecordsPersistKeys,
  ...claimsPersistKeys,
  ...reconResultsPersistKeys,
  ...usagePersistKeys,
] as const;

type PersistedKey = typeof PERSISTED_KEYS[number];
type PersistedShape = Pick<WaferiqStore, PersistedKey>;

const CURRENT_VERSION = 1;

export const useWaferiqStore = create<WaferiqStore>()(
  persist(
    (...a) => ({
      ...createDatasetsSlice(...a),
      ...createPOSRecordsSlice(...a),
      ...createClaimsSlice(...a),
      ...createReconResultsSlice(...a),
      ...createUsageSlice(...a),
    }),
    {
      name: 'waferiq-store',
      version: CURRENT_VERSION,
      storage: createJSONStorage(() => createGuardedStorage()),
      partialize(state): PersistedShape {
        const out = {} as PersistedShape;
        for (const k of PERSISTED_KEYS) {
          (out as Record<string, unknown>)[k] = state[k];
        }
        return out;
      },
      // No-op migrations for now — bump CURRENT_VERSION and add cases here
      // when the shape of a persisted slice changes incompatibly.
      migrate(persisted, version) {
        void version;
        return persisted as PersistedShape;
      },
    },
  ),
);
