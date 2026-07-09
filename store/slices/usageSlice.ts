import type { StateCreator } from 'zustand';

/**
 * Usage counters that measure the WaferIQ retention thesis: do partners
 * come back? Persisted alongside the domain slices. All timestamps are
 * ISO strings; visit "days" are `YYYY-MM-DD` in local time.
 *
 * Deliberately no PII, no user IDs — this is per-browser telemetry the
 * user themselves can inspect on the Health panel.
 */
export interface UsageSlice {
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  /** Distinct local calendar days on which the app was opened. Sorted asc. */
  visitDays: string[];
  reconRuns: number;
  exportsCsv: number;
  exportsXlsx: number;
  datasetImports: number;

  recordVisit: (now?: Date) => void;
  recordReconRun: () => void;
  recordExport: (fmt: 'csv' | 'xlsx') => void;
  recordDatasetImport: () => void;
  resetUsage: () => void;
}

export const usagePersistKeys = [
  'firstSeenAt', 'lastSeenAt', 'visitDays',
  'reconRuns', 'exportsCsv', 'exportsXlsx', 'datasetImports',
] as const;

const isoDay = (d: Date): string => {
  // Local-day slug so cross-midnight boundaries in the user's timezone
  // partition the way the user's calendar does.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const createUsageSlice: StateCreator<UsageSlice, [], [], UsageSlice> = (set) => ({
  firstSeenAt: null,
  lastSeenAt: null,
  visitDays: [],
  reconRuns: 0,
  exportsCsv: 0,
  exportsXlsx: 0,
  datasetImports: 0,

  recordVisit(now = new Date()) {
    const iso = now.toISOString();
    const day = isoDay(now);
    set((s) => {
      const visitDays = s.visitDays.includes(day)
        ? s.visitDays
        : [...s.visitDays, day].sort();
      return {
        firstSeenAt: s.firstSeenAt ?? iso,
        lastSeenAt: iso,
        visitDays,
      };
    });
  },

  recordReconRun() {
    set((s) => ({ reconRuns: s.reconRuns + 1 }));
  },

  recordExport(fmt) {
    set((s) => fmt === 'csv'
      ? { exportsCsv: s.exportsCsv + 1 }
      : { exportsXlsx: s.exportsXlsx + 1 });
  },

  recordDatasetImport() {
    set((s) => ({ datasetImports: s.datasetImports + 1 }));
  },

  resetUsage() {
    set({
      firstSeenAt: null, lastSeenAt: null, visitDays: [],
      reconRuns: 0, exportsCsv: 0, exportsXlsx: 0, datasetImports: 0,
    });
  },
});
