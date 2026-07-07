'use client';

import { create } from 'zustand';
import { createDatasetsSlice, type DatasetsSlice } from './slices/datasetsSlice';

// New store for the WaferIQ pivot. Intentionally separate from the legacy
// useTerritoryStore so parked territory state and future wedge state stay
// unentangled. Composed from thin slices in the same pattern as the legacy
// store, so future migration (if we ever unify) is mechanical.

export type WaferiqStore = DatasetsSlice;

export const useWaferiqStore = create<WaferiqStore>()((...a) => ({
  ...createDatasetsSlice(...a),
}));
