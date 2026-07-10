import type { StateCreator } from 'zustand';
import type { POSRecord } from '@/domain/pos-recon/entities';

export interface POSRecordsSlice {
  posRecords: POSRecord[];
  addPOSRecords: (records: POSRecord[]) => void;
  replacePOSRecordsForDataset: (datasetId: string, records: POSRecord[]) => void;
  deletePOSRecordsForDataset: (datasetId: string) => void;
  clearPOSRecords: () => void;
}

export const posRecordsPersistKeys = ['posRecords'] as const;

export const createPOSRecordsSlice: StateCreator<POSRecordsSlice, [], [], POSRecordsSlice> = (set) => ({
  posRecords: [],

  addPOSRecords(records) {
    set((s) => ({ posRecords: [...s.posRecords, ...records] }));
  },

  replacePOSRecordsForDataset(datasetId, records) {
    set((s) => ({
      posRecords: [
        ...s.posRecords.filter((r) => r.datasetId !== datasetId),
        ...records,
      ],
    }));
  },

  deletePOSRecordsForDataset(datasetId) {
    set((s) => ({ posRecords: s.posRecords.filter((r) => r.datasetId !== datasetId) }));
  },

  clearPOSRecords() {
    set({ posRecords: [] });
  },
});
