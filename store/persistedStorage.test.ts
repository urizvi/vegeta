import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGuardedStorage,
  getStorageState,
  subscribeStorageState,
} from './persistedStorage';

// Minimal fake Storage that satisfies the DOM Storage interface.
class FakeStorage implements Storage {
  private map = new Map<string, string>();
  private throwOnSet: Error | null = null;

  makeQuotaExceededOnSet(err: Error) { this.throwOnSet = err; }
  clearThrow() { this.throwOnSet = null; }

  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void {
    if (this.throwOnSet) throw this.throwOnSet;
    this.map.set(k, v);
  }
}

describe('createGuardedStorage', () => {
  let backing: FakeStorage;

  beforeEach(() => {
    backing = new FakeStorage();
  });

  afterEach(() => {
    // Nothing to clean up — status is module-scoped and we reset it via
    // subsequent creates in tests where it matters.
  });

  it('reads and writes through the backing when healthy', () => {
    const s = createGuardedStorage({ backing });
    s.setItem('k', 'v');
    expect(backing.getItem('k')).toBe('v');
    expect(s.getItem('k')).toBe('v');
  });

  it('falls back to memory when backing throws QuotaExceededError on write', () => {
    const s = createGuardedStorage({ backing });
    backing.makeQuotaExceededOnSet(new Error('QuotaExceededError'));
    s.setItem('k', 'v');
    // Backing didn't get it because it threw.
    expect(backing.getItem('k')).toBeNull();
    // But the adapter still reports it back (from memory).
    expect(s.getItem('k')).toBe('v');
    expect(getStorageState().status).toBe('disabled_quota');
  });

  it('enforces a soft byte cap before writing', () => {
    const s = createGuardedStorage({ backing, softCapBytes: 10 });
    s.setItem('k', '01234567890123456789'); // 20 bytes; > 10 cap.
    expect(backing.getItem('k')).toBeNull();
    expect(s.getItem('k')).toBe('01234567890123456789');
    expect(getStorageState().status).toBe('disabled_quota');
  });

  it('notifies subscribers when status changes', () => {
    const listener = vi.fn();
    const unsub = subscribeStorageState(listener);
    const s = createGuardedStorage({ backing, softCapBytes: 5 });
    s.setItem('k', 'too-big');
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('falls back to memory when no backing is available', () => {
    const s = createGuardedStorage({ backing: null });
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
  });
});
