# Entitlement Enforcement — Directus-11 Compatible Redesign

**Date:** 2026-05-18
**Status:** Approved (brainstorm)
**Author:** Chief Software Architect (Claude) + uzair23
**Supersedes:** the *server enforcement* section of
`docs/superpowers/specs/2026-05-17-sellable-modules-entitlements-design.md`
(the rest of that spec — module model, client gate, hydration, nav, ESLint
seam, admin UI — stands unchanged).

## Problem

The shipped enforcement layer is non-functional on the live Directus
(**v11.3.5**). The add-on read permission filter traverses the
`workspace_entitlements` O2M nested under an M2O (`workspace_id`):

```json
{ "workspace_id": { "workspace_entitlements": { "_and": [ … ] } } }
```

Directus 11 rejects this in a *permission* filter:

- bare nested form → **HTTP 500** (INTERNAL_SERVER_ERROR)
- `_some` form → **HTTP 400**: `"_some" can only be used with top level
  relational alias field`

Net effect, verified end-to-end with a non-admin Viewer user:

- **Defect 1 (architectural):** where the gated rule is the only rule
  (`tasks`) non-admins get a 500 — the gate errors instead of allowing or
  denying.
- **Defect 2 (cruft):** historical bootstrap runs left unrestricted
  `permissions: {}` read rules on the Viewer/Editor policies — 6 for
  `geo_nodes`, 4 for `teams`, 7 for `accounts`. Directus OR-merges permission
  rules, so `{}` ("all rows") nullifies both the entitlement gate **and**
  workspace isolation. `ensurePermission` queries with `limit=1` and patches a
  single row, so it never sees or removes the duplicates.

## Goal

Make server-side entitlement enforcement correct on Directus 11 while keeping
`workspace_entitlements` as the source of truth, and eliminate the duplicate
permission rows (restoring both the entitlement gate and cross-workspace
isolation). No client-facing behaviour change.

## Approach

Denormalize each module's entitlement deadline onto a scalar column of
`workspaces`, and gate add-on reads with a simple M2O→scalar field filter that
Directus 11 supports. Make `ensurePermission` idempotent (exactly one rule per
policy+collection+action). Keep `workspace_entitlements` as the source of truth
and the client read path; the workspace columns are an enforcement projection.

Rejected alternatives:

- *Directus Flow event hook for sync* — authoritative on any write path but
  materially more complex bootstrap (Flows + operations, idempotently);
  unnecessary given a single app write path.
- *Collapse to workspace columns only (drop the collection)* — loses the
  status/expiry model and forces a client refactor; contradicts "collection
  stays source of truth".
- *Per-module boolean flag* — cannot express trial expiry; would need a
  scheduler to flip the flag when a trial lapses.

## Data Model

Add two **nullable `timestamp`** columns to the `workspaces` collection:

- `tasks_entitled_until`
- `territory_entitled_until`

Encoding (pure projection of the owning `workspace_entitlements` row):

| Source row state | Column value |
|---|---|
| no row, or `status = 'disabled'` | `null` |
| `status ∈ {active, trial}`, `expires_at = null` | `9999-12-31T00:00:00.000Z` (perpetual sentinel) |
| `status ∈ {active, trial}`, `expires_at` set | that `expires_at` (a past value is harmless — the filter denies it) |

The existing `workspace_entitlements.workspace_id → workspaces` relation
(with its named `one_field` and `CASCADE`) **stays** — still required for the
collection's own workspace-scoped read and cascade delete. It is simply no
longer referenced by any permission filter.

## Permission Filter (Directus-11 valid)

Add-on collection **read** rule (replaces the invalid O2M-nested filter):

```json
{ "_and": [
  { "workspace_id": { "_eq": "$CURRENT_USER.current_workspace" } },
  { "workspace_id": { "<module>_entitled_until": { "_gt": "$NOW" } } }
] }
```

`<module>_entitled_until` is `tasks_entitled_until` for `tasks`,
`territory_entitled_until` for `geo_nodes` / `teams` / `hierarchy_levels`.
This is an M2O→scalar traversal — the same supported filter class as the
existing `workspace_id._eq $CURRENT_USER.current_workspace`. `null` fails
`_gt` → deny. The year-9999 sentinel `_gt $NOW` → allow. A trial `expires_at`
self-enforces at query time — **no scheduler**. Create/update/delete on add-on
collections stay workspace-scoped only (writes are app-guarded, unchanged).

## Idempotent Permission Dedup

`ensurePermission(policy, collection, action, opts)` changes from
"GET `limit=1` → PATCH one or POST" to:

1. GET **all** permission rows for `(policy, collection, action)`.
2. DELETE every one.
3. POST exactly one canonical rule (the body computed from `opts`).

This guarantees one rule per policy+collection+action and is applied uniformly
to every bootstrap-managed workspace-scoped collection — so it also removes the
legacy unrestricted `{}` rules on Core collections (`accounts`, `contacts`,
`field_definitions`, `pipeline_stages`, `members`, …), closing the
cross-workspace read leak. Re-running the bootstrap converges. Permission row
ids will churn (acceptable; nothing references them).

## Sync

**Projection helper (single definition of the rule).** Add to
`lib/entitlements.ts`:

```ts
export function entitledUntil(
  status: EntitlementStatus,
  expiresAt: string | null,
): string | null {
  if (status === 'disabled') return null;
  return expiresAt ?? '9999-12-31T00:00:00.000Z';
}
```

`scripts/bootstrap-directus.mjs` re-implements the same three-line rule inline
with a comment referencing this function (kept trivial so they cannot drift).

**Write path.** `lib/entitlementsAdmin.ts:setEntitlement(patch)` — after the
existing `workspace_entitlements` upsert, additionally
`PATCH /items/workspaces/<workspace_id>` with
`{ [\`${patch.module}_entitled_until\`]: entitledUntil(patch.status, patch.expires_at) }`.
One added write in the same function; errors surface as today (throws on !ok),
ordered so the source-of-truth row is written first.

**Drift repair (bootstrap recompute pass).** `scripts/bootstrap-directus.mjs`:

1. Idempotently add `tasks_entitled_until` and `territory_entitled_until`
   scalar fields to the `workspaces` collection definition.
2. After collections + permissions, run a recompute pass: for every workspace,
   read its `workspace_entitlements` rows, compute both column values, PATCH
   the workspace. Idempotent (converges). Repairs the first rollout, any
   direct-DB/admin edits, and the currently broken instance.

**Caveat (documented):** editing `workspace_entitlements` directly in the
Directus admin UI does not propagate to the mirror until the next
`setEntitlement` call or a bootstrap re-run. Use the owner admin panel or
re-run bootstrap.

## Client Impact

None functional. `resolveEntitlement`, `useEntitlements`,
`entitlementsClient`, `ModuleGate`, `useNavModules`, and conditional hydration
are unchanged. `workspace_entitlements` remains the client-read source of truth
(workspace-scoped read still works). Only `setEntitlement` gains the second
write, and `lib/entitlements.ts` gains the pure `entitledUntil` helper.

## Testing & Acceptance

**Unit (vitest):**

- `entitledUntil` truth table: `disabled → null`; `active`+`null → sentinel`;
  `trial`+future → that ts; `trial`+past → that ts; `active`+ts → that ts.
- `setEntitlement` writes both: mocked `fetch` asserts the
  `workspace_entitlements` upsert **and** the `workspaces` PATCH body
  (`<module>_entitled_until` = projected value), and that the entitlements row
  is written before the workspace PATCH.

**Bootstrap:** `node --check scripts/bootstrap-directus.mjs`; updated manual
verification checklist (incl. the recompute pass and the
`workspaces.*_entitled_until` columns).

**End-to-end acceptance** — the deny-path matrix that currently fails must pass,
run against live Directus 11.3.5 with the existing `viewer-test@example.com`
non-admin user, workspace `Default`
(`cdeaa9ff-0beb-4306-9bce-7648341c707b`):

| Scenario | Expected |
|---|---|
| `territory` active → Viewer reads `geo_nodes`, `teams`, `hierarchy_levels` | HTTP 200, rows returned |
| `territory` disabled → same reads | **HTTP 200, 0 rows** (no 500, no leak) |
| `tasks` active ↔ disabled → Viewer reads `tasks` | 200/rows ↔ 200/0 rows |
| `territory` trial, `expires_at` in the future | allowed |
| `territory` trial, `expires_at` in the past (no scheduler) | denied |
| Core `accounts` read (Viewer) | exactly one workspace-scoped rule; no `{}` leak |
| Admin (`admin@example.com`) | unaffected (bypasses policies) |
| Re-run bootstrap twice | converges; one rule per policy+collection+action |

## Out of Scope

Self-serve billing (unchanged — future spec). Directus Flow-based sync
(rejected above). Any client UI change. The `2026-05-17` spec's module model,
client gate, hydration, nav, ESLint seam, and admin UI are unchanged.
