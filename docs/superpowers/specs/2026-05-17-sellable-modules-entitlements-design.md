# Sellable Modules: Entitlements & Module Seams — Design

**Date:** 2026-05-17
**Status:** Approved (brainstorm)
**Author:** Chief Software Architect (Claude) + uzair23

## Goal

Make vegeta's three functional areas — **Accounts**, **Tasks**, **Territory & Team** —
independently *sellable*, so a workspace can buy Accounts plus any combination of the
Tasks and Territory add-ons.

## Commercial / Deployment Model

**Licensed modules in one codebase** (modular monolith with entitlements), architected
with clean, CI-enforced internal seams so a future split into separately deployable apps
becomes a mechanical extraction rather than a rewrite.

Rejected alternatives:

- *Separate deployable apps, shared backend* — premature; no customer requires isolated
  hosting yet.
- *Fully standalone products* — triplicates auth, multi-tenancy, billing, and the
  Directus layer; months of duplication before revenue, and recreates the very
  integrations being severed.

## Module Model

**Accounts is the required base.** Tasks and Territory & Team are paid add-ons layered
on top. This matches the existing data model (`Task.accountId`, `Activity.accountId`,
`Account.geoNodeId`) — **no data-model surgery is required**.

| Module | Owns | Entitlement key |
|---|---|---|
| **Core (Accounts)** | accounts, contacts, activities, pipeline stages, custom fields, workspace, auth, **member/identity directory** | always on (base) |
| **Tasks** | tasks slice, task UI, `/tasks` route | `tasks` |
| **Territory & Team** | geo, teams, members*, regions, subregions, assignments, hierarchy levels, map UI, `/territory` + `/teams` | `territory` |

\* Territory references the member directory but no longer *owns* it — see Seam
Correction below.

## Dependency Direction (the core rule)

```
Core (Accounts / Contacts / Activities / Identity)  ←  Tasks
                                                    ←  Territory & Team
```

- Add-ons MAY read Core.
- Core NEVER imports an add-on.
- Tasks and Territory NEVER import each other.

This rule is enforced in CI (ESLint), not just by convention.

## Seam Correction: Member/Identity → Core

`Task.assigneeId` and Territory's teams both reference `members.id`, but the member
directory is currently bundled inside the Territory module. That makes Tasks depend on
Territory, violating the dependency rule and blocking any future Tasks-without-Territory
sale.

**Fix (minimal-moves form):** `membersSlice` is **reclassified as Core** in the
ESLint boundary map — no physical file move. A Tasks→members import then counts
as Tasks→Core (allowed), not Tasks→Territory (forbidden). Territory and Tasks
both legitimately consume the Core member directory. This is a classification
correction, not new functionality — in scope.

## Entitlements Data Model (Directus)

A `workspace_entitlements` collection:

```
workspace_entitlements {
  workspace_id : FK workspaces
  module       : 'tasks' | 'territory'
  status       : 'active' | 'trial' | 'disabled'
  expires_at   : timestamp | null   // trial / time-boxed grants
}
```

A `useEntitlements()` hook caches the resolved entitlement set for the current
workspace, mirroring the existing cache pattern in `lib/workspace.ts`
(`current_workspace`). Resolution treats `trial` with a future `expires_at` as
entitled; `disabled`, missing, or expired-trial as not entitled.

### Reconciliation with the existing `modulesEnabled` toggle

The codebase already has `hooks/useWorkspaceSettings.ts → modulesEnabled`
(`{ territory, contacts, activities, tasks }`, **default all `true`**, client
side only). It is a UX show/hide toggle, **not** a paid gate. The two layers
are kept distinct and strictly ranked:

1. **Entitlement** (new, server-authoritative, **default-deny**) decides
   *access*. Not entitled ⇒ no rows from Directus, route redirects to upgrade,
   nav hidden. `modulesEnabled` is **not consulted** in this case.
2. **`modulesEnabled`** (existing, client, default-on) is consulted **only when
   the module is entitled**, as a within-plan show/hide preference.

Net visibility rule: a module renders iff **entitled AND `modulesEnabled`**.
No second source of truth for access; `modulesEnabled` never grants access.

## Enforcement — Defense in Depth

Mirrors the existing belt-and-suspenders workspace-scoping pattern.

1. **Server (authoritative).** Directus access policies so a workspace lacking the
   `territory` entitlement gets **zero rows** from `geo_nodes`, `teams`, `regions`,
   `subregions`, `assignments`, `hierarchy_levels`; lacking `tasks` gets zero rows from
   `tasks`. Same mechanism as planned workspace-scope policies.
2. **Route gate.** `/tasks`, `/territory`, `/teams` check the entitlement and redirect
   to an upsell page when absent.
3. **Store / UI.** Add-on slices hydrate only when entitled; nav entries render only
   when entitled. Un-entitled modules are **invisible, not disabled**.

## Seam Architecture (low-risk choices)

- **Module manifest.** Each add-on gets `modules/<name>/manifest.ts` declaring its
  entitlement key, routes, nav entries, slice list, and a `hydrate()` function. The
  app shell reads manifests; nothing hardcodes module knowledge.
- **Conditional hydration, not conditional store composition.** All Zustand slices stay
  composed (in-memory, cheap; avoids a risky store rewrite). `DirectusHydrationBoundary`
  fetches an add-on's data only when entitled; routes/nav render only when entitled.
- **ESLint boundary rule** (`no-restricted-imports` by path) encodes the dependency
  direction; a Core→add-on or Tasks↔Territory import fails CI. This is what makes a
  future physical extraction mechanical.
- **Cross-module contract types.** Add-ons consume Core through a typed `core` index
  (account read access, member directory) rather than reaching into Core slices
  directly.
- **Code layout.** Keep the current file layout. Boundaries are real and CI-enforced;
  physical relocation into `modules/<name>/` is deferred to the future extraction spec.

## Grant Mechanism (this spec)

Entitlements are toggled directly in Directus and via a thin internal admin panel in
`/settings/workspace`, gated to an owner/internal role, allowing a module to be flipped
on/off and a trial `expires_at` to be set. **No payment provider.**

## Implementation Path (phases → plan steps)

1. **Entitlements foundation** — `workspace_entitlements` collection, `useEntitlements()`
   cached hook, Directus access policies as the authoritative gate.
2. **Module manifests + shell gating** — manifest files, manifest-driven nav/routes,
   upsell redirect page, conditional hydration in `DirectusHydrationBoundary`.
3. **Seam corrections** — move member/identity into Core; add the typed `core`
   contract; add the ESLint boundary rule and fix violations.
4. **Internal admin toggle** — owner-gated panel in `/settings/workspace` to flip
   modules and set trial expiry.

## Testing Strategy

- Unit: entitlement resolution across `active` / `trial` (future & expired) /
  `disabled` / missing.
- Directus policy tests: a non-entitled workspace receives zero add-on rows.
- Route-gate tests: un-entitled route redirects to upsell.
- ESLint rule test: a forbidden cross-module import fails lint.

## Out of Scope (→ future spec)

Stripe / checkout, billing webhooks, plan catalog, proration, self-serve upgrade flow.
Self-serve billing layers on top of the finished entitlements model.
