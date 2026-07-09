// Custom storage adapter for zustand's persist middleware.
//
// Wraps localStorage with two safety rails:
//   1. Soft byte-cap probe before every write — avoids a QuotaExceededError
//      when the store's grown so large it can't fit at all.
//   2. Actual QuotaExceededError catch — falls back to in-memory writes
//      for the rest of the session and surfaces the reason via a small
//      subscribable state so the UI can warn.
//
// We keep the interface as a plain StateStorage so it composes with
// zustand's `createJSONStorage` wrapper.

import type { StateStorage } from 'zustand/middleware';

/** Soft cap in bytes. localStorage's real limit varies by browser (5–10 MB
 *  typically), so we stay well under to leave room for other origins. */
export const DEFAULT_SOFT_CAP_BYTES = 4_000_000;

export type StorageStatus = 'ok' | 'disabled_quota' | 'disabled_unavailable';

interface StorageState {
  status: StorageStatus;
  reason?: string;
}

const state: StorageState = { status: 'ok' };
const listeners = new Set<(s: StorageState) => void>();

/** Read-only snapshot for UI. */
export function getStorageState(): StorageState {
  return { ...state };
}

/** Subscribe to storage-status changes. Returns an unsubscribe. */
export function subscribeStorageState(listener: (s: StorageState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStatus(next: StorageStatus, reason?: string) {
  if (state.status === next && state.reason === reason) return;
  state.status = next;
  state.reason = reason;
  const snapshot = { ...state };
  for (const l of listeners) l(snapshot);
}

interface Options {
  softCapBytes?: number;
  /** Injectable for tests. Defaults to window.localStorage in the browser. */
  backing?: Storage | null;
}

/** In-memory Storage fallback that satisfies the DOM Storage interface. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

export function createGuardedStorage(opts: Options = {}): StateStorage {
  const softCap = opts.softCapBytes ?? DEFAULT_SOFT_CAP_BYTES;
  const memory = new MemoryStorage();

  let backing: Storage | null;
  if (opts.backing !== undefined) {
    backing = opts.backing;
  } else if (typeof window !== 'undefined' && window.localStorage) {
    try {
      // Probe: in some contexts (Safari private mode) window.localStorage is
      // defined but throws on write.
      window.localStorage.setItem('__waferiq_probe__', '1');
      window.localStorage.removeItem('__waferiq_probe__');
      backing = window.localStorage;
    } catch (err) {
      backing = null;
      setStatus('disabled_unavailable', describe(err));
    }
  } else {
    backing = null;
  }

  return {
    getItem(name) {
      if (backing) {
        try { return backing.getItem(name); } catch { /* fall through */ }
      }
      return memory.getItem(name);
    },

    setItem(name, value) {
      if (!backing) {
        memory.setItem(name, value);
        return;
      }
      const byteSize = value.length; // rough approximation; UTF-16 in localStorage
      if (byteSize > softCap) {
        setStatus('disabled_quota',
          `Persisted state (${formatBytes(byteSize)}) exceeded the ${formatBytes(softCap)} soft cap.`);
        backing = null;
        memory.setItem(name, value);
        return;
      }
      try {
        backing.setItem(name, value);
      } catch (err) {
        setStatus('disabled_quota', describe(err));
        backing = null;
        memory.setItem(name, value);
      }
    },

    removeItem(name) {
      if (backing) {
        try { backing.removeItem(name); } catch { /* fall through */ }
      }
      memory.removeItem(name);
    },
  };
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
