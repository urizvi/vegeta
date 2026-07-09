import type { StateCreator } from 'zustand';
import type { ReconciliationResult } from '@/domain/pos-recon/entities';

/**
 * Results are engine output (P3 owns generation), stored per-run so the UI
 * can drill down. Regenerated wholesale each run; no partial mutation API.
 */
export interface ReconResultsSlice {
  reconResults: ReconciliationResult[];
  /** ISO timestamp of the most recent recon engine run, or null. */
  lastReconAt: string | null;
  setReconResults: (results: ReconciliationResult[]) => void;
  clearReconResults: () => void;
}

export const reconResultsPersistKeys = ['reconResults', 'lastReconAt'] as const;

export const createReconResultsSlice: StateCreator<ReconResultsSlice, [], [], ReconResultsSlice> = (set) => ({
  reconResults: [],
  lastReconAt: null,

  setReconResults(results) {
    set({ reconResults: results, lastReconAt: new Date().toISOString() });
  },

  clearReconResults() {
    set({ reconResults: [], lastReconAt: null });
  },
});
