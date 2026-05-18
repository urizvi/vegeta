import type { ModuleKey } from '@/lib/entitlements';

export interface ModuleManifestEntry {
  key: ModuleKey;
  /** Label shown in nav (consumed by nav — Task 7). */
  navLabel: string;
  /** Primary nav destination (consumed by nav — Task 7). */
  navHref: string;
  /** Route prefixes whose access is gated by this module's entitlement. */
  routePrefixes: string[];
}

export const MODULE_MANIFEST: readonly ModuleManifestEntry[] = Object.freeze([
  {
    key: 'tasks',
    navLabel: 'Tasks',
    navHref: '/tasks',
    routePrefixes: ['/tasks'],
  },
  {
    key: 'territory',
    navLabel: 'Territory',
    navHref: '/territory',
    routePrefixes: ['/territory', '/teams'],
  },
]);

/** Every route prefix that requires an entitlement. */
export function addOnRoutes(): string[] {
  return MODULE_MANIFEST.flatMap((m) => m.routePrefixes);
}

/** Which module gates a given pathname, or null if it is Core/ungated. */
export function moduleForPath(pathname: string): ModuleKey | null {
  for (const m of MODULE_MANIFEST) {
    if (m.routePrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return m.key;
    }
  }
  return null;
}
