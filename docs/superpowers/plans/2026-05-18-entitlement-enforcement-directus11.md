# Entitlement Enforcement (Directus-11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make server-side entitlement enforcement correct on Directus 11.3.5 by gating add-on reads via a denormalized `workspaces.<module>_entitled_until` timestamp + a simple M2O filter, with an idempotent permission dedup that also closes the Core cross-workspace `{}` leak.

**Architecture:** `workspace_entitlements` stays the source of truth and client read path. `setEntitlement` additionally projects the row onto a scalar `workspaces` column via the pure `entitledUntil()` rule. Bootstrap adds the columns, rewrites the add-on read filter to `workspace_id.<module>_entitled_until _gt $NOW`, makes `ensurePermission` write exactly one rule per policy+collection+action, and recomputes mirrors from the source of truth.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest (already configured), Directus 11.3.5 REST, `scripts/bootstrap-directus.mjs` (Node `.mjs`).

**Spec:** `docs/superpowers/specs/2026-05-18-entitlement-enforcement-directus11-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/entitlements.ts` (modify) | Add pure `entitledUntil(status, expiresAt)` projection |
| `lib/entitlements.test.ts` (modify) | Truth-table tests for `entitledUntil` |
| `lib/entitlementsAdmin.ts` (modify) | `setEntitlement` also PATCHes the workspace mirror column |
| `lib/entitlementsAdmin.test.ts` (modify) | `setEntitlement` two-write + ordering tests |
| `scripts/bootstrap-directus.mjs` (modify) | Mirror columns, Directus-11 filter, idempotent dedup, recompute pass, checklist |
| `.claude/docs/task-summary.md` (modify) | Log the redesign + resolve the old known-limitation |

No new files. Vitest harness already exists (merged on `accounts-crud`). Run a single test file with `npm test -- <substring>`; tests use explicit `import { … } from 'vitest'` (globals OFF).

---

## Task 1: `entitledUntil` pure projection helper

**Files:**
- Modify: `lib/entitlements.ts`
- Test: `lib/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/entitlements.test.ts` (keep existing imports/tests; add `entitledUntil` to the existing `./entitlements` import line, and add this block):

```ts
import { entitledUntil } from './entitlements';

describe('entitledUntil', () => {
  const SENTINEL = '9999-12-31T00:00:00.000Z';
  it('disabled → null regardless of expiry', () => {
    expect(entitledUntil('disabled', null)).toBe(null);
    expect(entitledUntil('disabled', '2026-06-01T00:00:00.000Z')).toBe(null);
  });
  it('active with no expiry → far-future sentinel', () => {
    expect(entitledUntil('active', null)).toBe(SENTINEL);
  });
  it('trial with no expiry → far-future sentinel', () => {
    expect(entitledUntil('trial', null)).toBe(SENTINEL);
  });
  it('active with expiry → that expiry', () => {
    expect(entitledUntil('active', '2026-06-01T23:59:59.999Z')).toBe('2026-06-01T23:59:59.999Z');
  });
  it('trial with future expiry → that expiry', () => {
    expect(entitledUntil('trial', '2027-01-01T00:00:00.000Z')).toBe('2027-01-01T00:00:00.000Z');
  });
  it('trial with past expiry → that (past) expiry, not null', () => {
    expect(entitledUntil('trial', '2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entitlements`
Expected: FAIL — `entitledUntil` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `lib/entitlements.ts` (after `resolveEntitlementMap`):

```ts
/** Far-future sentinel meaning "entitled with no expiry". */
export const PERPETUAL_SENTINEL = '9999-12-31T00:00:00.000Z';

/**
 * Project an entitlement (status + expires_at) onto the value stored in the
 * denormalized `workspaces.<module>_entitled_until` enforcement column.
 * `disabled` ⇒ null (deny). `active`/`trial` ⇒ the expiry, or the perpetual
 * sentinel when there is none. A past timestamp is returned as-is — the
 * Directus permission filter (`_gt $NOW`) denies it without a scheduler.
 */
export function entitledUntil(
  status: EntitlementStatus,
  expiresAt: string | null,
): string | null {
  if (status === 'disabled') return null;
  return expiresAt ?? PERPETUAL_SENTINEL;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entitlements`
Expected: PASS (existing entitlements tests + 6 new `entitledUntil` cases).

- [ ] **Step 5: Commit**

```bash
git add lib/entitlements.ts lib/entitlements.test.ts
git commit -m "feat(entitlements): entitledUntil projection helper"
```

---

## Task 2: `setEntitlement` writes the workspace mirror

**Files:**
- Modify: `lib/entitlementsAdmin.ts`
- Test: `lib/entitlementsAdmin.test.ts`

Context: `setEntitlement` currently upserts `workspace_entitlements` then calls `invalidateEntitlements`. It must additionally PATCH `workspaces/<workspace_id>` setting `<module>_entitled_until`, AFTER the source-of-truth upsert succeeds and BEFORE `invalidateEntitlements`.

- [ ] **Step 1: Write the failing test**

Append to `lib/entitlementsAdmin.test.ts` (add `vi` to the `vitest` import if not present; this test mocks `fetch`):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setEntitlement } from './entitlementsAdmin';

afterEach(() => vi.unstubAllGlobals());

describe('setEntitlement writes source-of-truth then workspace mirror', () => {
  it('upserts the entitlement row, then PATCHes workspaces.<module>_entitled_until', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      if (url.includes('/items/workspace_entitlements?')) {
        return { ok: true, json: async () => ({ data: [] }) }; // no existing row → POST path
      }
      return { ok: true, json: async () => ({}) };
    }));

    await setEntitlement({
      workspace_id: 'ws1', module: 'territory', status: 'active', expires_at: null,
    });

    const seq = calls.map((c) => `${c.method} ${c.url.replace(/^https?:\/\/[^/]+/, '')}`);
    // lookup GET, then POST entitlement, then PATCH workspace — in that order.
    const entIdx = seq.findIndex((s) => s.startsWith('POST /items/workspace_entitlements'));
    const wsIdx  = seq.findIndex((s) => s.startsWith('PATCH /items/workspaces/ws1'));
    expect(entIdx).toBeGreaterThanOrEqual(0);
    expect(wsIdx).toBeGreaterThan(entIdx);
    expect(calls[wsIdx].body).toEqual({ territory_entitled_until: '9999-12-31T00:00:00.000Z' });
  });

  it('mirrors a disabled module as null', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && url.includes('/items/workspaces/')) {
        bodies.push(JSON.parse(init.body as string));
      }
      if (url.includes('/items/workspace_entitlements?')) {
        return { ok: true, json: async () => ({ data: [{ id: 'e1' }] }) }; // existing → PATCH path
      }
      return { ok: true, json: async () => ({}) };
    }));
    await setEntitlement({
      workspace_id: 'ws2', module: 'tasks', status: 'disabled', expires_at: null,
    });
    expect(bodies).toEqual([{ tasks_entitled_until: null }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entitlementsAdmin`
Expected: FAIL — no `PATCH /items/workspaces/...` call is made.

- [ ] **Step 3: Implement the second write**

In `lib/entitlementsAdmin.ts`:

(a) Add `entitledUntil` to the existing import from `./entitlements`:

```ts
import { entitledUntil, type EntitlementStatus, type ModuleKey } from './entitlements';
```

(b) In `setEntitlement`, replace the final two lines:

```ts
  if (!res.ok) throw new Error(`save entitlement failed: ${res.status}`);
  invalidateEntitlements(patch.workspace_id);
```

with:

```ts
  if (!res.ok) throw new Error(`save entitlement failed: ${res.status}`);

  // Project onto the denormalized enforcement column the Directus add-on
  // read permission filters on (`workspaces.<module>_entitled_until _gt $NOW`).
  // Written AFTER the source-of-truth row; mirrors lib/entitlements.entitledUntil.
  const mirror = await fetch(
    `${base}/items/workspaces/${encodeURIComponent(patch.workspace_id)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [`${patch.module}_entitled_until`]: entitledUntil(patch.status, patch.expires_at),
      }),
    },
  );
  if (!mirror.ok) throw new Error(`mirror entitlement failed: ${mirror.status}`);
  invalidateEntitlements(patch.workspace_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- entitlementsAdmin`
Expected: PASS (existing `buildEntitlementPatch`/`isWorkspaceOwner` tests + 2 new).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green; no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/entitlementsAdmin.ts lib/entitlementsAdmin.test.ts
git commit -m "feat(entitlements): setEntitlement mirrors entitled_until onto workspace"
```

---

## Task 3: Bootstrap — add `*_entitled_until` columns to `workspaces`

**Files:**
- Modify: `scripts/bootstrap-directus.mjs`

Context: the live `workspaces` collection already exists, so editing the `WORKSPACES_COLLECTION` const only affects fresh installs. Existing instances need explicit idempotent `tryCreateField` calls (the same pattern the Phase 1.1b loop uses for `workspace_id`).

- [ ] **Step 1: Add the two fields to the collection definition**

In `scripts/bootstrap-directus.mjs`, in `WORKSPACES_COLLECTION.fields`, after the `created_at` field object, add:

```js
    {
      field: 'tasks_entitled_until',
      type: 'timestamp',
      meta: { interface: 'datetime', note: 'Enforcement mirror: tasks entitled until this instant (null = denied). Derived from workspace_entitlements.' },
    },
    {
      field: 'territory_entitled_until',
      type: 'timestamp',
      meta: { interface: 'datetime', note: 'Enforcement mirror: territory entitled until this instant (null = denied). Derived from workspace_entitlements.' },
    },
```

- [ ] **Step 2: Add idempotent field creation for existing instances**

In `main()`, immediately AFTER the `console.log('→ Ensuring Default workspace')` block resolves `defaultWorkspaceId` (i.e. right after the `existingDefault` if/else that sets `defaultWorkspaceId`), insert:

```js
  // Enforcement mirror columns (idempotent for already-existing instances).
  // The Directus-11 add-on read permission filter gates on
  // workspaces.<module>_entitled_until _gt $NOW (see ensurePermission).
  console.log('→ Ensuring workspace entitlement mirror columns');
  for (const field of ['tasks_entitled_until', 'territory_entitled_until']) {
    await tryCreateField(token, 'workspaces', {
      field,
      type: 'timestamp',
      meta: { interface: 'datetime', note: 'Enforcement mirror — derived from workspace_entitlements' },
    });
  }
```

- [ ] **Step 3: Syntax check**

Run: `node --check scripts/bootstrap-directus.mjs`
Expected: no output (syntax OK).

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-directus.mjs
git commit -m "feat(bootstrap): add workspaces.*_entitled_until mirror columns"
```

---

## Task 4: Bootstrap — Directus-11-valid add-on read filter

**Files:**
- Modify: `scripts/bootstrap-directus.mjs`

Context: in `ensurePermission`, the `opts.entitlementModule` branch currently builds the invalid O2M-nested filter. Replace it with the M2O→scalar form. `opts.entitlementModule` is the module name (`'tasks'` or `'territory'`); the column is `${module}_entitled_until` (so `geo_nodes`/`teams`/`hierarchy_levels`, whose module is `'territory'`, gate on `territory_entitled_until`; `tasks` on `tasks_entitled_until`).

- [ ] **Step 1: Replace the entitlement filter body**

In `scripts/bootstrap-directus.mjs`, in `ensurePermission`, replace this exact block:

```js
    } else if (opts.entitlementModule) {
      // Combine workspace scope with entitlement check via _and.
      // Requires a non-expired, non-disabled workspace_entitlements row for
      // the owning module.  The relational filter traverses the
      // workspace_entitlements collection via the shared workspace_id field.
      body.permissions = {
        _and: [
          wsFilter,
          {
            workspace_id: {
              workspace_entitlements: {
                _and: [
                  { module:  { _eq: opts.entitlementModule } },
                  { status:  { _neq: 'disabled' } },
                  {
                    _or: [
                      { expires_at: { _null: true } },
                      { expires_at: { _gt: '$NOW' } },
                    ],
                  },
                ],
              },
            },
          },
        ],
      };
    } else {
```

with:

```js
    } else if (opts.entitlementModule) {
      // Directus-11-valid gate: traverse the M2O workspace_id to the scalar
      // enforcement mirror column workspaces.<module>_entitled_until and
      // require it to be strictly after $NOW. null (disabled/none) fails
      // _gt → deny. Perpetual = far-future sentinel. Trial expiry self-
      // enforces at query time (no scheduler). The mirror is kept in sync by
      // lib/entitlementsAdmin.setEntitlement + the recompute pass below.
      body.permissions = {
        _and: [
          wsFilter,
          {
            workspace_id: {
              [`${opts.entitlementModule}_entitled_until`]: { _gt: '$NOW' },
            },
          },
        ],
      };
    } else {
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/bootstrap-directus.mjs`
Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add scripts/bootstrap-directus.mjs
git commit -m "fix(bootstrap): Directus-11 M2O entitlement read filter"
```

---

## Task 5: Bootstrap — idempotent `ensurePermission` (dedup)

**Files:**
- Modify: `scripts/bootstrap-directus.mjs`

Context: the tail of `ensurePermission` does `GET …&limit=1` then PATCH-one-or-POST, which never removes historical duplicate/`{}` rows. Replace with: GET ALL matching rows, DELETE each, POST exactly one canonical rule. This also clears the Core `{}` leak. Per spec, id churn is acceptable; brief zero-rule window during a run is acceptable (admin-run, idempotent).

- [ ] **Step 1: Replace the lookup/upsert tail**

In `scripts/bootstrap-directus.mjs`, in `ensurePermission`, replace this exact block:

```js
  const existing = await api(
    token,
    'GET',
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${encodeURIComponent(collection)}&filter[action][_eq]=${action}&limit=1`,
  );
  if (existing?.[0]) {
    await api(token, 'PATCH', `/permissions/${existing[0].id}`, body);
    console.log(`  ✓ updated ${label}`);
  } else {
    await api(token, 'POST', '/permissions', body);
    console.log(`  ✓ created ${label}`);
  }
}
```

with:

```js
  // Idempotent: collapse to exactly one rule per (policy, collection, action).
  // Historical bootstrap runs accumulated duplicate rows (including
  // unrestricted `{}` reads that nullified the gate AND workspace isolation);
  // delete all then write one canonical rule.
  const existing = await api(
    token,
    'GET',
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${encodeURIComponent(collection)}&filter[action][_eq]=${action}&fields=id&limit=-1`,
  );
  for (const row of existing ?? []) {
    await api(token, 'DELETE', `/permissions/${row.id}`);
  }
  await api(token, 'POST', '/permissions', body);
  console.log(`  ✓ set ${label} (removed ${(existing ?? []).length} prior rule(s))`);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/bootstrap-directus.mjs`
Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add scripts/bootstrap-directus.mjs
git commit -m "fix(bootstrap): idempotent ensurePermission removes duplicate rules"
```

---

## Task 6: Bootstrap — recompute pass + manual checklist

**Files:**
- Modify: `scripts/bootstrap-directus.mjs`

Context: a drift-repair pass that recomputes both mirror columns for every workspace from `workspace_entitlements` (source of truth). Place it AFTER `seedWorkspaceDefaults(token, defaultWorkspaceId, …)` in `main()` (workspaces + columns + entitlements collection all exist by then). The 3-line projection must match `lib/entitlements.entitledUntil`.

- [ ] **Step 1: Add the recompute pass**

In `scripts/bootstrap-directus.mjs` `main()`, immediately AFTER the line `await seedWorkspaceDefaults(token, defaultWorkspaceId, { template: 'sales' });`, insert:

```js
  // ── Recompute entitlement mirror columns from the source of truth ──
  // workspaces.<module>_entitled_until is what the add-on read permission
  // filter gates on. This repairs drift / first rollout / direct-DB edits.
  // Projection MUST match lib/entitlements.ts:entitledUntil:
  //   disabled|none → null ; active|trial → expires_at ?? sentinel
  const PERPETUAL = '9999-12-31T00:00:00.000Z';
  const entUntil = (status, expiresAt) =>
    status === 'disabled' ? null : (expiresAt ?? PERPETUAL);
  console.log('→ Recomputing workspace entitlement mirror columns');
  const allWorkspaces = await api(token, 'GET', '/items/workspaces?fields=id&limit=-1');
  for (const ws of allWorkspaces ?? []) {
    const rows = await api(
      token,
      'GET',
      `/items/workspace_entitlements?filter[workspace_id][_eq]=${ws.id}&fields=module,status,expires_at&limit=-1`,
    );
    const byModule = Object.fromEntries((rows ?? []).map((r) => [r.module, r]));
    const patch = {};
    for (const module of ['tasks', 'territory']) {
      const r = byModule[module];
      patch[`${module}_entitled_until`] = r ? entUntil(r.status, r.expires_at) : null;
    }
    await api(token, 'PATCH', `/items/workspaces/${ws.id}`, patch);
  }
  console.log(`  ✓ recomputed mirrors for ${(allWorkspaces ?? []).length} workspace(s)`);
```

- [ ] **Step 2: Update the manual verification checklist comment**

Find the existing manual-verification checklist comment block in `scripts/bootstrap-directus.mjs` (added by the prior entitlements work, near the `workspace_entitlements` relation). Replace its numbered steps with this block (keep the surrounding comment delimiters):

```
//  ENTITLEMENT ENFORCEMENT — manual verification (Directus 11)
//  Prereq: a non-admin user (e.g. viewer-test@example.com) whose
//  current_workspace = the target workspace.
//  1. After bootstrap, in Directus Admin → Data Model → workspaces, confirm
//     columns tasks_entitled_until and territory_entitled_until exist.
//  2. As the non-admin user with territory active:
//     GET /items/geo_nodes, /items/teams, /items/hierarchy_levels → 200 w/ rows.
//  3. Set the workspace's territory entitlement disabled via the owner panel
//     (or PATCH workspace_entitlements then re-run bootstrap), then repeat (2)
//     → HTTP 200 with data: [] (NOT 500, NOT other-workspace rows).
//  4. tasks parity: toggle tasks entitlement, GET /items/tasks → 200 rows ↔ 200 [].
//  5. Trial: set territory trial with expires_at in the FUTURE → reads allowed;
//     set it in the PAST → reads denied (no scheduler involved).
//  6. Core isolation: GET /items/accounts as the non-admin → exactly the
//     workspace's own rows; in Directus Admin → Policies, each
//     policy+collection+action has exactly ONE permission rule (no {} dupes).
//  7. Idempotency: run `node scripts/bootstrap-directus.mjs` twice → still
//     one rule per policy+collection+action; mirror columns unchanged.
//  8. Admin (admin@example.com) is unaffected (bypasses policies).
```

- [ ] **Step 3: Syntax check + full app test suite (script change must not affect app tests)**

Run: `node --check scripts/bootstrap-directus.mjs && npm test && npx tsc --noEmit`
Expected: syntax OK; all app tests green; no type errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-directus.mjs
git commit -m "feat(bootstrap): recompute entitlement mirror + updated verification checklist"
```

---

## Task 7: End-to-end acceptance against live Directus 11.3.5

**Files:**
- Modify: `.claude/docs/task-summary.md`

Context: this is the real proof. The Directus dev instance is at `http://localhost:8055` (admin `admin@example.com`/`admin`), workspace `Default` = `cdeaa9ff-0beb-4306-9bce-7648341c707b`, non-admin `viewer-test@example.com`/`viewer123` already exists with `current_workspace = Default`. NOT unit-testable — run the commands and record actual output. Do NOT fabricate results; if a check fails, report BLOCKED with the output.

- [ ] **Step 1: Run the bootstrap against live Directus**

Run: `node scripts/bootstrap-directus.mjs 2>&1 | tail -20`
Expected: exit 0; log shows "Ensuring workspace entitlement mirror columns", "set … (removed N prior rule(s))" lines, and "Recomputing workspace entitlement mirror columns → recomputed mirrors for N workspace(s)".

- [ ] **Step 2: Confirm mirror columns + values**

```bash
T=$(curl -s -X POST http://localhost:8055/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
curl -s -g -H "Authorization: Bearer $T" 'http://localhost:8055/items/workspaces?fields=id,tasks_entitled_until,territory_entitled_until' | python3 -m json.tool
```
Expected: `Default` shows both columns; with tasks+territory active+no-expiry both = `9999-12-31T00:00:00.000Z` (sentinel).

- [ ] **Step 3: Confirm exactly one rule per add-on read (dedup worked)**

```bash
T=$(curl -s -X POST http://localhost:8055/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
for C in geo_nodes teams tasks accounts; do n=$(curl -s -g -H "Authorization: Bearer $T" "http://localhost:8055/permissions?filter[collection][_eq]=$C&filter[action][_eq]=read&filter[policy][_eq]=6d4d0f3f-8ff8-4370-bef5-74cb9898a599&fields=id&limit=-1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))'); echo "$C read rules on Viewer policy: $n"; done
```
Expected: each = `1` (was 7/5/1/8 before).

- [ ] **Step 4: Deny-path matrix as the Viewer**

```bash
AT=$(curl -s -X POST http://localhost:8055/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
VT=$(curl -s -X POST http://localhost:8055/auth/login -H 'Content-Type: application/json' -d '{"email":"viewer-test@example.com","password":"viewer123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
WS=cdeaa9ff-0beb-4306-9bce-7648341c707b
chk(){ code=$(curl -s -g -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $VT" "http://localhost:8055/items/$1?limit=1"); n=$(curl -s -g -H "Authorization: Bearer $VT" "http://localhost:8055/items/$1?limit=100&fields=id" | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("data",[])))' 2>/dev/null); echo "$1: HTTP $code rows=$n"; }
setmod(){ # module status [expires_at|null]  — via setEntitlement-equivalent: upsert row + mirror
  RID=$(curl -s -g -H "Authorization: Bearer $AT" "http://localhost:8055/items/workspace_entitlements?filter[workspace_id][_eq]=$WS&filter[module][_eq]=$1&fields=id&limit=1" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d[0]["id"] if d else "")')
  if [ -n "$RID" ]; then curl -s -X PATCH "http://localhost:8055/items/workspace_entitlements/$RID" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"status\":\"$2\",\"expires_at\":$3}" >/dev/null; else curl -s -X POST http://localhost:8055/items/workspace_entitlements -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"workspace_id\":\"$WS\",\"module\":\"$1\",\"status\":\"$2\",\"expires_at\":$3}" >/dev/null; fi
  # mirror (matches entitledUntil): disabled→null else expires ?? sentinel
  if [ "$2" = disabled ]; then MV=null; elif [ "$3" = null ]; then MV='"9999-12-31T00:00:00.000Z"'; else MV=$3; fi
  curl -s -X PATCH "http://localhost:8055/items/workspaces/$WS" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"${1}_entitled_until\":$MV}" >/dev/null; }
echo "-- territory+tasks ACTIVE --"; setmod territory active null; setmod tasks active null; for c in geo_nodes teams hierarchy_levels tasks accounts; do chk $c; done
echo "-- territory DISABLED --"; setmod territory disabled null; for c in geo_nodes teams hierarchy_levels; do chk $c; done
echo "-- territory TRIAL future --"; setmod territory trial '"2099-01-01T00:00:00.000Z"'; chk geo_nodes
echo "-- territory TRIAL past --"; setmod territory trial '"2020-01-01T00:00:00.000Z"'; chk geo_nodes
echo "-- restore territory ACTIVE --"; setmod territory active null; chk geo_nodes
```
Expected:
- active: `geo_nodes/teams/hierarchy_levels/tasks` HTTP 200 rows>0; `accounts` 200 rows>0
- territory disabled: those three → **HTTP 200 rows=0** (no 500)
- trial future → `geo_nodes` 200 rows>0; trial past → `geo_nodes` 200 rows=0
- restore active → `geo_nodes` 200 rows>0

- [ ] **Step 5: Admin unaffected**

```bash
AT=$(curl -s -X POST http://localhost:8055/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
for c in geo_nodes tasks accounts; do echo -n "$c "; curl -s -g -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $AT" "http://localhost:8055/items/$c?limit=1"; done
```
Expected: all `200` regardless of entitlement state.

- [ ] **Step 6: Idempotency — re-run bootstrap, re-check rule counts**

Run: `node scripts/bootstrap-directus.mjs >/dev/null 2>&1 && echo "re-run ok"` then repeat Step 3's loop.
Expected: still exactly `1` rule per add-on read; "re-run ok" printed.

- [ ] **Step 7: Restore Default to fully entitled + update task-summary**

```bash
AT=$(curl -s -X POST http://localhost:8055/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@example.com","password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])')
WS=cdeaa9ff-0beb-4306-9bce-7648341c707b
for M in territory tasks; do RID=$(curl -s -g -H "Authorization: Bearer $AT" "http://localhost:8055/items/workspace_entitlements?filter[workspace_id][_eq]=$WS&filter[module][_eq]=$M&fields=id&limit=1" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(d[0]["id"] if d else "")'); curl -s -X PATCH "http://localhost:8055/items/workspace_entitlements/$RID" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"status":"active","expires_at":null}' >/dev/null; curl -s -X PATCH "http://localhost:8055/items/workspaces/$WS" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"${M}_entitled_until\":\"9999-12-31T00:00:00.000Z\"}" >/dev/null; done
echo "Default restored to territory+tasks active"
```

Then append a dated section to `.claude/docs/task-summary.md` (match existing format) recording: the Directus-11 redesign shipped (mirror columns + M2O `_gt $NOW` filter + idempotent dedup + recompute + `setEntitlement` second write); the prior known-limitation about the relational permission filter is **RESOLVED** (cite this spec/plan); the documented caveat (direct Directus-admin edits to `workspace_entitlements` need a bootstrap re-run or the owner panel to propagate to the mirror); and the actual Step-4 matrix results.

- [ ] **Step 8: Commit**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log Directus-11 entitlement enforcement redesign + acceptance results"
```

---

## Self-Review Notes

- **Spec coverage:** data model (T3), Directus-11 filter (T4), idempotent dedup incl. Core (T5), `entitledUntil` helper (T1), `setEntitlement` second write + ordering (T2), recompute pass (T6), manual checklist (T6), end-to-end acceptance matrix incl. trial future/past + admin + idempotency (T7), task-summary + resolve old limitation (T7). All spec sections mapped.
- **Type/name consistency:** `entitledUntil(status, expiresAt)` + `PERPETUAL_SENTINEL` defined T1, imported/used T2; bootstrap's inline `entUntil` (T6) deliberately mirrors it with a comment; column names `tasks_entitled_until` / `territory_entitled_until` and the sentinel `9999-12-31T00:00:00.000Z` are identical across T2/T3/T4/T6/T7.
- **No placeholders:** every code/command step is concrete; T7 is explicitly run-and-record (live Directus cannot be unit-tested) with exact expected outputs and a no-fabrication instruction.
- **Scope:** single coherent subsystem (server enforcement mechanism); client untouched by design.
