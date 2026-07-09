'use client';

import { create } from 'zustand';
import { createDatasetsSlice, type DatasetsSlice } from './slices/datasetsSlice';
import { createPOSRecordsSlice, type POSRecordsSlice } from './slices/posRecordsSlice';
import { createClaimsSlice, type ClaimsSlice } from './slices/claimsSlice';
import { createReconResultsSlice, type ReconResultsSlice } from './slices/reconResultsSlice';

// Store for the WaferIQ pivot. Intentionally separate from the legacy
// useTerritoryStore so parked territory state stays unentangled. Composed
// from thin slices in the same pattern as the legacy store.
//
// Slice layout as of P2:
//   datasets     — raw ingested files (from P1)
//   posRecords   — POS-recon "truth" side
//   claims       — POS-recon "asserted credit" side (S&D + PP union)
//   reconResults — output of the P3 matching engine (populated by P3)

export type WaferiqStore =
  & DatasetsSlice
  & POSRecordsSlice
  & ClaimsSlice
  & ReconResultsSlice;

export const useWaferiqStore = create<WaferiqStore>()((...a) => ({
  ...createDatasetsSlice(...a),
  ...createPOSRecordsSlice(...a),
  ...createClaimsSlice(...a),
  ...createReconResultsSlice(...a),
}));
