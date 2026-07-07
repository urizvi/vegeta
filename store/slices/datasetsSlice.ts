import type { StateCreator } from 'zustand';
import type { Column, Dataset, ParsedSheet } from '@/ingestion/types';

export interface StagedImport {
  id: string;
  name: string;
  sheet: ParsedSheet;
  columns: Column[];
  fileName: string;
  fileSize: number;
}

export interface DatasetsSlice {
  datasets: Dataset[];
  staged: StagedImport | null;

  startImport: (staged: StagedImport) => void;
  updateStagedColumn: (key: string, patch: Partial<Column>) => void;
  cancelImport: () => void;
  commitDataset: (dataset: Dataset) => void;
  deleteDataset: (id: string) => void;
}

export const datasetsPersistKeys = ['datasets'] as const;

export const createDatasetsSlice: StateCreator<DatasetsSlice, [], [], DatasetsSlice> = (set) => ({
  datasets: [],
  staged: null,

  startImport(staged) {
    set({ staged });
  },

  updateStagedColumn(key, patch) {
    set((s) => {
      if (!s.staged) return s;
      return {
        staged: {
          ...s.staged,
          columns: s.staged.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)),
        },
      };
    });
  },

  cancelImport() {
    set({ staged: null });
  },

  commitDataset(dataset) {
    set((s) => ({
      datasets: [...s.datasets, dataset],
      staged: null,
    }));
  },

  deleteDataset(id) {
    set((s) => ({ datasets: s.datasets.filter((d) => d.id !== id) }));
  },
});
