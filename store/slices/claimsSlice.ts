import type { StateCreator } from 'zustand';
import type { Claim } from '@/domain/pos-recon/entities';

export interface ClaimsSlice {
  claims: Claim[];
  addClaims: (claims: Claim[]) => void;
  replaceClaimsForDataset: (datasetId: string, claims: Claim[]) => void;
  deleteClaimsForDataset: (datasetId: string) => void;
  clearClaims: () => void;
}

export const claimsPersistKeys = ['claims'] as const;

export const createClaimsSlice: StateCreator<ClaimsSlice, [], [], ClaimsSlice> = (set) => ({
  claims: [],

  addClaims(claims) {
    set((s) => ({ claims: [...s.claims, ...claims] }));
  },

  replaceClaimsForDataset(datasetId, claims) {
    set((s) => ({
      claims: [
        ...s.claims.filter((c) => c.datasetId !== datasetId),
        ...claims,
      ],
    }));
  },

  deleteClaimsForDataset(datasetId) {
    set((s) => ({ claims: s.claims.filter((c) => c.datasetId !== datasetId) }));
  },

  clearClaims() {
    set({ claims: [] });
  },
});
