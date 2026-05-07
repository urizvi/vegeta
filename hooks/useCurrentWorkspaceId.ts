'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getCurrentWorkspaceId,
  getWorkspaceSnapshot,
  subscribeWorkspace,
} from '@/lib/workspace';

/**
 * React hook that subscribes to the current workspace id.
 * Returns null on first render, then the resolved id once
 * `getCurrentWorkspaceId()` finishes (auto-falls-back to Default).
 */
export function useCurrentWorkspaceId(): string | null {
  const id = useSyncExternalStore(subscribeWorkspace, getWorkspaceSnapshot, () => null);

  useEffect(() => {
    if (id) return;
    // Kick the lazy resolver — `getCurrentWorkspaceId` will notify subscribers
    // when it lands.
    getCurrentWorkspaceId().catch(() => {
      // Errors surface in the component tree via the existing pages.
    });
  }, [id]);

  return id;
}
