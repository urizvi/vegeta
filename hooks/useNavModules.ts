'use client';

import { MODULE_MANIFEST, type ModuleManifestEntry } from '@/modules/manifest';
import type { EntitlementMap } from '@/lib/entitlements';
import { useEntitlements } from './useEntitlements';
import { useWorkspaceSettings } from './useWorkspaceSettings';

/** Pure: entitled AND modulesEnabled. Exported for tests. */
export function visibleModules(
  ents: EntitlementMap,
  enabled: Record<'tasks' | 'territory', boolean>,
): ModuleManifestEntry[] {
  return MODULE_MANIFEST.filter((m) => ents[m.key] && enabled[m.key]);
}

/** Add-on modules that should appear in nav for the current workspace. */
export function useNavModules(): ModuleManifestEntry[] {
  const ents = useEntitlements();
  const { modulesEnabled } = useWorkspaceSettings();
  return visibleModules(ents, {
    tasks: modulesEnabled.tasks,
    territory: modulesEnabled.territory,
  });
}
