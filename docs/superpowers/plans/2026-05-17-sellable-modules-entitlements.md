# Sellable Modules: Entitlements & Module Seams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Accounts the required base and gate Tasks and Territory&Team as server-enforced, separately-sellable paid modules.

**Architecture:** A new server-authoritative, default-deny `workspace_entitlements` source decides module *access* (Directus policies + route gate + conditional hydration + nav). The existing client `modulesEnabled` toggle is demoted to a show/hide preference consulted only when a module is already entitled. CI-enforced ESLint import boundaries lock the Core ← Tasks / Core ← Territory dependency direction, with `membersSlice` reclassified as Core.

**Tech Stack:** Next.js 16, React 19, Zustand 5, Directus (REST, `NEXT_PUBLIC_DIRECTUS_URL`), Vitest + @testing-library/react (added in Task 0), ESLint flat config.

**Spec:** `docs/superpowers/specs/2026-05-17-sellable-modules-entitlements-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.mts` (create) | Test runner config (jsdom env) |
| `test/setup.ts` (create) | Testing-library matchers + fetch reset |
| `lib/entitlements.ts` (create) | Pure entitlement types + `resolveEntitlement` logic |
| `lib/entitlementsClient.ts` (create) | Cached fetch of `workspace_entitlements` (mirrors `useWorkspaceSettings` cache pattern) |
| `hooks/useEntitlements.ts` (create) | React hook → resolved entitlement map for current workspace |
| `modules/manifest.ts` (create) | Declarative add-on registry (key, route, nav) + boundary classification map |
| `components/ModuleGate.tsx` (create) | Client wrapper: redirect to `/upgrade` when not entitled |
| `app/upgrade/page.tsx` + `app/upgrade/UpgradeClient.tsx` (create) | Upsell landing for un-entitled modules |
| `hooks/useNavModules.ts` (create) | Visible add-on nav entries = entitled AND modulesEnabled |
| `lib/entitlementsAdmin.ts` (create) | `buildEntitlementPatch` + owner-gate predicate + `setEntitlement` write |
| `app/tasks/TasksClient.tsx`, `app/territory/TerritoryClient.tsx`, `app/teams/TeamsClient.tsx` (modify) | Wrap in `<ModuleGate>` |
| `hooks/useDirectusAccounts.ts` (modify) | Skip add-on collection fetches when not entitled |
| `components/tasks/TasksApp.tsx`, `components/territory/toolbar/Toolbar.tsx`, `components/accounts/AccountsToolbar.tsx`, `components/teams/TeamsAdminView.tsx` (modify) | Render add-on nav links via `useNavModules` |
| `components/settings/WorkspaceSettingsForm.tsx` (modify) | Owner-only entitlement admin section |
| `eslint.config.mjs` (modify) | `no-restricted-imports` boundary zones |
| `scripts/bootstrap-directus.mjs` (modify) | Create `workspace_entitlements` collection + default-deny access policies |
| `package.json` (modify) | `test` script + dev deps |

---

## Task 0: Test Infrastructure

No test runner exists today (`package.json` has no `test` script). TDD requires one.

**Files:**
- Create: `vitest.config.mts`
- Create: `test/setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Install dev dependencies**

```bash
npm i -D vitest@^2 @vitest/coverage-v8@^2 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6
```

- [ ] **Step 2: Create `vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 3: Install the react plugin (needed by vitest config above)**

```bash
npm i -D @vitejs/plugin-react@^4
```

- [ ] **Step 4: Create `test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

- [ ] **Step 5: Add the `test` script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Add a smoke test to verify the harness**

Create `test/smoke.test.ts`:

```ts
import { expect, it } from 'vitest';

it('runs the test harness', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run it**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.mts test/setup.ts test/smoke.test.ts
git commit -m "test: add vitest + testing-library harness"
```

---

## Task 1: Entitlement Resolver (pure logic)

The default-deny rule lives in one pure function so every layer agrees.

**Files:**
- Create: `lib/entitlements.ts`
- Test: `lib/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/entitlements.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveEntitlement, type EntitlementRow } from './entitlements';

const NOW = Date.parse('2026-05-17T00:00:00Z');
const row = (p: Partial<EntitlementRow>): EntitlementRow => ({
  module: 'tasks', status: 'active', expires_at: null, ...p,
});

describe('resolveEntitlement', () => {
  it('missing row is not entitled (default deny)', () => {
    expect(resolveEntitlement(undefined, NOW)).toBe(false);
  });
  it('active with no expiry is entitled', () => {
    expect(resolveEntitlement(row({ status: 'active' }), NOW)).toBe(true);
  });
  it('disabled is never entitled', () => {
    expect(resolveEntitlement(row({ status: 'disabled' }), NOW)).toBe(false);
  });
  it('trial with future expiry is entitled', () => {
    expect(resolveEntitlement(row({ status: 'trial', expires_at: '2026-06-01T00:00:00Z' }), NOW)).toBe(true);
  });
  it('trial with past expiry is not entitled', () => {
    expect(resolveEntitlement(row({ status: 'trial', expires_at: '2026-05-01T00:00:00Z' }), NOW)).toBe(false);
  });
  it('active with past expiry is not entitled', () => {
    expect(resolveEntitlement(row({ status: 'active', expires_at: '2026-05-01T00:00:00Z' }), NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entitlements`
Expected: FAIL — cannot find module `./entitlements`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/entitlements.ts`:

```ts
/** Paid add-on modules. Accounts (Core) is always on and has no key. */
export type ModuleKey = 'tasks' | 'territory';

export type EntitlementStatus = 'active' | 'trial' | 'disabled';

export interface EntitlementRow {
  module: ModuleKey;
  status: EntitlementStatus;
  expires_at: string | null; // ISO timestamp
}

/**
 * Single source of truth for "is this module accessible?".
 * Default-deny: absent row ⇒ false. `disabled` ⇒ false. Any non-null
 * `expires_at` in the past ⇒ false regardless of status.
 */
export function resolveEntitlement(
  row: EntitlementRow | undefined,
  now: number = Date.now(),
): boolean {
  if (!row) return false;
  if (row.status === 'disabled') return false;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
  return row.status === 'active' || row.status === 'trial';
}

export type EntitlementMap = Record<ModuleKey, boolean>;

/** Resolve a list of rows into a complete, default-deny map. */
export function resolveEntitlementMap(
  rows: EntitlementRow[],
  now: number = Date.now(),
): EntitlementMap {
  const byModule = new Map(rows.map((r) => [r.module, r]));
  return {
    tasks: resolveEntitlement(byModule.get('tasks'), now),
    territory: resolveEntitlement(byModule.get('territory'), now),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entitlements`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/entitlements.ts lib/entitlements.test.ts
git commit -m "feat(entitlements): default-deny resolver"
```

---

## Task 2: Cached Entitlements Client + Hook

Mirror the exact cache/`useSyncExternalStore` pattern in `hooks/useWorkspaceSettings.ts`.

**Files:**
- Create: `lib/entitlementsClient.ts`
- Create: `hooks/useEntitlements.ts`
- Test: `lib/entitlementsClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/entitlementsClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEntitlementRows } from './entitlementsClient';

afterEach(() => vi.unstubAllGlobals());

describe('fetchEntitlementRows', () => {
  it('returns rows for the workspace', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ module: 'tasks', status: 'active', expires_at: null }] }),
    })));
    const rows = await fetchEntitlementRows('ws1');
    expect(rows).toEqual([{ module: 'tasks', status: 'active', expires_at: null }]);
  });

  it('returns [] (default deny) when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));
    expect(await fetchEntitlementRows('ws1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entitlementsClient`
Expected: FAIL — cannot find module `./entitlementsClient`.

- [ ] **Step 3: Write `lib/entitlementsClient.ts`**

```ts
'use client';

import { resolveEntitlementMap, type EntitlementMap, type EntitlementRow } from './entitlements';

const DENY_ALL: EntitlementMap = { tasks: false, territory: false };

export async function fetchEntitlementRows(workspaceId: string): Promise<EntitlementRow[]> {
  const base = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!base) return [];
  const res = await fetch(
    `${base}/items/workspace_entitlements?filter[workspace_id][_eq]=${encodeURIComponent(workspaceId)}&fields=module,status,expires_at&limit=-1`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: EntitlementRow[] };
  return json.data ?? [];
}

const cache = new Map<string, EntitlementMap>();
const inflight = new Map<string, Promise<EntitlementMap>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeEntitlements(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function loadEntitlementsIfNeeded(workspaceId: string): void {
  if (cache.has(workspaceId) || inflight.has(workspaceId)) return;
  const p = fetchEntitlementRows(workspaceId)
    .then((rows) => {
      const map = resolveEntitlementMap(rows);
      cache.set(workspaceId, map);
      return map;
    })
    .catch(() => {
      cache.set(workspaceId, DENY_ALL);
      return DENY_ALL;
    })
    .finally(() => {
      inflight.delete(workspaceId);
      notify();
    });
  inflight.set(workspaceId, p);
}

/** Snapshot. Defaults to DENY_ALL until the row resolves (safe default). */
export function getEntitlementSnapshot(workspaceId: string | null): EntitlementMap {
  if (!workspaceId) return DENY_ALL;
  return cache.get(workspaceId) ?? DENY_ALL;
}

/** Drop cache for a workspace (after admin edits). */
export function invalidateEntitlements(workspaceId: string): void {
  cache.delete(workspaceId);
  inflight.delete(workspaceId);
  notify();
}

export { DENY_ALL };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entitlementsClient`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write `hooks/useEntitlements.ts`**

```ts
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
    if (workspaceId) loadEntitlementsIfNeeded(workspaceId);
  }, [workspaceId]);
  return map;
}

export function useModuleEntitled(module: ModuleKey): boolean {
  return useEntitlements()[module];
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/entitlementsClient.ts lib/entitlementsClient.test.ts hooks/useEntitlements.ts
git commit -m "feat(entitlements): cached client + useEntitlements hook"
```

---

## Task 3: Module Manifest

One declarative registry so nothing hardcodes module knowledge, plus the
boundary classification used by ESLint (Task 4).

**Files:**
- Create: `modules/manifest.ts`
- Test: `modules/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `modules/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MODULE_MANIFEST, addOnRoutes } from './manifest';

describe('MODULE_MANIFEST', () => {
  it('declares tasks and territory add-ons', () => {
    expect(MODULE_MANIFEST.map((m) => m.key).sort()).toEqual(['tasks', 'territory']);
  });
  it('territory owns /territory and /teams', () => {
    const terr = MODULE_MANIFEST.find((m) => m.key === 'territory')!;
    expect(terr.routePrefixes).toEqual(['/territory', '/teams']);
  });
  it('addOnRoutes flattens every gated prefix', () => {
    expect(addOnRoutes().sort()).toEqual(['/tasks', '/teams', '/territory']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- manifest`
Expected: FAIL — cannot find module `./manifest`.

- [ ] **Step 3: Write `modules/manifest.ts`**

```ts
import type { ModuleKey } from '@/lib/entitlements';

export interface ModuleManifestEntry {
  key: ModuleKey;
  /** Label shown in nav. */
  navLabel: string;
  /** Primary nav destination. */
  navHref: string;
  /** Route prefixes whose access is gated by this module's entitlement. */
  routePrefixes: string[];
}

export const MODULE_MANIFEST: ModuleManifestEntry[] = [
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
];

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- manifest`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add modules/manifest.ts modules/manifest.test.ts
git commit -m "feat(modules): declarative module manifest"
```

---

## Task 4: ESLint Boundary Rule

Encode Core ← Tasks / Core ← Territory and Tasks ⊥ Territory. `membersSlice`
is Core (the seam correction).

**Files:**
- Modify: `eslint.config.mjs`
- Create: `test/eslint-boundaries.test.ts`
- Create (fixtures): `test/fixtures/forbidden-import.txt`, `test/fixtures/allowed-import.txt`

- [ ] **Step 1: Write the failing test**

Create `test/eslint-boundaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

async function lintAs(file: string, code: string) {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(code, { filePath: file });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('module boundary lint rule', () => {
  it('forbids Tasks importing Territory internals', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/tasks/Foo.tsx`,
      `import { x } from '@/store/slices/geoSlice';\nexport const y = 1;\n`,
    );
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('allows Tasks importing the Core member slice', async () => {
    const msgs = await lintAs(
      `${process.cwd()}/components/tasks/Foo.tsx`,
      `import { x } from '@/store/slices/membersSlice';\nexport const y = 1;\n`,
    );
    expect(msgs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- eslint-boundaries`
Expected: FAIL — no `no-restricted-imports` message on the first case.

- [ ] **Step 3: Add boundary zones to `eslint.config.mjs`**

Replace the file contents with:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Territory-owned internals. membersSlice is intentionally NOT here — it is
// Core (shared identity directory) per the entitlements seam spec.
const TERRITORY_INTERNALS = [
  "@/store/slices/geoSlice",
  "@/store/slices/geoSelectionSlice",
  "@/store/slices/regionsSlice",
  "@/store/slices/subregionsSlice",
  "@/store/slices/assignmentsSlice",
  "@/store/slices/teamsSlice",
  "@/store/slices/hierarchyLevelsSlice",
  "@/store/slices/mapUiSlice",
];
const TASKS_INTERNALS = ["@/store/slices/tasksSlice", "@/store/slices/tasksSelectors"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["components/tasks/**/*.{ts,tsx}", "app/tasks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...TERRITORY_INTERNALS.map((p) => ({ group: [p], message: "Tasks must not import Territory internals (Core ← Tasks only)." })),
      ] }],
    },
  },
  {
    files: ["components/territory/**/*.{ts,tsx}", "app/territory/**/*.{ts,tsx}", "components/teams/**/*.{ts,tsx}", "app/teams/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...TASKS_INTERNALS.map((p) => ({ group: [p], message: "Territory must not import Tasks internals (Tasks ⊥ Territory)." })),
      ] }],
    },
  },
  {
    files: ["components/accounts/**/*.{ts,tsx}", "app/accounts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...[...TERRITORY_INTERNALS, ...TASKS_INTERNALS].map((p) => ({ group: [p], message: "Core must not import add-on internals." })),
      ] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- eslint-boundaries`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify the existing codebase still lints**

Run: `npm run lint`
Expected: no new `no-restricted-imports` errors. If any legitimate Core→add-on import exists, it is a real seam violation — fix it by routing through a Core-exposed value or note it for review. (Known consumer `components/tasks/TasksApp.tsx` imports `@/store/slices/tasksSelectors` and `@/store/slices/membersSlice` indirectly via barrels; confirm it imports from `@/store/selectors` / `@/store/territoryStore`, which are allowed, not the gated internals directly.)

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs test/eslint-boundaries.test.ts test/fixtures
git commit -m "feat(seam): ESLint module boundary rules (membersSlice is Core)"
```

---

## Task 4b: Resolve discovered Core→Tasks seam violation

**Discovered during Task 4 execution.** The boundary rule correctly flagged a
real pre-existing violation: `components/accounts/detail/AccountDetail.tsx` and
`components/accounts/detail/TasksTab.tsx` (Core) import `useTasksForAccount`
from `@/store/slices/tasksSelectors` (Tasks internal). User decision: **extract
the Tasks tab into the Tasks module; Core mounts it lazily behind the Tasks
entitlement.** Tab disappears for non-Tasks customers (correct per "Accounts is
the base").

**Files:**
- Create: `components/tasks/AccountTasksTab.tsx` (moved from `components/accounts/detail/TasksTab.tsx`)
- Delete: `components/accounts/detail/TasksTab.tsx`
- Modify: `components/accounts/detail/AccountDetail.tsx`

- [ ] Move `TasksTab.tsx` content verbatim to `components/tasks/AccountTasksTab.tsx` (default export `AccountTasksTab`, same `{ accountId }` prop). Tasks-internal imports are allowed there.
- [ ] In `AccountDetail.tsx`: remove `import { useTasksForAccount } from '@/store/slices/tasksSelectors'`, remove `import TasksTab from './TasksTab'`, remove `const tasks = useTasksForAccount(accountId)`. Add `import dynamic from 'next/dynamic'` and `import { useModuleEntitled } from '@/hooks/useEntitlements'`. Add `const AccountTasksTab = dynamic(() => import('@/components/tasks/AccountTasksTab'), { ssr: false });` and `const tasksEntitled = useModuleEntitled('tasks');`.
- [ ] Tasks tab visible iff `tasksOn && tasksEntitled` (entitled AND modulesEnabled, per spec reconciliation). Drop the Tasks tab `count` badge (Core must not read Tasks data; the extracted component already shows its own count header). Update the `tabs` useMemo deps accordingly (remove `tasks.length`, add `tasksEntitled`). Render `{tab === 'tasks' && tasksOn && tasksEntitled && <AccountTasksTab accountId={accountId} />}`.
- [ ] Consult `node_modules/next/dist/docs/` for the Next 16 `next/dynamic` API before writing it (AGENTS.md: this Next version has breaking changes).
- [ ] Verify: `npm run lint` has ZERO `no-restricted-imports` errors; `npx tsc --noEmit` clean; full `npm test` green.
- [ ] Commit (after the Task 4 config/test commit) with: `refactor(seam): extract account Tasks tab into Tasks module behind entitlement`.

---

## Task 5: Route Gate + Upgrade Page

**Files:**
- Create: `components/ModuleGate.tsx`
- Create: `app/upgrade/page.tsx`
- Create: `app/upgrade/UpgradeClient.tsx`
- Modify: `app/tasks/TasksClient.tsx`, `app/territory/TerritoryClient.tsx`, `app/teams/TeamsClient.tsx`
- Test: `components/ModuleGate.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/ModuleGate.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const entitled = { value: false };
vi.mock('@/hooks/useEntitlements', () => ({ useModuleEntitled: () => entitled.value }));

import ModuleGate from './ModuleGate';

describe('ModuleGate', () => {
  it('renders children when entitled', () => {
    entitled.value = true;
    render(<ModuleGate moduleKey="tasks"><div>inside</div></ModuleGate>);
    expect(screen.getByText('inside')).toBeInTheDocument();
  });

  it('redirects to /upgrade when not entitled', () => {
    entitled.value = false;
    render(<ModuleGate moduleKey="tasks"><div>inside</div></ModuleGate>);
    expect(replace).toHaveBeenCalledWith('/upgrade?module=tasks');
    expect(screen.queryByText('inside')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ModuleGate`
Expected: FAIL — cannot find module `./ModuleGate`.

- [ ] **Step 3: Write `components/ModuleGate.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useModuleEntitled } from '@/hooks/useEntitlements';
import type { ModuleKey } from '@/lib/entitlements';

/**
 * Client access gate. Renders children only when the workspace is entitled to
 * `moduleKey`; otherwise redirects to the upgrade page. Server Directus
 * policies are the authoritative gate — this is the UX layer.
 */
export default function ModuleGate({
  moduleKey,
  children,
}: {
  moduleKey: ModuleKey;
  children: React.ReactNode;
}) {
  const entitled = useModuleEntitled(moduleKey);
  const router = useRouter();

  useEffect(() => {
    if (!entitled) router.replace(`/upgrade?module=${moduleKey}`);
  }, [entitled, moduleKey, router]);

  if (!entitled) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ModuleGate`
Expected: PASS, 2 tests.

- [ ] **Step 5: Create the upgrade page**

Create `app/upgrade/page.tsx`:

```tsx
import type { Metadata } from 'next';
import UpgradeClient from './UpgradeClient';

export const metadata: Metadata = { title: 'Upgrade' };

export default function UpgradePage() {
  return <UpgradeClient />;
}
```

Create `app/upgrade/UpgradeClient.tsx`:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const COPY: Record<string, { title: string; blurb: string }> = {
  tasks: { title: 'Tasks', blurb: 'Track follow-ups and to-dos across your accounts.' },
  territory: { title: 'Territory & Team', blurb: 'Map-based territory design and team management.' },
};

export default function UpgradeClient() {
  const module = useSearchParams().get('module') ?? '';
  const c = COPY[module] ?? { title: 'This module', blurb: 'This module is not part of your plan.' };
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-[family-name:var(--font-fraunces)] text-2xl">{c.title} is not in your plan</h1>
      <p className="text-sm text-slate-500">{c.blurb}</p>
      <p className="text-sm text-slate-500">Contact your administrator to add it.</p>
      <Link href="/accounts" className="text-sm text-indigo-600 hover:underline">Back to Accounts</Link>
    </main>
  );
}
```

- [ ] **Step 6: Wrap the three add-on route clients**

In `app/tasks/TasksClient.tsx`, wrap the boundary:

```tsx
'use client';

import dynamic from 'next/dynamic';
import DirectusHydrationBoundary from '@/components/DirectusHydrationBoundary';
import ModuleGate from '@/components/ModuleGate';

const TasksApp = dynamic(() => import('@/components/tasks/TasksApp'), { ssr: false });

export default function TasksClient() {
  return (
    <ModuleGate moduleKey="tasks">
      <DirectusHydrationBoundary>
        <TasksApp />
      </DirectusHydrationBoundary>
    </ModuleGate>
  );
}
```

Apply the identical pattern to `app/territory/TerritoryClient.tsx` and
`app/teams/TeamsClient.tsx`, using `moduleKey="territory"` for **both** (teams
is owned by the territory module per the manifest). Preserve each file's
existing dynamic import target — only add the `ModuleGate` import and wrapper.

- [ ] **Step 7: Verify build + tests**

Run: `npm test -- ModuleGate && npx tsc --noEmit`
Expected: tests PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add components/ModuleGate.tsx components/ModuleGate.test.tsx app/upgrade app/tasks/TasksClient.tsx app/territory/TerritoryClient.tsx app/teams/TeamsClient.tsx
git commit -m "feat(entitlements): route gate + upgrade page"
```

---

## Task 6: Conditional Hydration

Don't fetch add-on collections when not entitled (server denies them anyway;
this removes wasted calls and noisy console warnings). Extract the decision as
a pure, tested function.

**Files:**
- Create: `lib/hydrationPlan.ts`
- Modify: `hooks/useDirectusAccounts.ts`
- Test: `lib/hydrationPlan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/hydrationPlan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldFetch } from './hydrationPlan';

describe('shouldFetch', () => {
  const ents = (tasks: boolean, territory: boolean) => ({ tasks, territory });
  it('always fetches Core collections', () => {
    expect(shouldFetch('accounts', ents(false, false))).toBe(true);
    expect(shouldFetch('members', ents(false, false))).toBe(true);
  });
  it('gates tasks on the tasks entitlement', () => {
    expect(shouldFetch('tasks', ents(false, true))).toBe(false);
    expect(shouldFetch('tasks', ents(true, false))).toBe(true);
  });
  it('gates geo/teams on the territory entitlement', () => {
    expect(shouldFetch('geo_nodes', ents(true, false))).toBe(false);
    expect(shouldFetch('teams', ents(true, true))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hydrationPlan`
Expected: FAIL — cannot find module `./hydrationPlan`.

- [ ] **Step 3: Write `lib/hydrationPlan.ts`**

```ts
import type { EntitlementMap } from './entitlements';

/** Collections owned by each add-on module. Everything else is Core. */
const TERRITORY_COLLECTIONS = new Set([
  'geo_nodes', 'teams', 'hierarchy_levels',
]);
const TASKS_COLLECTIONS = new Set(['tasks']);

export function shouldFetch(collection: string, ents: EntitlementMap): boolean {
  if (TASKS_COLLECTIONS.has(collection)) return ents.tasks;
  if (TERRITORY_COLLECTIONS.has(collection)) return ents.territory;
  return true; // Core
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hydrationPlan`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into `hooks/useDirectusAccounts.ts`**

Add the import near the other lib imports:

```ts
import { shouldFetch } from '@/lib/hydrationPlan';
import { getEntitlementSnapshot } from '@/lib/entitlementsClient';
```

Inside the effect, immediately after `if (!workspaceId) return;`, capture the map:

```ts
    const ents = getEntitlementSnapshot(workspaceId);
```

Then replace the three gated fetch lines so a denied module resolves to the
empty fallback **without a network call**. Replace:

```ts
          getGeoNodes().catch((err: unknown) => {
```

with:

```ts
          (shouldFetch('geo_nodes', ents) ? getGeoNodes() : Promise.resolve({ nodes: [], order: [] })).catch((err: unknown) => {
```

Apply the same wrap to `getTeams()` (fallback `{ teams: [], order: [] }`),
`getHierarchyLevels()` (fallback `{ levels: [], order: [] }`), and `getTasks()`
(fallback `[]`), each guarded by `shouldFetch('teams', ents)`,
`shouldFetch('hierarchy_levels', ents)`, `shouldFetch('tasks', ents)`
respectively. Leave the existing `.catch` fallbacks intact.

- [ ] **Step 6: Verify**

Run: `npm test -- hydrationPlan && npx tsc --noEmit`
Expected: tests PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/hydrationPlan.ts lib/hydrationPlan.test.ts hooks/useDirectusAccounts.ts
git commit -m "feat(entitlements): skip un-entitled collection fetches"
```

---

## Task 7: Entitlement-Aware Nav

Add-on nav links currently render unconditionally (or only behind
`modulesEnabled`). Make visibility = entitled AND modulesEnabled, via one hook.

**Files:**
- Create: `hooks/useNavModules.ts`
- Modify: `components/tasks/TasksApp.tsx`, `components/territory/toolbar/Toolbar.tsx`, `components/accounts/AccountsToolbar.tsx`, `components/teams/TeamsAdminView.tsx`
- Test: `hooks/useNavModules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/useNavModules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { visibleModules } from './useNavModules';

describe('visibleModules', () => {
  it('hides a module that is not entitled even if enabled', () => {
    const out = visibleModules({ tasks: false, territory: true }, { tasks: true, territory: true });
    expect(out.map((m) => m.key)).toEqual(['territory']);
  });
  it('hides an entitled module that is disabled via modulesEnabled', () => {
    const out = visibleModules({ tasks: true, territory: true }, { tasks: false, territory: true });
    expect(out.map((m) => m.key)).toEqual(['territory']);
  });
  it('shows a module only when entitled AND enabled', () => {
    const out = visibleModules({ tasks: true, territory: true }, { tasks: true, territory: true });
    expect(out.map((m) => m.key).sort()).toEqual(['tasks', 'territory']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useNavModules`
Expected: FAIL — cannot find module `./useNavModules`.

- [ ] **Step 3: Write `hooks/useNavModules.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useNavModules`
Expected: PASS, 3 tests.

- [ ] **Step 5: Replace the scattered add-on nav links**

In `components/accounts/AccountsToolbar.tsx`, the Territory/Teams/Tasks
`<Link>`s (lines ~74–79) currently render behind ad-hoc `modulesEnabled`
checks. Replace those individual conditionals with a single mapped block.
Add near the other hook imports:

```tsx
import { useNavModules } from '@/hooks/useNavModules';
```

In the component body:

```tsx
  const navModules = useNavModules();
```

Replace the Territory/Teams/Tasks `<Link>` cluster with:

```tsx
  {navModules.map((m) => (
    <Link key={m.key} href={m.navHref} className={navLink}>{m.navLabel}</Link>
  ))}
```

Keep the `/accounts` link (Core, always present) and any non-module links
untouched. The `territory` manifest entry covers the Territory link; render the
Teams link only when `territory` is visible:

```tsx
  {navModules.some((m) => m.key === 'territory') && (
    <Link href="/teams" className={navLink}>Teams</Link>
  )}
```

- [ ] **Step 6: Apply the same pattern to the other three toolbars**

Repeat Step 5's pattern in:
- `components/tasks/TasksApp.tsx` (lines ~99–112: territory/accounts/teams links; drop the local `territoryEnabled`/`tasksEnabled` `useModuleEnabled` calls in favor of `useNavModules`)
- `components/territory/toolbar/Toolbar.tsx` (lines ~173–175: replace `{tasksEnabled && <Link href="/tasks">}` and the Teams link with the mapped block + the territory-gated Teams link)
- `components/teams/TeamsAdminView.tsx` (lines ~49–66: territory/accounts/tasks links)

In each, remove now-unused `useModuleEnabled` imports/locals if nothing else
uses them; leave the always-present `/accounts` link in place.

- [ ] **Step 7: Verify**

Run: `npm test -- useNavModules && npm run lint && npx tsc --noEmit`
Expected: tests PASS; lint clean (no boundary violations introduced — `useNavModules` lives in `hooks/`, allowed everywhere); no type errors.

- [ ] **Step 8: Commit**

```bash
git add hooks/useNavModules.ts hooks/useNavModules.test.ts components/tasks/TasksApp.tsx components/territory/toolbar/Toolbar.tsx components/accounts/AccountsToolbar.tsx components/teams/TeamsAdminView.tsx
git commit -m "feat(entitlements): entitlement-aware module nav"
```

---

## Task 8: Internal Admin Toggle

Owner-only section in workspace settings to set per-module status + trial
expiry. No payment provider.

**Files:**
- Create: `lib/entitlementsAdmin.ts`
- Modify: `components/settings/WorkspaceSettingsForm.tsx`
- Test: `lib/entitlementsAdmin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/entitlementsAdmin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildEntitlementPatch, isWorkspaceOwner } from './entitlementsAdmin';

describe('buildEntitlementPatch', () => {
  it('builds an active patch with null expiry', () => {
    expect(buildEntitlementPatch('ws1', 'tasks', 'active', '')).toEqual({
      workspace_id: 'ws1', module: 'tasks', status: 'active', expires_at: null,
    });
  });
  it('passes through a trial expiry date as ISO', () => {
    const p = buildEntitlementPatch('ws1', 'territory', 'trial', '2026-06-01');
    expect(p.status).toBe('trial');
    expect(p.expires_at).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('isWorkspaceOwner', () => {
  it('true only for the owner role', () => {
    expect(isWorkspaceOwner('owner')).toBe(true);
    expect(isWorkspaceOwner('member')).toBe(false);
    expect(isWorkspaceOwner(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entitlementsAdmin`
Expected: FAIL — cannot find module `./entitlementsAdmin`.

- [ ] **Step 3: Write `lib/entitlementsAdmin.ts`**

```ts
'use client';

import type { EntitlementStatus, ModuleKey } from './entitlements';
import { invalidateEntitlements } from './entitlementsClient';

export interface EntitlementPatch {
  workspace_id: string;
  module: ModuleKey;
  status: EntitlementStatus;
  expires_at: string | null;
}

export function buildEntitlementPatch(
  workspaceId: string,
  module: ModuleKey,
  status: EntitlementStatus,
  expiryDate: string, // '' or 'YYYY-MM-DD' from a date input
): EntitlementPatch {
  return {
    workspace_id: workspaceId,
    module,
    status,
    expires_at: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`).toISOString() : null,
  };
}

export function isWorkspaceOwner(role: string | null): boolean {
  return role === 'owner';
}

/**
 * Upsert a workspace_entitlements row (one row per workspace+module). Looks up
 * an existing row id then PATCHes, else POSTs — mirrors
 * `lib/workspace.ts:updateWorkspaceSettings`.
 */
export async function setEntitlement(patch: EntitlementPatch): Promise<void> {
  const base = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!base) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const lookup = await fetch(
    `${base}/items/workspace_entitlements?filter[workspace_id][_eq]=${encodeURIComponent(patch.workspace_id)}&filter[module][_eq]=${patch.module}&fields=id&limit=1`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!lookup.ok) throw new Error(`entitlement lookup failed: ${lookup.status}`);
  const json = (await lookup.json()) as { data?: Array<{ id: string }> };
  const rowId = json.data?.[0]?.id;
  const res = rowId
    ? await fetch(`${base}/items/workspace_entitlements/${encodeURIComponent(rowId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: patch.status, expires_at: patch.expires_at }),
      })
    : await fetch(`${base}/items/workspace_entitlements`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
  if (!res.ok) throw new Error(`save entitlement failed: ${res.status}`);
  invalidateEntitlements(patch.workspace_id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entitlementsAdmin`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the owner-only section to `WorkspaceSettingsForm.tsx`**

Read `components/settings/WorkspaceSettingsForm.tsx` to match its existing
section markup/styling. Add a new section (only one of its kind) titled
"Modules & billing" rendered **only** when the current user's workspace role is
owner. Use the existing role source already present in that form if one exists;
otherwise derive it from `workspace_members` using the same fetch style as
`lib/workspace.ts:getMyWorkspaces`. For each `ModuleKey` (`tasks`,
`territory`) render: a `<select>` bound to status (`active` / `trial` /
`disabled`) and a date `<input type="date">` for trial expiry, plus a Save
button that calls:

```tsx
import { buildEntitlementPatch, isWorkspaceOwner, setEntitlement } from '@/lib/entitlementsAdmin';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
// ...
const workspaceId = useCurrentWorkspaceId();
// onSave for a module:
await setEntitlement(buildEntitlementPatch(workspaceId!, module, status, expiryDate));
```

Gate the whole section behind `isWorkspaceOwner(role)`. Follow the form's
existing save-feedback pattern (e.g. its toast/inline-status convention) — do
not invent a new one.

- [ ] **Step 6: Verify**

Run: `npm test -- entitlementsAdmin && npm run lint && npx tsc --noEmit`
Expected: tests PASS; lint clean; no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/entitlementsAdmin.ts lib/entitlementsAdmin.test.ts components/settings/WorkspaceSettingsForm.tsx
git commit -m "feat(entitlements): owner-only module admin in workspace settings"
```

---

## Task 9: Directus Backend — Collection + Default-Deny Policies

The authoritative gate. Directus config cannot be unit-tested here; this task
edits the existing idempotent bootstrap script and includes a manual
verification checklist.

**Files:**
- Modify: `scripts/bootstrap-directus.mjs`

- [ ] **Step 1: Read the existing script to match its idempotent pattern**

Read `scripts/bootstrap-directus.mjs`. Note how it creates a collection +
fields idempotently (skip-if-exists) and how it creates/updates access
policies for existing collections (`teams`, `geo_nodes`, etc.). The new code
must follow that exact helper style and admin-token auth.

- [ ] **Step 2: Add the `workspace_entitlements` collection (idempotent)**

Following the script's existing "create collection if missing" helper, add a
`workspace_entitlements` collection with fields:
- `id` (uuid, primary, matching the pattern other collections use)
- `workspace_id` (M2O → `workspaces`, required, on-delete CASCADE — match the
  existing FK helper used for other workspace-scoped collections)
- `module` (string, required) — values `tasks` | `territory`
- `status` (string, required, default `'disabled'`) — `active|trial|disabled`
- `expires_at` (timestamp, nullable)

Skip creation if the collection already exists (same guard the script uses for
`geo_nodes`).

- [ ] **Step 3: Add default-deny read policies for add-on collections**

Using the script's existing policy/permission helper, ensure the
non-administrator app policy grants **read** on `workspace_entitlements`
filtered to the user's workspace (so the client can resolve its own
entitlements), and changes the **read** permission on add-on collections to
require an active entitlement. For each add-on collection
(`tasks`; `geo_nodes`, `teams`, `hierarchy_levels`, plus their dependents
`regions`-equivalent/`subregions`/`assignments` if present as collections),
set the read permission filter to the conjunction of the existing
workspace-scope filter AND existence of a non-expired, non-disabled
`workspace_entitlements` row for the owning module. Express the entitlement
predicate with Directus relational filter syntax against
`workspace_entitlements` (filter on `workspace_id` = current workspace,
`module` = the owning module, `status` `_neq` `disabled`, and
`expires_at` `_null` OR `_gt` `$NOW`). Keep the change idempotent: re-running
the script must converge to the same policy, not stack duplicates (mirror how
the script already re-applies `teams`/`geo_nodes` permissions).

- [ ] **Step 4: Run the bootstrap script against a dev Directus**

Run: `node scripts/bootstrap-directus.mjs`
Expected output: log lines showing `workspace_entitlements` created (or
"exists, skipping") and add-on read policies updated, ending with the script's
existing success line. No errors.

- [ ] **Step 5: Manual verification checklist (record results in the commit body)**

With a dev workspace that has **no** entitlement rows:
1. `GET /items/tasks` as the app (non-admin) user → `data: []` (zero rows), not 403-with-rows.
2. `GET /items/geo_nodes` → `data: []`.
3. Insert `workspace_entitlements { module: 'tasks', status: 'active', expires_at: null }` for that workspace via Directus admin.
4. `GET /items/tasks` → now returns the workspace's task rows.
5. Set that row `status: 'disabled'` → `GET /items/tasks` → `data: []` again.
6. `GET /items/accounts` (Core) → returns rows in all of the above states (never gated).

- [ ] **Step 6: Re-run the script to prove idempotency**

Run: `node scripts/bootstrap-directus.mjs`
Expected: "exists, skipping" for the collection; policies converge with no
duplicate permission rows (verify in Directus admin → Policies that each add-on
collection has exactly one read permission).

- [ ] **Step 7: Commit**

```bash
git add scripts/bootstrap-directus.mjs
git commit -m "feat(entitlements): workspace_entitlements collection + default-deny policies"
```

---

## Task 10: Docs & Final Verification

**Files:**
- Modify: `.claude/docs/task-summary.md`

- [ ] **Step 1: Full verification sweep**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all tests pass; lint clean; no type errors; production build
succeeds.

- [ ] **Step 2: Spec coverage self-check**

Confirm each spec section maps to a task: module model (T3), entitlements data
model (T1/T9), `useEntitlements` (T2), server policies (T9), route gate (T5),
conditional hydration (T6), nav (T7), `modulesEnabled` reconciliation (T7
`visibleModules`), seam ESLint + membersSlice-as-Core (T4), admin grant (T8).
Note any gap and add a task before proceeding.

- [ ] **Step 3: Append to `.claude/docs/task-summary.md`**

Add a dated section summarizing: entitlements shipped (default-deny, server +
route + hydration + nav layers), `modulesEnabled` demoted to display-only,
ESLint boundaries with `membersSlice` reclassified Core, billing deferred.

- [ ] **Step 4: Commit**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log sellable-modules entitlements implementation"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section is mapped (see Task 10 Step 2). Billing
  is explicitly out of scope per the spec; no task added for it (correct).
- **Type consistency:** `ModuleKey` (`'tasks'|'territory'`), `EntitlementMap`,
  `EntitlementRow`, `resolveEntitlement`/`resolveEntitlementMap`,
  `getEntitlementSnapshot`, `visibleModules`, `buildEntitlementPatch`,
  `setEntitlement`, `MODULE_MANIFEST` are defined once and reused with matching
  signatures across tasks.
- **No placeholders:** Task 9 is config (not code) and is intentionally
  prescriptive with a manual checklist rather than fake unit tests — Directus
  policy state cannot be asserted from this repo's test harness.
- **Seam correction:** realized as ESLint classification (Task 4) per the
  approved minimal-moves decision — `membersSlice` deliberately excluded from
  `TERRITORY_INTERNALS`.
