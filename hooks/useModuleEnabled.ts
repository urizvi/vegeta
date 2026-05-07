'use client';

import { useWorkspaceSettings, type ModulesEnabled } from './useWorkspaceSettings';

/**
 * Returns whether the named module is enabled in the current workspace.
 * Defaults to `true` until settings resolve so first paint matches the
 * sales-default configuration.
 */
export function useModuleEnabled(name: keyof ModulesEnabled): boolean {
  return useWorkspaceSettings().modulesEnabled[name];
}
