'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useCurrentWorkspaceId } from './useCurrentWorkspaceId';
import {
  DENY_ALL,
  getEntitlementSnapshot,
  loadEntitlementsIfNeeded,
  subscribeEntitlements,
} from '@/lib/entitlementsClient';
import type { EntitlementMap, ModuleKey } from '@/lib/entitlements';

export function useEntitlements(): EntitlementMap {
  const workspaceId = useCurrentWorkspaceId();
  const map = useSyncExternalStore(
    subscribeEntitlements,
    () => getEntitlementSnapshot(workspaceId),
    () => DENY_ALL,
  );
  useEffect(() => {
    if (!workspaceId) return;
    loadEntitlementsIfNeeded(workspaceId);
  }, [workspaceId]);
  return map;
}

export function useModuleEntitled(module: ModuleKey): boolean {
  return useEntitlements()[module];
}
