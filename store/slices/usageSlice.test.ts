import { describe, expect, it, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createUsageSlice, type UsageSlice } from './usageSlice';

// Compose a bare store around just this slice so tests aren't coupled to the
// rest of the WaferIQ store.
function makeStore() {
  return create<UsageSlice>()((...a) => ({
    ...createUsageSlice(...a),
  }));
}

describe('usageSlice', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('initializes counters to zero and pointers to null', () => {
    const s = store.getState();
    expect(s.firstSeenAt).toBeNull();
    expect(s.lastSeenAt).toBeNull();
    expect(s.visitDays).toEqual([]);
    expect(s.reconRuns).toBe(0);
    expect(s.exportsCsv).toBe(0);
    expect(s.exportsXlsx).toBe(0);
    expect(s.datasetImports).toBe(0);
  });

  it('recordVisit sets firstSeenAt once and updates lastSeenAt each call', () => {
    store.getState().recordVisit(new Date('2026-07-01T10:00:00Z'));
    const first = store.getState().firstSeenAt;
    store.getState().recordVisit(new Date('2026-07-02T10:00:00Z'));
    const s = store.getState();
    expect(s.firstSeenAt).toBe(first);
    expect(s.lastSeenAt).not.toBe(first);
  });

  it('visitDays contains unique local calendar days', () => {
    store.getState().recordVisit(new Date('2026-07-01T10:00:00Z'));
    store.getState().recordVisit(new Date('2026-07-01T18:00:00Z'));
    store.getState().recordVisit(new Date('2026-07-03T09:00:00Z'));
    // Only 2 distinct days (though local timezone can shift the exact strings;
    // the invariant is uniqueness, and count of 2 for these three inputs).
    expect(store.getState().visitDays.length).toBe(2);
  });

  it('recordReconRun increments monotonically', () => {
    store.getState().recordReconRun();
    store.getState().recordReconRun();
    store.getState().recordReconRun();
    expect(store.getState().reconRuns).toBe(3);
  });

  it('recordExport bumps the right counter per format', () => {
    store.getState().recordExport('csv');
    store.getState().recordExport('csv');
    store.getState().recordExport('xlsx');
    const s = store.getState();
    expect(s.exportsCsv).toBe(2);
    expect(s.exportsXlsx).toBe(1);
  });

  it('recordDatasetImport increments', () => {
    store.getState().recordDatasetImport();
    expect(store.getState().datasetImports).toBe(1);
  });

  it('resetUsage clears everything', () => {
    const s = store.getState();
    s.recordVisit();
    s.recordReconRun();
    s.recordExport('csv');
    s.recordDatasetImport();
    s.resetUsage();
    const r = store.getState();
    expect(r.firstSeenAt).toBeNull();
    expect(r.lastSeenAt).toBeNull();
    expect(r.visitDays).toEqual([]);
    expect(r.reconRuns).toBe(0);
    expect(r.exportsCsv).toBe(0);
    expect(r.datasetImports).toBe(0);
  });
});
