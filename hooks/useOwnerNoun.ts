'use client';

import { useWorkspaceSettings } from './useWorkspaceSettings';

/**
 * Per-workspace label for the account owner role (Owner / Rep / Agent /
 * Case Manager). Defaults to "Owner" until settings resolve.
 */
export function useOwnerNoun(): string {
  return useWorkspaceSettings().ownerNoun;
}
