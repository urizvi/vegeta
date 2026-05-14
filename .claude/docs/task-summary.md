# Task summary: Territory store refactor + Geo hierarchy + paint-mode

## Part 1 — Territory store refactor (5 sub-tasks)

Started as cleanup of the partially-sliced Zustand store.

1. **Type slice composition properly.** Each `StateCreator` now uses the root `TerritoryStore` type so `get()` is typed across all slices. `store/types.ts` (new) holds the root type to break the circular import. The `as Parameters<typeof ...>` casts in `territoryStore.ts` are gone.
2. **Split `territorySlice` (291 lines) into 5 focused slices** — `teamsSlice`, `membersSlice`, `regionsSlice`, `subregionsSlice`, `assignmentsSlice`. Cross-slice cascades (`removeTeam` clearing assignments, `removeRegion` cascading subregions, `addMember` mutating teams) work because the typed root `set` lets one slice update another's keys.
3. **Per-slice persist contracts.** Each slice exports `<name>PersistKeys = [...] as const satisfies readonly (keyof <Slice>)[]`. The root composes them into one `PERSIST_KEYS` array; `exportState`/`importState` walk it. Adding state to a slice without updating its persist contract is now a TS error rather than silent drift.
4. **Colocate selectors with slices.** `hooks/useTerritoryStore.ts` shrunk from 109 lines to a thin barrel. Each slice has its own `*Selectors.ts` neighbor; cross-slice selectors live in `store/selectors.ts`. Existing `import { ... } from '@/hooks/useTerritoryStore'` consumers unchanged.
5. **Memoization audit — no change needed.** `lib/territoryIndex.ts` already memoizes `getEntityTeamIndex`/`getAccountStatsByEntity` at module scope by reference equality on source slice fields. All derived selectors return primitives or stable refs (or wrap with `useShallow`). Initial concern was wrong on inspection.

## Part 2 — Geo hierarchy + paint-mode (5 batches, 11 sub-tasks)

### User-confirmed design decisions

| Question | Decision |
|---|---|
| Geo vs Team relationship | **Coexist.** Team stays as the people/org concept (members). Geo is a new, separate hierarchy that owns countries/states and provides map colors. |
| Hierarchy depth | **Arbitrary nested tree.** Recursive parent/child via `parentId` (null = root). |
| Paint-on-already-assigned-country | **Overwrite silently.** No confirmation, no toggle — fastest workflow. |
| Account assignment | Optional `geoNodeId` on `Account`. If set, takes precedence; otherwise inherit via the country/state on the account. |
| Map roll-up | Direct state assignment > direct country assignment > nearest ancestor that owns the country. Color resolves by walking up to the nearest ancestor with a non-null `color` (null = inherit). |
| Click-without-paint behavior on world map | **Drill down.** Replaces the popover's "view states" affordance. |
| Click-without-paint on drill-down map | **No-op.** No popover replacement; states are paint-only. |

### Data model

```ts
interface GeoNode {
  id: string;
  name: string;
  color: string | null;      // null = inherit from nearest ancestor
  parentId: string | null;
  countryCodes: string[];
  stateCodes: string[];       // "US:US-CA" format
}
```

`SalesTeam` keeps `memberIds` only — no longer linked to map territory. `Subregion.teamId` and `Assignment.teamId` are JSDoc-deprecated but kept nullable for one release while data migrates.

### Backend (Directus)

- New `geo_nodes` collection. Self-FK `parent_id → geo_nodes` (`ON DELETE SET NULL`).
- New `accounts.geo_node_id` FK → `geo_nodes` (added idempotently to existing instances via `POST /fields/accounts`).
- Migration script reads an `exportState()` JSON (matches the existing `seed-directus.mjs` pattern, since teams/subregions live in-memory only) and produces:
  - Each Team → root GeoNode (id + color preserved).
  - Each Subregion with a `teamId` → child GeoNode under that team (`color: null` to inherit).
  - Country assignments → team root's `countryCodes`.
  - State assignments not already covered by a subregion → team root's `stateCodes`.
  - Idempotent: skips if `geo_nodes` already has rows.

### Store

- New `geoSlice` with state `geoNodes`, `geoNodeOrder`, `activePaintGeoId` (UI-only, not persisted).
- Mutating actions are **synchronous from the caller's view** but fire background Directus writes via a `fireWrite` helper. Failures `console.error` (no rollback — design tradeoff for paint-mode latency; next reload re-syncs). Add* actions return the locally-generated id immediately.
- `removeGeoNode('reparent-children')` PATCHes children's `parent_id` *before* the delete, so they aren't accidentally orphaned at `ON DELETE SET NULL`.
- Reparent has a cycle guard (rejects new parent that's a descendant of the moving node).

### UI

- **Sidebar:** new `Geos` tab (default) sits alongside the existing Teams/Regions tabs. Recursive tree (`GeoSidebarPanel` + `GeoNodeRow`) — inline rename, native color input, expand/collapse, add child / add root, cascade-delete with confirm, click a node to enter paint mode.
- **Toolbar paint pill:** appears only when `activePaintGeoId` is set. Shows node name + effective color swatch. Esc anywhere clears paint mode (global keydown listener).
- **Map clicks:** `WorldMapView` paints country when active else drills down; `DrillDownMapView` paints state when active else no-op. `AssignPopover` deleted.
- **Cursor** changes to `crosshair` while painting.
- **MapTooltip** shows the owning Geo with a breadcrumb up the tree (e.g. "Americas › NA › Western US") and the effective (inherited) color.
- **MapLegend** lists root Geos with their effective colors.
- **Account UI:** new `GeoPicker` component (flattened tree as a `<select>` with breadcrumb labels). Wired into `AddEditAccountModal`. New sortable Geo column in `AccountsTable`.
- **CSV import:** new `'geo'` `ColumnRole` + `GEO_ALIASES` (`geo`, `territory`, `geography`, etc.). Auto-detected; user can override in `ConfigureStep`. `buildImportRows` resolves Geo names → ids via a `geosByName` map.

### Batch E — UX add-ons (shipped)

**Color inheritance UI** (`GeoNodeRow.tsx`)
- Swatch shows a diagonal-stripe pattern when `color` is null (visual cue for "inheriting").
- Hover-revealed reset-to-inherit button appears on nodes with a non-null color *and* a parent.

**Eraser mode**
- `geoSlice` gains `activeEraser: boolean`. Mutually exclusive with `activePaintGeoId` — turning one on clears the other.
- Toolbar shows **Painting** pill (blue), **Erasing** pill (amber), or an **Erase** button. Esc clears either.
- Map click handlers check eraser → paint → drill-down/no-op, in that order. Cursor switches to crosshair while either mode is active.

**Undo/redo**
- `geoSlice` tracks `geoUndoStack` / `geoRedoStack` of `NodeCodesPatch[]` (each entry one op, multi-node). Cap 50.
- All four assignment ops push captured before/after diffs onto undo, clear redo. New `undoGeoAssignment` / `redoGeoAssignment` actions skip patches whose nodes were since deleted, apply the inverse, and fire Directus PATCHes.
- Toolbar buttons (always visible, disabled when stack empty). Global keyboard: **⌘Z** undo, **⇧⌘Z** or **⌘Y** redo. Skipped when focus is in an editable element so text-edit undo still works.
- `hydrateGeoNodes` clears both stacks so fresh data doesn't get a phantom undo state.

### Deferred follow-ups (not shipped)

Account-count badges in the Geo tree (recursive sum), drag-to-paint, number-key Geo switch, right-click contextual assign, Geo tree search, bulk-paste assign, lock toggle per node.

### Files of note

- New: `store/slices/geoSlice.ts`, `store/slices/geoSelectors.ts`, `components/territory/sidebar/GeoSidebarPanel.tsx`, `components/territory/sidebar/GeoNodeRow.tsx`, `components/accounts/GeoPicker.tsx`, `scripts/migrate-teams-to-geo.mjs`.
- Modified for Geo: `types/territory.ts`, `types/account.ts`, `lib/territoryIndex.ts` (added `getEntityGeoIndex` + `getEntityGeoColor`, mirrored memo pattern), `lib/directus*`, `scripts/bootstrap-directus.mjs`, all map components, `Toolbar.tsx`, all account modals/table.
- Deleted: `components/territory/map/AssignPopover.tsx`, `store/slices/territorySlice.ts` (now five files).

### Rollout order

1. `node scripts/bootstrap-directus.mjs` — adds collection + field + relations + permissions, idempotent on existing instances. **Existing instances need this re-run after Batch D** so the new `geo_nodes` collection's `read` permission gets granted to the existing Viewer/Editor roles.
2. Capture an `exportState()` JSON from the running app (DevTools `copy(useTerritoryStore.getState().exportState())`).
3. `node scripts/migrate-teams-to-geo.mjs state.json` — populates `geo_nodes`.
4. Reload — Geos sidebar shows migrated tree; existing country/state colors continue working via the Geo index.

### Resilience tweak (post-Batch E)

`useDirectusAccounts` now tolerates a `getGeoNodes` failure (e.g. 403 if bootstrap hasn't been re-run on an existing instance) — logs a warning and falls back to an empty Geo tree instead of breaking the whole app. The other collections still hard-fail since their absence indicates a more serious misconfiguration.

### Bug fixes (post-Batch E)

- **Selector loops in `MapLegend`/`MapTooltip`.** Both ran selectors that returned a fresh object per render, tripping `useSyncExternalStore`'s "result of getSnapshot should be cached" warning.
  - `MapLegend`: wrapped in `useShallow` (return type is `Record<string, string|null>` — all primitive values, shallow equality works).
  - `MapTooltip`: `useShallow` wasn't enough because the returned object included a fresh `trail: string[]` array each call (shallow equality fails on the array reference). Restructured to a primitive selector returning the resolved `nodeId: string|null`, then compute the breadcrumb locally with `useMemo` over `nodeId + geoNodes`. **Lesson:** if a selector return contains a freshly-allocated array/object value, `useShallow` won't save it — split into primitive selectors + local memo.
- **Geo create returned `FORBIDDEN` even as admin.** Cause: `addGeoNode` was generating `geo-${crypto.randomUUID()}` ids; the `geo-` prefix violated the `uuid`-typed column on the Directus `geo_nodes.id` field, which Directus surfaces as a misleading FORBIDDEN error. Fixed by using `crypto.randomUUID()` directly. *Diagnostic note for future debugging:* a manual POST without an id succeeded, isolating it from the permission rabbit hole.

## Part 3 — Move Teams CRUD out of the territory sidebar

**Decision:** the `Teams` tab inside `TeamSidebar` was the sole CRUD surface for an entity referenced everywhere (accounts → repId, subregions, legend, spreadsheet). Rather than delete it outright, team management was lifted to a dedicated `/teams` route, leaving the sidebar to focus on Geos and Regions.

### Changes
- **New route** `app/teams/page.tsx` → `components/teams/TeamsAdminView.tsx`. Same Sales-Deployment header pattern as `AccountsToolbar` with a third "Teams" pill, a `New Team` button, sign-out, and a centered list of `TeamCard`s. Empty state mirrors the prior sidebar empty state.
- **Moved** `TeamCard.tsx`, `AddTeamModal.tsx`, `AddMemberModal.tsx`, `MemberRow.tsx` from `components/territory/sidebar/` → `components/teams/`. Relative imports (`./MemberRow`, `./AddMemberModal`) preserved because the four files moved together. Store/selector imports use the `@/` alias and didn't change.
- **`TeamSidebar.tsx`** narrowed to `Tab = 'geos' | 'regions'` — Teams tab button, branch, and unused imports (`useTeams`, `useTeamOrder`, `TeamCard`, `AddTeamModal`, `showAddTeam`) all dropped.
- **Toolbar nav** in both `components/territory/toolbar/Toolbar.tsx` and `components/accounts/AccountsToolbar.tsx` extended with a third pill linking to `/teams`. The Teams page renders its own header so the segmented control appears on all three pages consistently.
- **Backing store untouched.** `teamsSlice`, `teamsSelectors`, `membersSlice`, `SalesTeam.memberIds`, `Account.repId` are unchanged. Rep-per-account was already wired in `AddEditAccountModal.tsx:286-300` (Sales Rep dropdown flattens `team.memberIds` × `useMembers()` across all teams) — no schema changes needed.

### Verified
- `npm run lint` clean, `npx tsc --noEmit` clean, `npm run build` succeeds and lists `/teams` in the route table alongside `/accounts` and `/territory`.

## Part 4 — Persist teams + members to Directus

After Part 3 shipped, surfaced that `teamsSlice` only seeded three teams locally and `membersSlice` mutations never wrote anywhere — every refresh nuked the data. Brought both into the same fire-write pattern as `geoSlice`.

### Backend (Directus)

- **New `teams` collection** in `scripts/bootstrap-directus.mjs`: id (uuid PK), name, color (hex via `select-color`), sort. Granted to Viewer (read) and Editor (full CRUD).
- **`members` collection expanded.** Added `email`, `role`, `level` (dropdown of `IC | Lead | Manager | Director | VP | CRO`), upgraded `team_id` to a uuid M2O. Backfill via `tryCreateField` so existing instances pick up the new columns idempotently. Note removed about being a "read-only mirror".
- **New relation** `members.team_id → teams` with `ON DELETE SET NULL`. Lives next to the existing `accounts.rep_id → members` and `accounts.geo_node_id → geo_nodes` relations.
- `COLLECTIONS` array for permissions now includes `teams`. Re-run `node scripts/bootstrap-directus.mjs` on existing instances to grant the new perms.

### Lib

- `lib/directus-mappers.ts`: new `TeamRow`, `rowToTeam`, `teamToRow`. `MemberRow` extended with `email`/`role`/`level`; new `rowToMember` and `memberToRow` (the latter accepts an optional `teamId` since it isn't part of `Member`).
- `lib/directus.ts`: new `getTeams()` returning `{ teams, order }` (sort-aware). `getMembers()` now returns the full `Member` shape plus `teamId`.
- `lib/directus-write.ts`: new `createTeam` / `updateTeamRemote` / `deleteTeam` and `createMember` / `updateMemberRemote` / `deleteMember`. Same fire-and-forget contract as the Geo writers (caller doesn't await).

### Store

- **`teamsSlice`** dropped the hardcoded `SEED_TEAMS` — initial state is `{}` / `[]`, populated by `hydrateTeams`. `addTeam` / `updateTeam` / `removeTeam` fire Directus writes. `removeTeam` also deletes any member rows the team owned (rather than relying on the relation alone leaving orphans). Added `hydrateTeams(teams, order)` that preserves any `memberIds` already attached locally so order doesn't matter if hydration runs out of sequence.
- **`membersSlice`** writes propagate to Directus. `addMember` returns the new id. `hydrateMembers` now reads the full mapper output (`email`/`role`/`level`) instead of fabricating defaults from the previous local map. **Order matters:** `hydrateTeams` must run before `hydrateMembers` so `nextTeams` has the right keys when reattaching `memberIds`.

### Hooks / pages

- `useDirectusAccounts` now also fetches `getTeams()` in the `Promise.all`, with the same tolerate-and-warn fallback pattern as `getGeoNodes` (so an instance that hasn't been re-bootstrapped still loads). Calls `hydrateTeams` before `hydrateMembers`.
- New `app/teams/TeamsClient.tsx` wraps `TeamsAdminView` in `DirectusHydrationBoundary` so the `/teams` route triggers hydration the same way `/territory` and `/accounts` do.

### Verified
- `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean.

### Rollout
1. **Existing instances must re-run `node scripts/bootstrap-directus.mjs`** to create the `teams` collection, expand `members`, register the new relation, and grant Viewer/Editor permissions.
2. After bootstrap, hydrate seed data however suits the deployment (Directus admin UI, a one-off script, or just create teams in `/teams`). Without seeding, the app loads with an empty teams list — that's intentional now.

### Diagnostic note (Part 4 follow-up)

`createTeam` returned `403 You don't have permission to access this` even on the admin's first attempt. Two layered causes — both worth remembering:
- The `teams` collection didn't exist yet (bootstrap had only run with the pre-Part-4 script). Directus surfaces a missing collection as 403, not 404.
- Once the script ran, `members.team_id` was a legacy `string` column (created back when MEMBERS_COLLECTION used `type: 'string'`), so adding the new uuid FK constraint failed with a 500 about an `add constraint ... cannot be implemented` error. Fix: `DELETE /fields/members/team_id`, then re-run bootstrap. Permanent: bootstrap now does a `tryCreateField` for `members.team_id` as uuid so future re-runs upgrade automatically — but **the manual DELETE is still required first** to drop the stale string column.

## Part 5 — Team hierarchy + lead-based account roll-up

Teams went from a flat list to a tree (`teams.parent_id`) with a designated lead per team (`teams.lead_member_id`). Roll-up rule: an account assigned to rep R rolls up to R's team lead, then the parent team's lead, then its grandparent's, … to the root. Roll-ups surface in three places: the `/teams` tree (per-team account counts), inside each `TeamCard` (per-member counts), and as a new "Owner Chain" column in `AccountsTable`.

### Data model

- `types/territory.ts` — `SalesTeam` gains `parentId: string | null` and `leadMemberId: string | null`. Both nullable; existing teams hydrate as roots with no lead.
- `lib/directus-mappers.ts` — `TeamRow` extended with `parent_id`/`lead_member_id`; `rowToTeam`/`teamToRow` map both ways.
- `scripts/bootstrap-directus.mjs` — `TEAMS_COLLECTION` declares the two new uuid M2O fields. Two `tryCreateField` backfills land them on existing instances. Two new relations: `teams.parent_id → teams` (self, `ON DELETE SET NULL`) and `teams.lead_member_id → members` (`ON DELETE SET NULL`).
- `lib/directus-write.ts` — `updateTeamRemote`'s patch type widened to include the new fields; relies on `teamToRow` doing the right thing.

### Tree helpers — `lib/teamTree.ts`

New module so `teamsSlice`, `territoryIndex`, and the UI all share one implementation: `isTeamAncestor`, `teamDescendantsOf`, `teamAncestorsOf`, `teamChildrenOf`, `flattenTreeForSelect` (returns `{ id, label, depth }` with breadcrumb labels for parent-picker dropdowns). Mirrors the inlined helpers in `geoSlice.ts:77-109` but in a shared file because three call-sites need them.

### Slice changes

- `teamsSlice` — `addTeam(name, color, parentId = null)` includes `parentId` and `leadMemberId: null` in the new record. New actions `reparentTeam(id, newParentId)` (cycle-guarded via `isTeamAncestor`) and `setTeamLead(teamId, memberId | null)` (refuses if member isn't on the team). `removeTeam(id, mode = 'cascade')` now supports `'reparent-children'` mirroring `geoSlice.removeGeoNode`. Cascade also drops descendant teams' members and clears their `assignments`.
- `membersSlice.removeMember` — clears `team.leadMemberId` if the removed member was the lead, and fires the corresponding `updateTeamRemote` write.

### Roll-up indexes — `lib/territoryIndex.ts`

Four memoized indexes following the existing `_Key`/`_Value` snapshot-equality pattern:
- `getAccountsByMember(s)` — `Record<repId, accountId[]>`. Memo on `[s.accounts, s.accountOrder]`.
- `getAccountCountByTeam(s)` — for each team, `{ direct, total }` where `total` rolls up across descendants. Memo on accounts + teams.
- `getAccountCountByMember(s)` — for each member M, `total` adds direct counts of every member in any team M leads or any descendant of those teams. Memo on accounts + teams + members.
- `getOwnerChain(s, repId)` — runs on demand (chain depth is small): finds rep's team, walks up emitting each team's lead, dedupes if rep IS the lead. Used by the AccountsTable column.

### UI

- **`/teams` recursion.** `TeamsAdminView` now renders only roots (`parentId === null`); each `TeamCard` recursively renders its child cards inside its expanded body, beneath the existing Subregions and Members sections. New "Add sub-team" button opens `AddTeamModal` pre-filled with `parentId = this.team.id`.
- **`AddTeamModal`** — gained a "Parent team" `<select>` populated by `flattenTreeForSelect` with breadcrumb labels (`Sales › NA`). Default = "— root team —". Accepts an optional `parentId` prop so the "Add sub-team" button can scope it.
- **`TeamCard` header** — new `(direct · total)` badge from `getAccountCountByTeam`. New ★ Lead chip showing the team's lead by name (only on widths ≥ sm).
- **`MemberRow`** — star icon toggles `setTeamLead(teamId, memberId)`; filled amber when this member is the lead. New `direct · rolled` badge from `getAccountCountByMember`.
- **`AccountsTable`** — new sortable "Owner Chain" column after Rep. Cell is a truncated `Carol › Bob › Alice` rendered via a local `ownerChainNames` helper (kept inline so the table doesn't have to subscribe to the full store; reuses members + teams it already had as props). Sort key: `'ownerChain'` returns the chain joined with `' › '` so it sorts alphabetically by leaf rep then up.

### Cycle prevention + edge cases

- `reparentTeam` refuses to move a team under one of its descendants. Same guard belongs in any future "Edit parent" UI.
- Removing a member who is the lead clears `leadMemberId` on that team.
- Cascade-delete drops descendant teams + their members (with explicit Directus delete calls so SET-NULL'd accounts aren't left referencing zombies).

### Verified
- `npm run lint`, `npx tsc --noEmit`, `npm run build` — all clean. `/teams` route still in the prerendered list.
- `node scripts/bootstrap-directus.mjs` (idempotent) created the two `teams` columns, two relations, and granted full CRUD perms on `teams` to Editor + read to Viewer.

## Part 6 — /teams view modes (Nested · List · Tree)

`/teams` now offers three views via a header toggle. All three exist alongside each other; user picks per session (in-memory, not persisted).

- **Nested** (default, unchanged from Part 5) — full `TeamCard`s with sub-teams recursively rendered inside their parent's expanded body. Best for mid-depth editing.
- **List** — every team rendered as a flat `TeamCard`. New `flat` prop on `TeamCard` (1) hides the recursive Sub-teams section and (2) renders an ancestor breadcrumb (e.g. `Sales › NA ›`) above the team name. The "Add sub-team" button only appears in Nested view since List doesn't show parent-child structure inline; users add sub-teams via the global New Team modal's parent picker.
- **Tree** — new `components/teams/TeamTreeView.tsx`. Compact one-line-per-team renderer with file-tree branch glyphs (`├─` / `└─`), expand/collapse per node, color dot, name, lead chip, account count badge, and a hover "Add sub-team" button. Branch lines are drawn via per-level rails: each row carries an `ancestorLastFlags` array describing whether each ancestor was the last sibling at its level — rails render only where the ancestor wasn't last, so descenders stop correctly.

`Lead` lifecycle also got cleaned up at this stage: lead is now an explicit "Team lead" checkbox in the `MemberRow` edit form (next to the Level dropdown), separate from the Level=Lead enum value. The standalone star button in the row view is gone — leads now show a small read-only `Lead` chip alongside the level badge.

### Verified (Part 6)
- `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean; `/teams` still in the prerendered routes.
- Each view mode renders without runtime errors; toggle preserves expand state per node within a session (Nested/Tree expansion lives on individual components and resets when remounted, which happens when switching modes — acceptable tradeoff for code simplicity).

## Part 7 — Hierarchy levels are user-managed

The role/level set (`IC | Lead | Manager | Director | VP | CRO`) was a hardcoded TypeScript union referenced from 5 source files plus 2 spots in the bootstrap script. Moved them to a Directus-backed `hierarchy_levels` collection so the user can add/edit/delete/reorder roles from a modal on `/teams`. Same shape as `field_definitions` for accounts.

### Backend

- **New `hierarchy_levels` collection** in `scripts/bootstrap-directus.mjs`. PK is a *slug-style string id* (e.g. `ic`, `manager`) — chosen over uuids so the column values that ride on `members.level` stay human-readable in the Directus admin. Fields: `id` (string PK, readonly), `label`, `color` (`select-color`), `sort` (integer, hidden).
- **Idempotent seeder.** After the relations block, `GET /items/hierarchy_levels?aggregate[count]=*` decides whether to insert the six defaults (`ic`/`lead`/`manager`/`director`/`vp`/`cro`). Re-runs with any existing rows are no-ops.
- **`members.level` is just a string slug now.** The hardcoded `select-dropdown` choice list on the `members.level` field was dropped from both the collection definition and the `tryCreateField` backfill. The field becomes `interface: 'input'`. Existing fields on already-bootstrapped instances aren't modified (`tryCreateField` skips existing); the app reads/writes the slug directly so the admin's stale dropdown doesn't matter.
- Permissions sweep extended to include `hierarchy_levels`.

### Lib + types

- `types/territory.ts`: `HierarchyLevel` is now `type HierarchyLevel = string` (a slug). New `HierarchyLevelDef { id, label, color, sort }`. `TerritoryStoreState` gains `hierarchyLevels` + `hierarchyLevelOrder`. `Member.level` shape unchanged.
- `lib/directus-mappers.ts`: new `LevelRow`, `rowToLevel`, `levelToRow`. `rowToMember` default `level` is `''` (no longer a hardcoded `'IC'`).
- `lib/directus.ts`: new `getHierarchyLevels()` returning `{ levels, order }` sort-aware.
- `lib/directus-write.ts`: new `createLevel`, `updateLevelRemote`, `deleteLevel`, `reorderLevels` (sequential PATCHes mirroring `reorderFieldDefs`).

### Store

- `store/slices/hierarchyLevelsSlice.ts` mirrors the post-Part-5 `teamsSlice`: state `hierarchyLevels` + `hierarchyLevelOrder`, actions `addLevel(label, color)`, `updateLevel`, `reorderLevels`, `removeLevel(id, fallbackId)`, `hydrateLevels`. `addLevel` slugifies the label (lowercased, non-alphanum → `-`, trim, fallback `level`) and dedupes against existing ids with `-2`/`-3` suffixes. `removeLevel` migrates every `members[mid].level === id` to `fallbackId ?? ''` locally and fires `updateMemberRemote` per affected member.
- `store/slices/hierarchyLevelsSelectors.ts`: `useHierarchyLevels`, `useHierarchyLevelOrder`, `useHierarchyLevel(id)`.
- Wire-up: `store/types.ts`, `store/territoryStore.ts` (new slice + new persist keys), `hooks/useTerritoryStore.ts` (re-export selectors).

### Hydration

- `useDirectusAccounts.ts` adds `getHierarchyLevels()` to its `Promise.all` with the same tolerate-and-warn fallback as `getGeoNodes`/`getTeams`. **Order matters:** `hydrateLevels` runs *before* `hydrateMembers` so `member.level` ids resolve at first paint.

### UI

- **`MemberRow`** — drops the hardcoded `LEVELS` array and `LEVEL_COLORS` map. Edit-form dropdown reads from `useHierarchyLevels`/`useHierarchyLevelOrder`; disabled with "No levels defined" placeholder if empty. Row chip pulls color from `levels[member.level].color`. If `member.level` is set but the level def is missing (orphan after delete), shows a neutral grey chip with the raw slug + tooltip "Unknown level — was it deleted?".
- **`AddMemberModal`** — same swap. Default level is `levelOrder[0] ?? ''`. Dropdown disables with a different placeholder ("No levels defined — add one in Manage Levels") if the collection is empty.
- **`TeamsTableView`** — column headers and cell-match logic loop over `levelOrder` instead of the hardcoded `LEVELS` array.
- **`ManageLevelsModal`** (new, `components/teams/ManageLevelsModal.tsx`). Opens from a "Manage levels" button in `TeamsAdminView`'s header, next to the view toggle. Body: reorderable list (▲/▼ buttons, drag handle was overkill for the modest list), per-row color picker + label input (live-saves on blur), member-count badge, slug pill, trash button. Footer has "Add level" form (color picker + label + button) — slug derived from label. Delete shows an in-modal overlay confirm with a fallback-level `<select>` populated from the remaining levels (defaults to first remaining); if no members reference the level, the confirm is "safe to delete".

### Verified
- `npm run lint`, `npx tsc --noEmit`, `npm run build` — all clean.
- `node scripts/bootstrap-directus.mjs` (idempotent) created `hierarchy_levels`, granted CRUD perms to Editor + read to Viewer, seeded the six defaults.
- **Migration of legacy data** on the existing instance (8 member rows): `IC|Lead|Manager|Director|VP|CRO` → lowercase slugs. Directus REST doesn't support filter-based bulk PATCH on items, so the migration was a per-row Python loop (`GET /items/members?fields=id,level` → for each, `PATCH /items/members/<id>` with `{ level: '<lower>' }`). Bootstrap script comment updated to point at this approach for future upgraders.

### Future-proofing notes
- **Empty levels state**: `MemberRow` and `AddMemberModal` show placeholder text and disable the level dropdown. The org-grid table renders only depth columns. Users can recover by opening Manage Levels and adding one.
- **Orphaned `member.level` after delete-without-fallback**: the slug stays in the database with no matching def. UI renders neutral chip; the org-grid table puts the member in no level column. Use `removeLevel(id, fallbackId)` to migrate cleanly.

### Part 6.1 — List view became a member org-grid table

The flat-card "List" view was a stopgap. Reworked into a real table at `components/teams/TeamsTableView.tsx`:

- **Rows**: one per member.
- **Columns**: `L1, L2, …, LN` team-depth columns (auto-expand to the deepest team) + one column per `HierarchyLevel` (`IC, Lead, Manager, Director, VP, CRO`).
- **Cell semantics**: depth columns show the ancestor team name at that depth (with `↳` to suppress repeated team names from the row above for visual grouping); sales-level columns are blank except the column matching the member's level, where the member's name appears (with a small `Lead` chip if they are the team lead).
- **Sort**: default sort is by team path (root → leaf, alphabetical), then by member name. Header sort is not interactive in this version — call out if needed.
- The `flat` prop on `TeamCard` from the prior pass was removed (dead code) and the breadcrumb-subtitle ancestor path stripped — `TeamCard` is back to its Part 5 shape.

Wiring: `view === 'list'` in `TeamsAdminView` now renders `<TeamsTableView />` instead of stacked `TeamCard`s.

## Part 8 — CRM generalization (in progress)

Plan: `~/.claude/plans/curious-purring-snail.md`. Direction confirmed 2026-05-02:
turn `/accounts` into a customizable customer-management system. Decisions:
add CRM primitives (Contacts/Activities/Notes/Tasks), keep
territory/map/Won-Lost as a per-workspace toggleable module, true
multi-tenant via a workspace-per-tenant model. Multi-entity workspace
(user-defined entity types beyond Account) explicitly deferred.

### Slug-PK decision
`pipeline_stages.id` and `hierarchy_levels.id` are currently global string
slugs — incompatible with multi-tenant. Migrating to uuid PKs with a `slug`
column unique-per-workspace; `accounts.stage_id` and `members.level`
cascade to uuid FKs. Bootstrap will detect legacy schema and refuse on
existing instances; a separate `scripts/migrate-to-multitenant.mjs` does
the per-row rewrite.

### Phase 1.1a — workspace collections (shipped)

`scripts/bootstrap-directus.mjs` only. Non-destructive: existing
collections untouched.

- New collections `workspaces` (id, name, slug, sort, created_at),
  `workspace_members` (workspace_id, user_id → directus_users, role:
  owner/admin/member), `workspace_settings` (1:1 with workspaces:
  entity_noun_singular/plural, owner_noun, modules_enabled JSON,
  brand_color).
- New field `directus_users.current_workspace` (uuid M2O → workspaces),
  added via `tryCreateField` and relation with `ON DELETE SET NULL`.
- Relations: `workspace_members.workspace_id → workspaces` (CASCADE),
  `workspace_members.user_id → directus_users` (CASCADE),
  `workspace_settings.workspace_id → workspaces` (CASCADE).
- Permissions: `COLLECTIONS` array extended with the three new
  collections so Viewer/Editor get the right CRUD.
- Idempotent seed: ensures a `Default` workspace (slug=`default`) and a
  matching `workspace_settings` row exist after run. The Default
  workspace's settings use `owner_noun: 'Rep'` to preserve the
  legacy/sales feel; new workspaces (Phase 1.5 onboarding) will default
  to `'Owner'` via the column default.

Re-running on an existing instance creates only the new collections and
the Default workspace — no existing data is modified.

### Phase 1.1b — workspace_id everywhere + backfill (shipped)

`scripts/bootstrap-directus.mjs` only.

- New `WORKSPACE_SCOPED` array drives a `tryCreateField` loop adding
  `workspace_id` (uuid M2O) to `accounts`, `field_definitions`,
  `pipeline_stages`, `hierarchy_levels`, `members`, `teams`, `geo_nodes`.
- Matching `<col>.workspace_id → workspaces` relations created with
  `ON DELETE SET NULL` (orphans become invisible to policy filters in
  Phase 1.2 — safer default than CASCADE; no data destroyed on
  workspace delete).
- Default seeds for `hierarchy_levels` and `pipeline_stages` now spread
  `workspace_id: defaultWorkspaceId` into the insert payload so fresh
  instances start in the Default workspace.
- Backfill loop after the column-add: per collection, GET rows where
  `workspace_id` is null, PATCH each to `defaultWorkspaceId`. Runs every
  bootstrap (cheap when no orphans).

Idempotent and non-destructive. Existing instances pick up the column +
relation + get all legacy rows reattached to Default in one run.

### Phase 1.1c.i — Bootstrap target schema (shipped)

`scripts/bootstrap-directus.mjs` only.

- `pipeline_stages` and `hierarchy_levels` collection definitions: `id`
  changed from `string` (slug PK) to `uuid` auto-gen; new `slug` field
  (string, app-enforced unique-per-workspace).
- `accounts.stage_id` and `members.level` collection definitions + their
  `tryCreateField` backfills: changed from `string` to `uuid`. New
  `members.level → hierarchy_levels` relation registered (didn't exist
  before — was a non-FK string slug).
- `DEFAULT_PIPELINE_STAGES` / `DEFAULT_HIERARCHY_LEVELS` data shape:
  `id: 'prospect'` → `slug: 'prospect'` (DB auto-generates the uuid PK).
- End-of-bootstrap legacy-schema detector: checks
  `/fields/pipeline_stages/id.type` and `/fields/hierarchy_levels/id.type`.
  If either is still `'string'`, prints a non-blocking warning pointing
  at the migration script.
- Existing instances are unaffected: `tryCreate` is a no-op on existing
  collections, so the legacy schema continues working in single-workspace
  mode. Only fresh instances get the v2 schema directly.

### Phase 1.1c.ii — migrate-to-multitenant.mjs (shipped)

New file: `scripts/migrate-to-multitenant.mjs`. **Read-only** against
Directus REST. Detects v2-already, exits cleanly. Otherwise:

- Reads all `pipeline_stages`, `hierarchy_levels`, `accounts`, `members`
  rows.
- Mints a uuid per legacy slug, building two `slug → uuid` maps.
- Generates `migration-1.1c.sql` in the project root containing:
  1. Drop `accounts_stage_id_foreign` and `members_level_foreign`
     constraints.
  2. `ALTER TABLE` to add staging `new_id` (uuid) and `slug` (varchar)
     columns on `pipeline_stages` and `hierarchy_levels`.
  3. Per-row `UPDATE` to backfill `new_id` and `slug` (one statement per
     legacy slug — keeps the SQL deterministic and reviewable).
  4. `ALTER COLUMN ... TYPE uuid USING (CASE WHEN slug = ... THEN uuid …)`
     to convert `accounts.stage_id` and `members.level` from text to
     uuid in place. Unknown slugs land in NULL (script logs a warning
     when it detects dangling references).
  5. Drop legacy PK constraint, drop old `id` column, rename `new_id` →
     `id`, recreate PK.
  6. Re-add FK constraints (now uuid → uuid).
- Whole thing wrapped in `BEGIN/COMMIT`.
- Prints next-step instructions: pg_dump backup, review SQL, apply via
  `psql`, re-run bootstrap (legacy warning should disappear), wait for
  Phase 1.3 app-side updates.

Why generate SQL instead of executing: Directus REST cannot change PK
column types or swap PKs. Going through Postgres directly (with the user
reviewing the file) is the only safe path. Constraint names assume
Directus/Knex defaults — script flags this in the SQL file's header so
the user knows to adjust if their instance differs.

### Phase 1.3 — App-side workspace plumbing (shipped)

New `lib/workspace.ts`:
- `getCurrentWorkspaceId()` — module-cached. Reads
  `directus_users.me.current_workspace`; if null, falls back to looking
  up the seeded `Default` workspace by `slug=default` and PATCHes the
  user's `current_workspace` to it. Throws if neither resolves
  (instructs the user to run bootstrap).
- `setCurrentWorkspaceId(id)` — PATCHes `users/me`, updates cache.
  Phase 1.4's switcher will call this.
- `clearWorkspaceCache()` — for sign-out.
- `withWorkspace(body)` — async helper that injects `workspace_id` into
  any Directus write payload.
- In-flight Promise dedupe so concurrent first-call usage doesn't fire
  two `users/me` requests.

`lib/directus.ts:fetchItems` now awaits the workspace id and appends
`?filter[workspace_id][_eq]=<wid>` to every read URL. Every existing
read function (accounts/field_definitions/members/pipeline_stages/
hierarchy_levels/teams/geo_nodes) goes through `fetchItems`, so all
seven are now scoped.

`lib/directus-write.ts` — eight create functions injected with
workspace_id via `withWorkspace`: `createAccount`, `createAccountsBulk`
(per-element via `getCurrentWorkspaceId` once + spread), `createFieldDef`,
`createGeoNode`, `createStage`, `createLevel`, `createTeam`,
`createMember`. Updates / deletes / reorders unchanged — they target a
specific row id.

### Known gap (deferred to 1.3b after migration runs)

The app still treats `accounts.stage_id` and `members.level` as string
slugs, matching legacy DB. Once `migrate-to-multitenant.mjs` runs and
those columns become uuids, mappers/UI need to switch to using the new
`slug` column for display while keeping uuid for the FK. **Don't run
the migration script yet** — wait until 1.3b ships post-1.5.

### Phase 1.4 — WorkspaceSwitcher UI + hydration reset (shipped)

`lib/workspace.ts` extensions:
- Tiny pub/sub: `subscribeWorkspace(listener)` + `getWorkspaceSnapshot()`
  expose the cached id to React. `setCurrentWorkspaceId` and
  `clearWorkspaceCache` call `notify()` so subscribers re-render.
- New `getMyWorkspaces()` returns `{ id, name, slug }[]` (sorted by
  `sort,name`). Currently returns whatever the user can read on
  `workspaces`; once Phase 1.2 + workspace_members joins arrive, this
  filters to the user's workspaces.

New `hooks/useCurrentWorkspaceId.ts`: `useSyncExternalStore` over the
pub/sub. Returns `null` on first render then the resolved id. Kicks
`getCurrentWorkspaceId()` lazily so the auto-fall-back-to-Default flow
fires from a component context.

New `components/WorkspaceSwitcher.tsx`: native `<select>` listing the
user's workspaces. On change, calls `setCurrentWorkspaceId(id)`; the
notify ripples to every subscriber. Renders nothing if zero workspaces.

`hooks/useDirectusAccounts.ts` extended: depends on
`useCurrentWorkspaceId()`. Effect waits for the workspace id to settle
then re-runs the parallel hydration fetch — every read in
`lib/directus.ts` is already workspace-scoped, so swapping workspaces
re-hydrates the store with the new tenant's data automatically.

`lib/auth.ts.logout` now calls `clearWorkspaceCache()` before
`notify()` so the next user starts with a clean slate.

Switcher wired into all three top bars: `AccountsToolbar.tsx`,
`components/territory/toolbar/Toolbar.tsx`,
`components/teams/TeamsAdminView.tsx` — placed right after the
"Sales Deployment" branding label, before the page-pill nav.

### Phase 1.2 — Server-side workspace isolation (shipped)

`scripts/bootstrap-directus.mjs` only.

- Replaced the flat `grantPermissions` helper with two new constructs:
  - **`ensurePermission(token, policyId, collection, action, opts)`** —
    upserts a single permission row. Unlike `tryCreate`, this `GET`s
    the existing row and `PATCH`es it; without that, re-running
    bootstrap on a live instance would silently leave legacy
    no-filter permissions in place.
  - **`grantPolicyPermissions(token, policyId, actions, label)`** —
    iterates two new module-level constants: `WORKSPACE_SCOPED_COLLECTIONS`
    (the seven tenant-data tables) and `UNSCOPED_COLLECTIONS`
    (`workspaces`, `workspace_members`, `workspace_settings`).
- For workspace-scoped collections, every permission row carries:
  - `read/update/delete` →
    `permissions: { workspace_id: { _eq: '$CURRENT_USER.current_workspace' } }`
  - `create` →
    `validation: { workspace_id: { _eq: '$CURRENT_USER.current_workspace' } }`
    plus `presets: { workspace_id: '$CURRENT_USER.current_workspace' }`
    so the column auto-fills if the client forgets.
- Unscoped collections keep wide-open Editor (CRUD) / Viewer (read).
  Refining `workspaces` to filter by `workspace_members` membership is
  Phase 1.5's responsibility.
- The 1.1b loops (workspace_id column add + backfill) now reuse the
  module-level `WORKSPACE_SCOPED_COLLECTIONS` instead of a local
  duplicate.

Net effect after re-running bootstrap on a live instance: the admin
account is unaffected (admin policy bypasses these filters). Editor /
Viewer users now see *only* rows in their current workspace, and any
write they attempt is filtered/preset to it. Combined with Phase 1.3's
client-side filter + injection, isolation is enforced on both ends.

### Phase 1.5 — Onboarding + seedWorkspaceDefaults + tighter perms (shipped)

**Bootstrap (`scripts/bootstrap-directus.mjs`)**

- New top-level helper `seedWorkspaceDefaults(token, workspaceId, opts)`
  consolidates the per-workspace seed: `workspace_settings` row + the
  default 5 stages + 6 levels. Idempotent per-workspace (queries
  `?filter[workspace_id][_eq]=...` to detect already-seeded). Optional
  `opts.ownerNoun` lets Default keep its sales-flavored "Rep" while new
  workspaces default to "Owner" via the column default.
- `main()` reordered so the workspace_id column-add (1.1b) runs *before*
  `seedWorkspaceDefaults` — otherwise the seed POSTs writes a column
  that doesn't exist on fresh instances. The legacy standalone
  hierarchy_levels / pipeline_stages seed blocks are gone.
- `ensurePermission` extended with two new opt flavors:
  - `scopedByUser` (used by `workspace_members`): permissions/validation
    of `{ user_id: { _eq: '$CURRENT_USER' } }`, plus `presets:
    { user_id: '$CURRENT_USER' }` on create so user_id auto-fills.
  - `scopedBySettingsWorkspace` (used by `workspace_settings`): read /
    update / delete restricted to `current_workspace`'s row. Create is
    deliberately left open so onboarding can write the settings row
    *before* flipping `current_workspace`.
- `grantPolicyPermissions` now hard-codes the three workspace admin
  collections per profile: `workspaces` open, `workspace_members`
  scoped-by-user, `workspace_settings` scoped-by-settings-workspace.
- New backfill block: every existing Directus user gets a
  `workspace_members` row in Default (idempotent — skips users with an
  existing row). Runs after seeding so existing users still see Default
  in the new switcher.

**App (`lib/workspace.ts`)**

- `getMyWorkspaces()` rewritten as a two-step query: fetches the user's
  `workspace_members` rows (the policy filters to me automatically),
  collects `workspace_id`s, then loads matching `workspaces` rows by
  id. Users now see only workspaces they're members of.
- New `createWorkspace(name)`:
  1. POST `workspaces` (slug from name).
  2. POST `workspace_members` (owner) — `user_id` auto-fills via
     preset.
  3. POST `workspace_settings` row (workspace_id explicit; create is
     unscoped so this works pre-flip).
  4. PATCH `users/me.current_workspace` so subsequent writes are
     workspace-scoped.
  5. POST 5 default `pipeline_stages` and 6 default `hierarchy_levels`
     — `workspace_id` injected via the policy preset, no need to
     send it.
- New `ensureMembership(workspaceId)` helper. The `getCurrentWorkspaceId`
  fallback now calls it before flipping to Default so existing users get
  a member row even if they signed up before the bootstrap backfill.
- Default stage/level constants duplicated from the .mjs (with a comment
  to keep them in sync) since `.ts` and `.mjs` can't share a runtime
  module.

**App (`components/WorkspaceSwitcher.tsx`)**

- `<select>` now has a separator option and a `+ New workspace…` action.
  Selecting it `prompt()`s for a name, calls `createWorkspace(name)`,
  and the existing pub/sub fires hydration. `disabled` while creating.

### Phase 1.6 — End-to-end verification (shipped)

**Static checks (run from `vegeta/`):**

- `npm run lint` — clean.
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds. Route table:
  `/`, `/accounts`, `/login`, `/teams`, `/territory`, plus the auth
  API routes. No `/onboarding` route — onboarding lives inline in
  `WorkspaceSwitcher` (the `+ New workspace…` action), avoiding a
  forced redirect for users who already have Default.
- `node --check scripts/bootstrap-directus.mjs` and
  `node --check scripts/migrate-to-multitenant.mjs` — both syntax-OK.

**Live-instance runbook (user runs):**

1. `node scripts/bootstrap-directus.mjs` against the live Directus.
   Idempotent — re-runs on an existing instance: PATCHes existing
   permissions to add the workspace filters, ensures Default workspace
   + settings, backfills `workspace_members` for every Directus user,
   and seeds defaults. Watch for the legacy-schema warning — if
   present, it points at `migrate-to-multitenant.mjs`.
2. Reload `/accounts` — `WorkspaceSwitcher` shows "Default". Existing
   data (accounts/teams/etc.) appears as before.
3. Switcher → `+ New workspace…` → name (e.g. `Acme`).
   `lib/workspace.ts.createWorkspace` runs: creates workspace,
   attaches you as owner, seeds settings + 5 stages + 6 levels,
   flips `current_workspace`. Page re-hydrates empty.
4. Add a row in the new workspace (an account). Switch back to
   Default — old data reappears, new row hidden.
5. Switch to Acme — new row visible, Default data hidden.
6. Cross-tenant probe (optional): in DevTools, hit
   `${BASE}/items/accounts?filter[workspace_id][_eq]=<other-ws-id>` —
   policy returns `[]`. The server filter is enforced; the
   client-side filter in `lib/directus.ts` is just defense in depth.

**Known gaps deferred:**

- `workspaces` (top-level) read is still open per-policy: the user
  could in theory see workspace metadata for ones they're not in by
  hand-crafting a request. The switcher already filters via
  `workspace_members` so the UI only shows workspaces they belong
  to. Tightening to a relational `_some` filter is Phase 4 polish.

Phase 1 is shipping-complete. The remaining work in vegeta on the CRM
roadmap is **Phase 2** (decouple sales jargon — entity-noun /
owner-noun / module gates), **Phase 3** (CRM primitives — Contacts,
Activities/Notes, Tasks), and **Phase 4** (onboarding polish + per-
workspace settings page + import-alias customization).

### Phase 1.3b — Adapt app code to post-migration schema (shipped)

After `migrate-to-multitenant.mjs` runs against a live instance,
`pipeline_stages.id` and `hierarchy_levels.id` become uuids and the
human-readable identifier moves to a new `slug` column. App code now
matches that shape so a freshly migrated instance renders correctly.

- `types/territory.ts`: `PipelineStage` and `HierarchyLevelDef` gain a
  `slug: string` field. `id` comments updated to "uuid PK".
- `lib/directus-mappers.ts`: `PipelineStageRow` and `LevelRow` gain
  `slug: string | null`. `rowToStage` / `rowToLevel` map it through
  (falling back to `r.id` when null, so legacy single-tenant
  pre-migration data keeps rendering even before the migration runs).
  `stageToRow` / `levelToRow` write `slug` on create/update.
- `store/slices/pipelineStagesSlice.ts` and
  `store/slices/hierarchyLevelsSlice.ts`: `addStage` / `addLevel`
  generate `id = crypto.randomUUID()` and a slugified `slug` deduped
  against the existing slug set (no longer the id map). `uniqueSlug`
  refactored to take a `(s: string) => boolean` predicate. The
  Directus create payload includes both `id` and `slug`.
- `components/accounts/ManageStagesModal.tsx` and
  `components/teams/ManageLevelsModal.tsx`: the small monospace
  identifier pill switched from `{id}` (now a uuid — ugly) to
  `{stg.slug}` / `{lvl.slug}`. Tooltip wording updated.
- `accounts.stageId` and `members.level` still use the same string
  field (uuid post-migration). KanbanBoard, MemberRow, and other
  consumers compare uuid-to-uuid via map keys — no logic change
  needed since neither end was treating the value as
  human-readable.

Verified clean: `npm run lint`, `npx tsc --noEmit`, `npm run build`
(11/11 static pages). Same routes as 1.6.

This bridges the schema gap. Now the user can run
`migrate-to-multitenant.mjs` against the live Directus and the app
will continue to render and accept writes correctly.
  (separate destructive script).
- 1.2 policies → 1.3 mappers/writes → 1.4 switcher UI → 1.5 onboarding
  → 1.6 verify.

### Phase 2.1 — Workspace settings hooks (shipped)

Foundation for Phase 2: per-workspace UI presentation needs read access
to `workspace_settings` (entity noun, owner noun, modules_enabled).
Built four hooks; everything downstream in Phase 2 (label replacement,
module gates) consumes them.

- `hooks/useWorkspaceSettings.ts`: fetch + workspace-id-keyed cache
  using `useSyncExternalStore`. Hits
  `/items/workspace_settings?filter[workspace_id][_eq]=…&limit=1`,
  parses `modules_enabled` (tolerates JSON-string or already-parsed
  object), normalizes the row into a `WorkspaceSettings` object.
  Returns `DEFAULT_SETTINGS` (Account/Accounts/Owner, all modules on)
  until the row resolves so first paint matches the sales-default
  configuration. Exports `invalidateWorkspaceSettings(workspaceId)`
  for the eventual settings page (Phase 4).
- `hooks/useEntityNoun.ts`: thin wrapper —
  `useEntityNoun('singular' | 'plural')`.
- `hooks/useOwnerNoun.ts`: thin wrapper.
- `hooks/useModuleEnabled.ts`:
  `useModuleEnabled('territory' | 'contacts' | 'activities' | 'tasks')`.

Cache is per-workspace-id, so switching back and forth in a session
hits cache. `invalidateWorkspaceSettings(id)` is the explicit reset
hatch for when a future `/settings/workspace` page edits the row.

Verified clean: `npx tsc --noEmit`. No UI surfaces consume these yet
— that's Phase 2.2.

### Phase 2.2 — Replace hardcoded entity/owner labels (shipped)

Swept user-facing "Account" / "Accounts" / "Rep" / "Sales Rep" copy
to read through the Phase 2.1 noun hooks. DB columns and TypeScript
type names (`Account`, `repId`, `Account[]`) are unchanged — only
visible strings move.

- `app/accounts/page.tsx`: metadata title becomes `'Accounts'` and
  description drops the sales-rep wording. Static metadata can't read
  workspace settings; the per-workspace label still applies on the
  page chrome itself.
- `components/accounts/AccountsToolbar.tsx`: "Accounts" nav pill,
  "Add Account" CTA, search placeholder, and the row-count footer
  read from `useEntityNoun('singular' | 'plural')`. Footer pluralizes
  on `totalCount === 1`.
- `components/accounts/AddEditAccountModal.tsx`: dialog title, Name
  label, Save CTA all use `useEntityNoun`. "Sales Rep" select label
  uses `useOwnerNoun()`.
- `components/accounts/AccountsTable.tsx`: empty state ("No
  {plural} found"), bulk-delete confirm, and the previously
  hardcoded "Rep" sort header now use the hooks. The visual `{/* Rep
  */}` comment was left as-is — it's not user-visible.
- `components/accounts/AccountsImportModal.tsx`: dialog title becomes
  `Import {entityPlural}`.
- `components/accounts/ManageStagesModal.tsx`: per-stage count tooltip
  becomes `${entityPlural} at this stage`.
- CSV import wizard:
  - `import/UploadStep.tsx`: required-fields hint uses ownerNoun in
    place of "Rep".
  - `import/MapStep.tsx`: preview header row substitutes ownerNoun.
  - `import/ConfigureStep.tsx`: `ROLE_OPTIONS` was at module scope
    so it couldn't read hooks; refactored to a `buildRoleOptions
    (ownerNoun)` factory called via `useMemo` inside the component.
- Top bars on the other two pages: `territory/toolbar/Toolbar.tsx`
  (nav pill + the "Accounts loaded from Directus" indicator label and
  tooltip) and `teams/TeamsAdminView.tsx` (nav pill) both use
  `useEntityNoun('plural')`.

Hooks return defaults ("Account"/"Accounts"/"Owner") on first paint
so the sales-default workspace looks identical to before; a workspace
with `entity_noun_plural="Patients"` and `owner_noun="Case Manager"`
now reflects those everywhere the user sees them.

Verified clean: `npx tsc --noEmit`, `npm run lint`. Module gates and
seed-template work follow in 2.3 and 2.4.

### Phase 2.3 — module gates for territory

Generic-CRM workspaces with `modules_enabled.territory === false`
should never expose the territory surface. Implemented as three
guards driven by `useModuleEnabled('territory')`:

- `components/territory/TerritoryApp.tsx`: early-returns `null` and
  `router.replace('/accounts')` from a `useEffect` when the module
  is off. The `/territory` route is client-rendered (`ssr: false`)
  so the redirect happens after settings hydrate; pre-hydration
  default of `true` keeps the sales workspace flicker-free. State
  hooks (`useState`) moved above the early return to keep
  rules-of-hooks order stable.
- `components/accounts/AccountsToolbar.tsx` and
  `components/teams/TeamsAdminView.tsx`: the "Territory" nav pill
  in the top bar is wrapped in `{territoryEnabled && …}`. The
  active page's pill (Accounts / Teams) and the other nav pill
  remain visible.
- `components/accounts/AddEditAccountModal.tsx`: the entire Geo
  picker block (label, `<GeoPicker>`, helper copy) is hidden when
  the module is off. Country/State inputs stay — they're useful
  metadata regardless of whether a territory map is in play.

Map-internal controls (`WorldMapView`, `DrillDownMapView`,
`MapLegend`, `GeoSidebarPanel`, the territory toolbar's
paint/eraser/theme/account-metric buttons) are not individually
gated: the redirect at the route level prevents the territory
toolbar from rendering at all when the module is off, which is
strictly cheaper than per-component guards.

Verified clean: `npx tsc --noEmit`, `npm run lint`.

### Phase 2.4 — seed templates + drop DEFAULT_FIELD_DEFS

Replaced the implicit "every new workspace gets the sales starter
kit" with an explicit per-template seed.

- `lib/seedTemplates.ts` (new): one source of truth for what a
  fresh workspace gets. Each `SeedTemplate` carries
  `settings` (entity nouns, owner noun, modules_enabled), `stages`
  (pipeline_stages with `is_won`/`is_lost`), `levels`
  (hierarchy_levels), and `fieldDefs` (categorical/metric/text).
  Templates: `blank` (territory off, generic Record/Records,
  Active+Archived stages, no field defs), `sales` (preserves the
  prior bootstrap behavior — Account/Accounts/Rep, full pipeline,
  full field defs, territory on), `agency` (Client/Clients,
  Account Manager, retainer/service-type fields), `real-estate`
  (Property/Properties, Agent, list-price/bedrooms/bathrooms/sqft).
- `lib/accountFields.ts`: dropped `DEFAULT_FIELD_DEFS`. The only
  consumer was `accountsSlice.ts` initializing `fieldDefs` to the
  hardcoded list before the first Directus fetch — now seeded as
  `[]` since defs come from the workspace's field_definitions
  rows. `csvParser.ts`'s `STAGE_ALIASES` is unaffected (it never
  read the constant).
- `lib/workspace.ts`: `createWorkspace(name, templateId = 'blank')`
  now drives seeding from the chosen template — settings,
  pipeline_stages, hierarchy_levels, AND field_definitions (the
  previous implementation never seeded field defs at all). The
  duplicated `DEFAULT_PIPELINE_STAGES`/`DEFAULT_HIERARCHY_LEVELS`
  constants are gone; both come from `seedTemplates`. App-side
  workspace creation defaults to `'blank'`, matching Phase 2's
  intent that generic CRM is the new default.
- `scripts/bootstrap-directus.mjs`: mirrors `SEED_TEMPLATES`
  inline (the `.mjs` script can't import the `.ts` module at
  runtime — kept consistent by convention, with a comment marking
  the duplication). `seedWorkspaceDefaults(token, workspaceId,
  { template })` accepts a template id (default `'sales'` so
  re-running bootstrap on existing instances is a no-op). Also now
  seeds `field_definitions` on a fresh workspace, gated by the
  same idempotence check used for stages/levels. The Default
  workspace seed call passes `{ template: 'sales' }` explicitly.

`WorkspaceSwitcher`'s "+ New workspace…" prompt is unchanged —
template selection at the UI layer is Phase 4 onboarding work, not
in scope here. New workspaces created from the app land on `blank`.

Verified clean: `npx tsc --noEmit`, `npm run lint`.

### Phase 2.5 — completion-stage UI for is_won/is_lost

`ManageStagesModal` already exposed per-stage `isWon`/`isLost`
checkboxes, but the labels read "Won" / "Lost" — sales-only
jargon that doesn't match an Agency or Real Estate workspace.

- `components/accounts/ManageStagesModal.tsx`: relabeled the
  checkboxes to "Complete" (positive terminal — Won, Sold, Active,
  Customer) and "Dropped" (negative terminal — Lost, Churned,
  Withdrawn). Tooltips spell out the per-template synonyms so
  sales users recognize the mapping. The mutual-exclusion onChange
  logic is unchanged. The DB columns and TS field names stay
  `is_won` / `isWon` / `isLost` — only user-visible strings move.

This was the only user-visible surface using the Won/Lost wording;
`grep` confirms all remaining occurrences are types, mappers,
seed data, and the JSDoc on the column itself.

Verified clean: `npx tsc --noEmit`, `npm run lint`. Phase 2 closed.

### Phase 3.1 — schema for contacts/activities/tasks (shipped)

Added the three new collections plus the `entity` discriminator on
`field_definitions` so contacts/activities/tasks each get their own
custom-field set (per user direction — all four entities use the
field-def system).

- `scripts/bootstrap-directus.mjs`: new `CONTACTS_COLLECTION`,
  `ACTIVITIES_COLLECTION`, `TASKS_COLLECTION` (all uuid PK + workspace
  scope inherited via `WORKSPACE_SCOPED_COLLECTIONS`). Columns:
  - **contacts**: `account_id` (required, CASCADE), `name` (required),
    `email`, `phone`, `title`, `is_primary`, `fields` JSON, `sort`.
  - **activities**: `account_id` (required, CASCADE), `contact_id`
    (optional SET NULL), `kind` dropdown (note/call/email/meeting,
    default `note`), `body` text, `occurred_at`, `created_by` →
    members (SET NULL), `fields` JSON.
  - **tasks**: `account_id` (optional CASCADE — standalone tasks
    allowed), `title` (required), `due_at`, `completed_at` (null =
    open), `assignee_id` → members (SET NULL), `fields` JSON.
- `field_definitions.entity` column added with dropdown
  (`account`/`contact`/`activity`/`task`, default `account`).
  `tryCreateField` runs on existing instances and a one-shot
  PATCH backfills any `null` rows to `'account'`.
- `WORKSPACE_SCOPED_COLLECTIONS` now includes `contacts`,
  `activities`, `tasks` — `tryCreateField(workspace_id)` and the
  policy-grant loop pick them up automatically, so workspace
  isolation + per-action permissions land for free.
- `seedWorkspaceDefaults` writes `entity: def.entity ?? 'account'`
  on every seeded field def (so existing sales/agency/real-estate
  starter kits land tagged correctly).
- `lib/accountFields.ts`: `FieldEntity` type added; `FieldDefinition.entity`
  is now required.
- `lib/seedTemplates.ts`: `FieldDefSeed = Omit<FieldDefinition, 'id' | 'entity'> & { entity?: FieldEntity }`
  so existing template entries (account-only) don't need to repeat
  `entity: 'account'`.
- `lib/directus-mappers.ts`: `FieldDefRow.entity` + read/write
  through `rowToFieldDef` / `fieldDefToRow` (defaults to `'account'`
  on null rows from pre-3.1 instances).
- `lib/workspace.ts` (`createWorkspace`): writes `entity` on every
  seeded field def.
- Call-site fixes for the now-required `entity`:
  `components/accounts/ManageFieldsModal.tsx` (manual add UI hardcodes
  `'account'`), `components/accounts/import/importHelpers.ts`
  (CSV inference hardcodes `'account'`), `lib/fileParser.ts`
  (legacy inferField path).

No new modules toggled — `modules_enabled.contacts/activities/tasks`
already shipped on the seed templates in Phase 2.4.

Verified clean: `npx tsc --noEmit`, `npm run lint`. Live-instance
runbook: re-run `node scripts/bootstrap-directus.mjs` against the
existing Directus to materialize the three new tables, the entity
column, and the entity backfill. Idempotent.

### Phase 3.2 — types, mappers, slices (shipped)

App-side counterparts to the new collections from 3.1.

- `types/crm.ts` (new): `Contact`, `Activity`, `Task` domain types,
  `ActivityKind = 'note' | 'call' | 'email' | 'meeting'`. All three
  carry a `fields: Record<string, string | number>` map keyed by
  `field_definitions.id` (matching `entity`).
- `lib/directus-mappers.ts`: `ContactRow`, `ActivityRow`, `TaskRow`
  + `rowToContact`/`rowToActivity`/`rowToTask` and the inverse
  `contactToRow`/`activityToRow`/`taskToRow` (Partial-aware so
  PATCH bodies only carry the changed columns).
- `lib/directus-write.ts`: `createContact`/`updateContactRemote`/
  `deleteContact` (and same for activities + tasks). All POSTs
  go through `withWorkspace`; PATCHes target a row id and rely on
  the policy filter to enforce workspace.
- `lib/directus.ts`: `getContacts` (sorted by `sort`), `getActivities`,
  `getTasks` fetchers (mirroring `getAccounts` etc.).
- `store/slices/contactsSlice.ts`, `activitiesSlice.ts`, `tasksSlice.ts`
  (new): fire-write pattern from `geoSlice` — local mutation is
  synchronous, remote write is fire-and-forget with `console.error`
  on failure. Each slice owns `<entity>` map + `<entity>Order` array.
  - `contactsSlice`: `addContact`, `updateContact`, `removeContact`,
    `hydrateContacts`. `contactOrder` is insertion order.
  - `activitiesSlice`: `addActivity`, `updateActivity`,
    `removeActivity`, `hydrateActivities`. `activityOrder` re-sorts
    newest-first by `occurredAt` whenever it changes; `addActivity`
    defaults `occurredAt` to `now()`.
  - `tasksSlice`: `addTask`, `updateTask`, `toggleTaskComplete`,
    `removeTask`, `hydrateTasks`. `taskOrder` is open-first (by
    `dueAt` asc, null last), then completed (by `completedAt` desc)
    — recomputed on every mutation. `toggleTaskComplete` flips
    `completedAt` between `null` and `now()`.
- `store/slices/contactsSelectors.ts`, `activitiesSelectors.ts`,
  `tasksSelectors.ts` (new): `useContacts`, `useContactsForAccount`,
  `useActivitiesForAccount`, `useTasksForAccount`, `useAllTasks`,
  `useTasksForAssignee`. All filtered selectors use `useShallow`.
- `store/types.ts` + `store/territoryStore.ts`: three new slices
  composed into the root store; persist keys appended.

Hydration is wired in 3.3 — until then the new slices are reachable
in the store but stay empty across reloads.

Verified clean: `npx tsc --noEmit`, `npm run lint`.

### Phase 3.3 — hydration via useDirectusAccounts (shipped)

`hooks/useDirectusAccounts.ts` Promise.all extended to fetch
`getContacts`, `getActivities`, `getTasks` alongside the existing
seven loaders. Each new fetch wraps in `.catch(...) → []` with a
console.warn pointing at `scripts/bootstrap-directus.mjs` — same
tolerate-and-warn fallback as `getGeoNodes`/`getTeams`/etc., so
pre-3.1 instances (no contacts/activities/tasks tables yet) still
load the rest of the app.

Hydration order: contacts/activities/tasks run AFTER `hydrateAccounts`
since their rows reference `accounts.id`. The slices don't enforce
FKs — selectors filtering by `accountId` tolerate dangling ids on
purpose (the row will simply not appear under any account).

Verified clean: `npx tsc --noEmit`, `npm run lint`.

### Phase 3.4 — /accounts/[id] route with tabs (shipped)

Full deep-linkable detail route. Per user direction: route, not
drawer.

- `app/accounts/[id]/page.tsx` (new): server component awaiting
  `params` (Next 16 async-params requirement) and rendering
  `AccountDetailClient`.
- `app/accounts/[id]/AccountDetailClient.tsx` (new): client wrapper
  with `DirectusHydrationBoundary` + dynamically-imported
  `AccountDetail` (matches the `AccountsClient` pattern).
- `components/accounts/detail/AccountDetail.tsx` (new): shell with
  header (back-link to `/accounts`, account name, stage chip, rep,
  country, Edit button → existing `AddEditAccountModal`) and tab
  nav. Tabs: Overview (always), Contacts / Activity / Tasks (each
  gated by `useModuleEnabled('contacts'|'activities'|'tasks')`).
  Counts on each tab pulled from the per-account selectors. If the
  account id doesn't resolve in the store, renders a "Not found"
  fallback with a back link.
- `components/accounts/detail/OverviewTab.tsx` (new): two sections
  (Identity, Custom fields). Custom fields filtered by
  `entity === 'account'` and rendered via `formatFieldValue`. Edit
  control delegated to the header's modal — no inline editing yet.
- `components/accounts/detail/ContactsTab.tsx` (new): list +
  inline add-form with name/email/phone/title/primary toggle.
  Calls `addContact` / `updateContact` / `removeContact`. Renders
  contact-entity custom fields (`def.entity === 'contact'`). Has
  a "Make primary" button (toggles `isPrimary`); no
  exclusive-primary enforcement yet — Phase 4 cleanup.
- `components/accounts/detail/ActivityTab.tsx` (new): inline
  composer (kind dropdown + optional contact select + body
  textarea) above the timeline. `addActivity` defaults
  `occurredAt = now()`, `createdBy = null` (no current-member
  resolver wired yet). Timeline reads from
  `useActivitiesForAccount` (newest-first by occurredAt).
- `components/accounts/detail/TasksTab.tsx` (new): list + inline
  add-form (title / due-at / assignee). `toggleTaskComplete`
  flips `completedAt`. Inline assignee select per row. Overdue
  badge uses `useState(() => Date.now())` to satisfy
  `react-hooks/purity` (snapshot at mount; refreshes on next
  navigation — good enough for visual cue).
- `components/accounts/AccountsApp.tsx`: name-click in table /
  card-click in kanban now navigates to `/accounts/[id]` via
  `router.push` (Next.js `useRouter`) instead of opening
  `AddEditAccountModal`. Add modal still opened from toolbar
  "+ New". Edit happens from the detail page header.

Module-gate behavior: when a module is off, its tab is omitted
from the nav AND the panel content short-circuits via the
boolean guard (`tab === 'contacts' && contactsOn`) — defends
against a stale tab id surviving a settings change mid-session.

Verified clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

### Phase 3.5 — /tasks cross-account view (shipped)

Cross-account "all my tasks" page, gated on `modules_enabled.tasks`.

- `app/tasks/page.tsx` + `TasksClient.tsx` (new): standard
  hydration-boundary + dynamic-import-of-app pattern.
- `components/tasks/TasksApp.tsx` (new): top bar (matches the
  Territory / Accounts / Teams toolbars — workspace switcher,
  nav strip with the active "Tasks" pill, sign-out). Below: a
  filter row (open / overdue / completed / all + per-assignee
  filter + count + add button) and a stacked list of all tasks
  from `useAllTasks`. Each row: completion checkbox, title,
  account link → `/accounts/[id]`, due date (red when overdue),
  inline assignee select, remove. Inline add form supports
  standalone tasks (`accountId = null`) — picking "Standalone"
  in the account select. Overdue cutoff uses `useState(() => Date.now())`
  for `react-hooks/purity` compliance, same pattern as the per-account
  TasksTab.
- Module gate: if `modules_enabled.tasks` is off (mid-session
  settings change, or someone deep-links from another workspace),
  the page renders a fallback with a back link to the entity
  list — same belt-and-suspenders pattern used in the detail
  tabs.
- Top-bar nav added in three places, gated on `tasksEnabled`:
  - `components/accounts/AccountsToolbar.tsx`
  - `components/territory/toolbar/Toolbar.tsx`
  - `components/teams/TeamsAdminView.tsx`

Verified clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
`/tasks` registers as a static route; `/accounts/[id]` stays
dynamic. **Phase 3 complete.** Phase 4 (onboarding flow,
`/settings/workspace`, additive CSV aliases) remains ahead.

### Phase 4.1 — `/onboarding` route (shipped)

Replaces the bare `window.prompt` "+ New workspace" affordance
with a two-step picker, and gives genuinely-new signups a landing
page when they have zero workspace memberships.

- `lib/workspace.ts`: `createWorkspace(name, templateId,
  settingsOverrides?)` — third arg is `Partial<WorkspaceSettingsSeed>`,
  shallow-merged onto the template's settings (with a deep merge
  for `modules_enabled` so partial toggles work). Pre-existing
  callers pass no overrides and get template defaults — no
  behavior change.
- `app/onboarding/page.tsx` + `OnboardingClient.tsx` (new):
  standard server-page-with-dynamic-client-import pattern. No
  `DirectusHydrationBoundary` here — onboarding runs before any
  workspace-scoped data load and must render with 0 memberships.
- `components/onboarding/OnboardingFlow.tsx` (new): two-step flow.
  - Step 1 (template): four cards — Sales / Agency / Real Estate /
    Blank. Each shows entity-noun-plural + owner-noun summary plus
    a one-line description. Selecting a card pre-fills step 2.
  - Step 2 (customize): workspace name, entity noun singular/plural,
    owner noun, four module toggles, live one-line preview, Back +
    Create buttons.
  - Submit calls `createWorkspace(name, templateId, settings)` then
    `router.replace` to `/territory` (if territory module on) or
    `/accounts` (if off — matches the territory redirect from
    Phase 2.3).
- `components/WorkspaceSwitcher.tsx`: "+ New workspace…" now
  `router.push('/onboarding')` instead of running an inline
  `window.prompt`+`createWorkspace`. The local `busy` state and
  `createWorkspace` import drop out — switcher is now read-only
  for the create path.
- `app/login/page.tsx`: post-login routing branches on `?next=`.
  If present (proxy-driven redirect-after-401), honor it. Otherwise
  `getMyWorkspaces()` — zero → `/onboarding`, else `/territory`.
  Default-bootstrapped users land as before; a fresh Directus user
  with no membership rows lands on the picker.

Module-gate quirk worth noting: the onboarding redirect uses the
**chosen** modules state (not what's loaded by `useWorkspaceSettings`),
so the post-create destination is correct on first render without
waiting for the settings cache to populate for the new workspace.

Verified clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
`/onboarding` registers as a static route. Phase 4.2
(`/settings/workspace` editor) and 4.3 (additive CSV aliases)
remain ahead.

## Phase 4.2 — `/settings/workspace` editor (shipped)

- `lib/workspace.ts`: added `updateWorkspaceSettings(workspaceId, patch)`.
  Looks up the row id (1:1 by `workspace_id`), PATCHes
  `/items/workspace_settings/{id}`. Caller invalidates the cache.
- `app/settings/workspace/page.tsx` + `SettingsWorkspaceClient.tsx`:
  matches the server-page → dynamic client wrapper pattern. Wraps
  in `DirectusHydrationBoundary` so the form only renders for an
  authenticated user with a current workspace.
- `components/settings/WorkspaceSettingsForm.tsx`: pre-populates
  from `useWorkspaceSettings`, form for entity nouns (sing/plural),
  owner noun, brand_color (color picker + hex input + clear), four
  module toggles, live one-line preview. Save → `updateWorkspaceSettings`
  → `invalidateWorkspaceSettings(workspaceId)` → `router.refresh()`
  so any server components revalidate.
- One-shot hydration via a `hydrated` flag: form state seeds from
  the settings hook on first snapshot, then becomes user-controlled
  (so editing isn't clobbered by cache re-renders).
- Brand color stored as nullable string; empty input PATCHes
  `brand_color: null`.

Verified clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
`/settings/workspace` registers as a static route. Phase 4.3
(additive CSV aliases via `field_definitions.aliases`) remains ahead.

## Phase 4.3 — Additive CSV aliases (shipped)

- Schema: added `aliases` (json, tags interface) to
  `field_definitions` in `bootstrap-directus.mjs`. Backfilled via
  `tryCreateField` for existing instances. Per-row default null.
- Types/mappers: `FieldDefinition.aliases?: string[]`,
  `FieldDefRow.aliases: string[] | null`. `rowToFieldDef` reads it,
  `fieldDefToRow` writes it. `lib/workspace.ts` createWorkspace and
  bootstrap's `seedWorkspaceDefaults` both POST aliases when seeding.
- Detection: `inferDefaultConfigs` and `buildColMapFromConfigs` in
  `components/accounts/import/importHelpers.ts` now match a CSV
  header against label, id, AND `def.aliases`. The match is workspace-
  aware automatically because fieldDefs come from the store.
- Seeded baseline aliases on the sales template's six built-in
  fieldDefs (ARR ↔ "annual revenue"/"acv"/etc; MRR, Headcount, Segment,
  Industry, Tier). Mirrored in both `lib/seedTemplates.ts` and the
  bootstrap script's parallel SEED_TEMPLATES.
- UI affordance: in `ConfigureStep`'s notes column, when a header is
  locked to an existing field def but is NOT already among
  label/id/aliases, a "Remember header" link appears. Clicking it
  calls `onSaveAlias(header, fieldId)` → `AccountsImportModal`
  appends the lowercased header to the def's aliases and calls
  `updateFieldDef`. Local `savedAliases` set in ConfigureStep flips
  the link to "Saved" without re-triggering on the same row.
- Note: `lib/csvParser.ts:detectColumns` is unused dead code; left
  alone per roadmap (kept as a baseline reference). Could be deleted
  in a future cleanup.

Verified clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Phase 4 complete.

---

## Premium design system + territory rework (in progress)

### Site-wide design system (shipped this session)

Foundation for the "billion-dollar minimal" direction:
- `app/globals.css` — design tokens via Tailwind v4 `@theme inline`:
  surfaces (`bg-canvas`, `bg-panel`, `bg-sunken`), ink ladder
  (`text-ink`, `text-ink-body`, `text-ink-muted`, `text-ink-faint`),
  brand (indigo) + accent (amber) + danger (rose), `border-hairline`,
  shadow scale (`shadow-xs/sm/md/lg/brand`), radius scale, and the
  `font-display` slot. Fixed the body-font Arial bug → Geist Sans.
  Added a fixed paper-grain SVG noise + radial brand/accent gradient
  on `body::before`. Branded `::selection`. Refined scrollbars.
  `.display` helper for Fraunces.
- `app/layout.tsx` — Fraunces loaded via `next/font/google` with
  `axes: ['opsz', 'SOFT']` (no `weight` — variable-only constraint).
- Bulk palette migration across `app/` and `components/`:
  `zinc-* → slate-*`, `blue-* → indigo-*`, `red-* → rose-*` (44
  files, 572 occurrences). Active nav-pill style upgraded from the
  black-on-white inversion to `bg-brand text-white shadow-brand/30`.
- Canonical chrome on `AccountsToolbar` (brand mark + Fraunces
  wordmark, segmented nav over `bg-sunken/70`, ghost/primary buttons,
  custom-chevron filter selects, mono-tabular row count).
- `WorkspaceSwitcher` — tokenized with custom chevron.
- `app/login/page.tsx` — full hero rebuild: blurred indigo+amber
  gradient mesh, diagonal rule, side-rule typographic marginalia,
  glass card, Fraunces "Welcome back.", uppercase-tracked field
  labels, animated submit spinner.
- `AccountsTable` — refined polish (slate/indigo/rose tokens, gradient
  header surface, dual-arrow SVG sort chevron, branded selection
  with 2px inset accent, amber-dotted underline on metric hover,
  trash SVG, status-bar dot + indigo "n selected" pill).

What's NOT polished yet (only got the bulk palette + active-pill
swap): territory/tasks/teams/onboarding/settings page-level
toolbars (apart from territory which got a full rewrite — see
below), modals, kanban board.

### Territory rework — decomposed into 4 sub-projects

User wanted "premium yet minimalist territory map + better
functionality". Selected all four pain areas (visual polish, info
density, map interaction, sidebar editing). Decomposed into four
focused specs; sub-project 1 just shipped.

**Sub-project 1 (shipped) — Visual polish & map style.**
Spec: `~/.claude/plans/update-the-account-table-peppy-jellyfish.md`
(plan file was reused; territory-mapping content overwrote the
account-table content).
- New `'vegeta'` map theme — paper-quiet ocean (`#f7f7f5`), 0.3px
  hairline borders, no graticule, frosted `bg-panel/85` chrome.
  Now `DEFAULT_THEME_ID`. Three legacy themes kept; their chrome
  classes retuned to share the new shape so theme-switching is a
  mood swap, not a layout swap.
- `lib/territoryPalette.ts` (new, 30 lines) — 8-hue muted
  complementary palette (brand, accent, teal, rose, violet, sky,
  lime, orange) + FNV-1a `defaultColorForGeoId(id)`.
- `resolveGeoColor` in `lib/territoryIndex.ts` falls back to the
  palette by *root* id when no ancestor has an explicit color, so
  every assigned region reads on the new pale ocean.
- World/drill-down maps: zoom controls collapsed into one rounded
  panel with internal `divide-hairline` separators and crisp inline
  SVG glyphs.
- `MapTooltip` — title in tracking-tight, indigo-tinted `›`
  separators on the geo trail, hairline divider, mono tabular
  numerals, amber bullet for the metric.
- `MapLegend` — color dots get a subtle `ring-1 ring-black/10`,
  unassigned row dimmed.
- `AccountLayer` — bubbles and dots get a white halo + faint shadow
  ring; unassigned color shifted from `#ef4444` to slate-400.
- `TeamSidebar` — `bg-panel` rail with `border-hairline`, brand-bar
  active-tab indicator (replacing the heavy `border-b-2`).
- `GeoSidebarPanel` — primary "New geo" uses brand tokens.
- `Toolbar` (territory) — full rewrite mirroring `AccountsToolbar`:
  brand mark with Fraunces wordmark, segmented nav, ghost/primary
  buttons, breadcrumb in indigo `›`, paint pill on `bg-brand-soft`,
  eraser pill on `bg-accent-soft`. `'vegeta'` added to the picker.
- `TerritoryApp` outer container → `bg-canvas`.

Behavior byte-identical. `tsc --noEmit` and `eslint` pass; build
not run yet (UI sweep, no logic risk).

### Next specs (to brainstorm/write before building)

**Sub-project 2 (shipped 2026-05-06) — Information density on the map.**
- **Choropleth mode toggle** — `mapUiSlice` gained a `choroplethMode`
  field (`'count'` | `'teamColor'` | `'metric'`). Count mode shades
  regions by account density; team-color mode maps each region to its
  owning team's brand hue; metric mode drives an amber→indigo gradient
  via `useChoroplethFillColor` + `useChoroplethScale`.
- **ChoroplethScale gradient bar** — `ChoroplethScale.tsx` renders a
  css-gradient bar with min/max numeric labels anchored to the legend
  footer when a metric is active.
- **Smart on-map labels** — `MapLabels.tsx` projects each geo centroid,
  skips labels whose bounding rect overlaps a prior label (simple bbox
  collision cull), and is opt-in via a **Labels** toggle in `Toolbar`.
- **RegionSummaryPanel** — right-side floating panel driven by
  `useRegionRollup`; updates on hover or pin-click. Displays: Geo
  trail, account count, top-3 metric totals, top-3 owners (team color
  resolved via `SalesTeam.memberIds` reverse-lookup). `MapInfoRail`
  mounts the panel and gates it on `mapUiSlice.summaryRegionId`.
- **Coverage-gap & conflict pill badges** — `mapUiSlice` fields
  `highlightGaps` / `highlightConflicts` drive a transient amber/rose
  ring on affected regions; no new selection slice was introduced.
  Badge counts come from `mapUiSelectors` (`selectCoverageGaps`,
  `selectConflictRegions`) and appear in `MapLegend`.

New files: `lib/choropleth.ts`, `hooks/useChoroplethScale.ts`,
`components/territory/map/MapInfoRail.tsx`,
`components/territory/map/RegionSummaryPanel.tsx`,
`components/territory/map/ChoroplethScale.tsx`,
`components/territory/map/MapLabels.tsx`.
Modified: `store/slices/mapUiSlice.ts`, `store/slices/mapUiSelectors.ts`,
`store/selectors.ts`, `MapLegend.tsx`, `WorldMapView.tsx`,
`DrillDownMapView.tsx`, `Toolbar.tsx`.

Implementation deviations: `FieldDefinition.type === 'metric'`
discriminator used to filter metric candidates (numeric/currency are
not separate types). `react-simple-maps` `Geographies` render-prop
bundled types lack `projection`; cast added in both map views.

Verification: `tsc --noEmit`, `eslint`, and `npm run build` all clean.
Manual UI smoke is user's responsibility.

**Open issue (deferred 2026-05-07):** `MapInfoRail` still obstructs the
map even after narrowing to 260px, hiding the empty-state region panel,
and adding a collapse chevron. Revisit with a better placement
strategy — candidates: dock to bottom edge, slide-out drawer triggered
by hover/pin, or relocate the region summary out of the rail entirely
so the rail is only legend + scale + badges.

Original plan notes (kept for traceback): spec envisioned metric pill
driving choropleth (landed), bbox collision cull for labels (landed),
right-side summary panel with Geo trail + top-3 (landed), gap/conflict
badges with click-to-highlight (landed as transient highlight),
gradient bar with min/max numerals (landed as `ChoroplethScale`).

**Sub-project 3 (shipped 2026-05-07) — Map interaction & navigation.**

Spec: `docs/superpowers/specs/2026-05-07-territory-map-interaction-design.md`.
Plan: `docs/superpowers/plans/2026-05-07-territory-map-interaction.md`.

What shipped (commits `990633c` → `5c7b520` on `accounts-crud`):

- **State**: new `selectActive` flag on `geoSlice` with three-way mutual
  exclusion (paint/eraser/select). New `selectionSlice` holds
  `selectedEntityCodes: string[]` (countries `'US'` and states
  `'US:US-CA'` share one set; session-only, not persisted). New
  `mapZoomCommand` discriminated union on `mapUiSlice` (`panBy` |
  `zoomBy` | `reset`, each with a `nonce`) bridges Toolbar keystrokes
  to the active map view.
- **Toolbar**: third "Select" pill alongside paint/eraser. `?` button
  toggles `MapHelpPopover` (always reachable, outside the paint/eraser
  guard). Existing keydown listener extended with the full cascade —
  Esc (popover → selection → paint/eraser), `?`, arrow/+/-/0
  keystrokes dispatching `setMapZoomCommand`.
- **WorldMapView / DrillDownMapView**: selection-aware stroke (2px
  brand) + 4% brand fill overlay via `color-mix`. Click handler routes
  cmd/ctrl-click → `toggleSelection`, shift-click → `addToSelection`,
  plain → `setSelection` when `selectActive`. Lasso overlay
  (mousedown-on-background-only) draws a dashed brand `<rect>` and on
  release runs a centroid-in-rect hit test using d3-geo `geoCentroid`
  (already a transitive dep). Pinch zoom enabled via explicit
  `filterZoomEvent` (wheel/dblclick always allowed; mousedown-pan
  gated to zoomed). Double-click zooms to feature centroid with
  `e.stopPropagation()` so ZoomableGroup's own dblclick doesn't
  double-fire. `useEffect` consumer reads `mapZoomCommand` (via
  state-mirroring refs to satisfy `react-hooks/set-state-in-effect`)
  and applies pan/zoom/reset, then clears the command. Roving
  tabindex (alphabetically-first region gets `tabIndex={0}`,
  rest `-1`) plus a `.map-region-path:focus-visible` ring in
  `globals.css`. Cursor states: paint/eraser → `crosshair`, select →
  `cell`, zoomed-no-tool → `grab`.
- **MapHelpPopover** (`components/territory/map/MapHelpPopover.tsx`):
  small dialog listing the 8 shortcut rows; closes on outside-click
  (Esc handled by Toolbar's cascade).

Implementation deviations from the plan:
- DrillDownMapView's `filterZoomEvent` and zoom-command consumer use
  `initialZoom * 1.05`, the file's existing zoom-detection idiom, and
  cap zoom at the file's existing `maxZoom = 80` (vs. World's `8`).
  Reset returns to fitted `center`/`initialZoom`, not `[0, 20]/1`.
- Zoom-command consumer reads from `*Ref` mirrors of state because
  ESLint's `react-hooks/set-state-in-effect` rejects reading closure
  state at command time. Functional behavior is identical; the nonce
  on each command still re-fires the effect.
- `selectActive` is consumed only by parent components (drives the
  cursor ternary); it is NOT passed into `CountryGeo`/`StateGeo` (the
  per-region children don't need it).
- `useTerritoryStore` barrel was extended once (Task 5) to re-export
  `selectionSelectors`. `useSelectionCount` was imported directly
  from `selectionSelectors` (not added to the barrel).

Out of scope (deferred to a future polish pass): animated drill-down
↔ world transition (sub-project umbrella item B), pan momentum +
rubber-band edges, native iPad/Safari touch gestures, surfacing
"N regions selected" in `RegionSummaryPanel`, `/` to focus search,
`g` to focus Geos sidebar.

Verification: `npm run lint` and `npm run build` both clean. Manual
UI smoke is the user's responsibility (per the plan's checklist).

### Original plan notes (kept for traceback)

**Sub-project 3 — Map interaction & navigation.**
Goal: tactile, modern manipulation that mirrors what users expect
from Linear/Figma-class tools.
- Refined zoom/pan: pinch-to-zoom on trackpads (current
  `filterZoomEvent` only allows wheel/dblclick at zoom 1); momentum
  inertia; double-click to zoom-into-feature.
- Drill-down/breadcrumb: animated transition between world ↔
  drill-down views; in-place breadcrumb in the toolbar already exists
  but make the "back to world" affordance prominent (←).
- **Multi-select**: shift-click to add, cmd-click to toggle, marquee
  (lasso) drag-select while a paint or eraser tool is active.
  Selected regions highlighted with a 2px brand stroke + 4% brand
  fill overlay.
- **Keyboard nav**: arrow keys to pan, +/- to zoom, `0` to reset,
  `g` to focus Geos sidebar, `/` to focus search, Esc to clear
  selection. Document in a small "?" help popover.
- **Focus management**: visible focus ring on country `<path>` via
  `:focus-visible` (currently `outline:none`); roving tabindex on
  the map so keyboard users can tab between regions.
- Cursor states: pan cursor when zoomed, crosshair when paint/eraser,
  cell when hovering a multi-selectable region with a tool active.

Touches: `WorldMapView.tsx`, `DrillDownMapView.tsx` (lasso layer +
keyboard handlers), new `store/slices/selectionSlice.ts` for
selected region ids + actions, `Toolbar.tsx` shortcuts indicator.

**Sub-project 4 — Sidebar hierarchy editing.**
Goal: the Geos/Regions sidebar becomes a real tree editor without
leaving the page.
- **Drag-and-drop reorder** of GeoNodes (sibling drag + drop-into-
  parent) using a lightweight library or HTML5 DnD (no
  `react-dnd`). Visual indicators: blue insertion line for sibling,
  parent highlight for nest. Persist new `parentId` + sibling
  `order` (need to add an `order` field to `GeoNode` if absent).
- **Inline rename** on double-click; Enter commits, Esc cancels.
  Validate non-empty.
- **Search-within-tree** input at top: filters with auto-expand of
  ancestors of matching nodes.
- **Bulk assign/move** — shift-click to select multiple nodes; bulk
  move via drag, bulk delete via Backspace.
- Color picker per node (currently only via paint mode + the
  hash-derived default) — small swatch palette + custom hex.

Touches: `GeoSidebarPanel.tsx`, `GeoNodeRow.tsx`, the geo slice
(`addGeoNode`, `updateGeoNode`, plus a new `reorderGeoNode(id,
parentId, beforeId)` action). Extend `GeoNode` type with `order:
number` if not present and update persist keys.

### Suggested order

1 (shipped) → 2 → 3 → 4. Density work directly leverages the
visual tokens; interaction work then layers on top of a stable
visual + density baseline; sidebar editing is mostly orthogonal
and can slot in any time after 1.



**Sub-project 4 (shipped 2026-05-09) — Sidebar hierarchy editing.**

Spec: `docs/superpowers/specs/2026-05-09-territory-sidebar-editing-design.md`.
Plan: `docs/superpowers/plans/2026-05-09-territory-sidebar-editing.md`.

What shipped:
- **`@dnd-kit/core` + `@dnd-kit/sortable`** added (utilities was a transitive dep, no extra install).
- **`reorderGeoNodes(orderedIds)`** in `lib/directus-write.ts` — sequential PATCH of `sort` mirroring `reorderLevels`.
- **`reorderGeoNode(id, newParentId, beforeId)`** action on `geoSlice` — cycle-safe via `isAncestor`, splices `geoNodeOrder`, dual writes (parent + sort).
- **`GeoSidebarPanel`** wraps the tree in a single `DndContext` + flat `SortableContext`. Search input filters via `lib/geoTreeFilter` with ancestor auto-expand; drag is disabled while search active.
- **`GeoNodeRow`** consumes `useSortable` + three `useDroppable` zones (top/middle/bottom = before/nest/after). Drop overlays show 2px brand insertion line for siblings, brand-soft fill for nest. Cycle prevention dims descendant rows of the active drag target.
- **`ColorPickerPopover`** — 10-swatch palette + Inherit chip + hex input (validates `^#[0-9a-f]{6}$`). Replaces the previous native `<input type="color">`.
- **`SidebarSearchInput`** — controlled search box with clear button.
- **Inline rename** preserved from prior implementation (dblclick → input, Enter commits, Esc cancels, blur commits, empty rejects).
- **Keyboard DnD** via `KeyboardSensor` + `sortableKeyboardCoordinates` (Space pickup, Arrow move, Space drop).

Implementation deviations from the plan:
- React 19's `react-hooks/refs` rule forbids reading `obj.setNodeRef` / `ref.current` during render. `GeoNodeRow` destructures `setNodeRef`/`attributes`/`listeners`/`transform`/`transition`/`isDragging` from `useSortable` and each `useDroppable` call (matches the `KanbanBoard.tsx` pattern).
- `ColorPickerPopover` anchor: instead of a `swatchRef.current.getBoundingClientRect()` read during render, the swatch button captures `e.currentTarget.getBoundingClientRect()` into a `pickerAnchor: DOMRect | null` state on click.
- `useGeoNodes` / `useGeoNodeOrder` already existed in `store/slices/geoSelectors.ts`; `useActions` returns the full state via `getState()`, so no `hooks/useTerritoryStore.ts` changes were needed.

Out of scope (deferred): multi-select (shift-click range, cmd-click toggle, bulk drag, bulk delete), animated tree open/close transitions beyond the existing chevron, undo/redo for reorder/rename/color (the slice's `geoUndoStack`/`geoRedoStack` are still scoped to paint operations).

Verification: `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean. Manual UI smoke is the user's responsibility (drag-reorder same-parent, drag-nest, drag-unnest, cycle-rejection, search auto-expand + drag disabled, color picker swatch + hex + inherit, keyboard DnD).

---

## Shipped 2026-05-12 — MapInfoRail rework

Spec: `docs/superpowers/specs/2026-05-12-map-info-rail-rework-design.md`
Plan: `docs/superpowers/plans/2026-05-12-map-info-rail-rework.md`

### What shipped

Three new files added, one deleted:

- `components/territory/map/MapChip.tsx` — compact pill button with optional active/highlighted state; clicking opens a 240 px popover anchored above itself; outside-click or second click dismisses it.
- `components/territory/map/MapChipsDock.tsx` — horizontal row of chips rendered at `absolute left-4 bottom-4`; slots in Legend, Scale (visible when active), coverage-gap, and conflict pills. Each chip's popover hosts the prior full panel content (legend swatches, scale bar, gap list, conflict list).
- `components/territory/map/PinnedRegionCard.tsx` — 280 px card rendered at `absolute right-4 top-16`; mounts only when `pinnedEntityIso` is set; contains `RegionSummaryPanel` (with the new `iso` prop) plus a ✕ close button that calls `setPinnedEntityIso(null)`.
- `components/territory/map/MapInfoRail.tsx` — deleted; it was a vertical sidebar hosting the same content now distributed across chips and the pinned card.

`RegionSummaryPanel` gained an optional `iso` prop so `PinnedRegionCard` can supply a fixed ISO directly and opt out of the hover-fallback inside `useFocusedEntityIso`.

Both `WorldMapView` and `DrillDownMapView` had their `<MapInfoRail />` mount sites replaced with `<MapChipsDock />` and `<PinnedRegionCard />`. Click-to-pin and Esc-clear-pin were already wired through the territory slice (`pinnedEntityIso` / `setPinnedEntityIso` / `togglePinnedEntityIso`), so no new slice work was needed.

### Layout

Legend / scale (when visible) / coverage-gap pill / conflict pill live as compact pills at `absolute left-4 bottom-4`; each opens a 240 px popover floating above the pill on click and dismisses on outside-click. The pinned region card sits at `absolute right-4 top-16 w-[280px]`, renders only when `pinnedEntityIso` is non-null, and has a ✕ close button.

### Deviations from spec

The spec proposed renaming `focusedEntityIso → pinnedEntityIso` and adding `pinRegion` / `unpinRegion` actions. The slice already had `pinnedEntityIso` + `setPinnedEntityIso` + `togglePinnedEntityIso`, so no renaming or new actions were needed — an explicit `iso` prop was threaded into `RegionSummaryPanel` instead.

The spec also proposed extending the Toolbar's Esc cascade to cover chip popover dismissal. The current implementation relies on each view's existing Esc handler for pin clearing and on outside-click for chip popovers. Pressing Esc with a chip popover open will also clear any active pin (acceptable trade-off; can be tightened in a follow-up pass).

### Verification

`npm run lint` clean, `npm run build` clean (Next.js 16 / Turbopack, 14 static pages). Manual UI smoke is the user's responsibility: pin/unpin/swap via region click, each chip popover opens and closes correctly, gap/conflict highlight buttons still work from within the popovers, no obstruction at narrow viewport widths.

---

## Shipped 2026-05-13 — Polish-A (selection chip + `/` and `g` shortcuts)

Spec: `docs/superpowers/specs/2026-05-13-territory-polish-a-design.md`
Plan: `docs/superpowers/plans/2026-05-13-territory-polish-a.md`

First of four follow-up polish passes on the territory map sub-projects
3 and 4. Polish-B (SP4 multi-select), Polish-C (undo/redo across
sidebar mutations + animated tree open/close), and Polish-D (SP3
motion: animated drill transition + pan momentum) are queued for later
passes.

### What shipped

- `components/territory/map/SelectionChip.tsx` — new chip + popover
  body (`SelectionChipPopover`) + internal `SelectionRow`. Chip is
  `forwardRef<HTMLButtonElement>` and self-returns `null` when
  `useSelectionCount() === 0`. Popover lists selected codes with
  best-effort state names; per-row ✕ calls `toggleSelection(code)`;
  header `Clear` calls `clearSelection()`.
- `store/slices/mapUiSelectors.ts` — adds `getRegionNameByIso(iso)`, a
  plain module-scoped utility (not a hook) that splits state codes
  (`"US:US-CA"`) on `:` and looks them up in `stateLoader`'s existing
  cache. Returns `null` for country codes (deferred to Polish-B where
  the selection slice grows a name parameter for sidebar bulk-select)
  and for stale lookups.
- `components/territory/map/MapChipsDock.tsx` — `OpenChip` extended
  with `'selection'`; subscribes to `useSelectionCount()`; mounts a
  gated `ChipWithPopover` block as the last child so the empty
  `ChipWithPopover` wrapper doesn't leak the `gap-2` flex spacing
  when count is 0.
- `components/territory/toolbar/Toolbar.tsx` — keydown handler gains
  `/` (focuses `#geo-sidebar-search`) and `g` (focuses first
  `[data-geo-node-row]`) cases between the `?` and arrow blocks. Both
  pass through the existing `isEditableTarget` guard so typing those
  keys inside any input doesn't trigger them.
- `components/territory/sidebar/SidebarSearchInput.tsx` — optional
  `id?: string` prop forwarded to the `<input>`.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — passes
  `id="geo-sidebar-search"`.
- `components/territory/sidebar/GeoNodeRow.tsx` — row root `<div>`
  gains `data-geo-node-row=""`, `tabIndex={-1}` (out of tab order but
  imperatively focusable), and a
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`
  treatment.
- `components/territory/map/MapHelpPopover.tsx` — appends
  `['/', 'Focus search']` and `['g', 'Focus Geos sidebar']` rows.

### Deviations from spec

The spec's initial draft proposed `useRegionNameByIso` (use-prefixed)
as a generic country+state resolver. Code-quality review during
implementation flagged that the `use*` prefix is reserved in this file
for store-subscribed hooks (e.g. `useEntityHighlight`,
`useRegionRollup`) — the new function is a plain module-scoped
utility, so it was renamed to `getRegionNameByIso` to match the
`get*` convention used elsewhere (`getStatesForCountry`,
`getAccountStatsByEntity`). Country-name resolution was also scoped
out and deferred to Polish-B, where the selection slice will need to
accept names alongside codes for sidebar bulk-select anyway. The
popover renders country codes as-is (e.g. `"US"`) and only resolves
state codes via the stateLoader cache.

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean (Next.js
16 / Turbopack, 14 static pages). Manual UI smoke is the user's
responsibility:

1. Map view, no selection → no SelectionChip visible.
2. Select 2+ regions (click + shift-click in Select mode, or lasso) →
   chip appears with count.
3. Click chip → popover lists codes; drilled-down state codes show
   names before the code; country codes show codes only.
4. Per-row ✕ removes that code; count decrements; popover stays open
   until the last code is removed (then chip and popover unmount
   together).
5. `Clear` button empties the set and closes the popover.
6. Press `/` from map view → focus lands in Geos sidebar search box.
7. Press `g` from map view → focus lands on the first Geo node row
   with the visible focus ring.
8. Typing `/` or `g` while focused in any input → no map action.
9. `?` opens MapHelpPopover; rows for `/` and `g` are listed.
