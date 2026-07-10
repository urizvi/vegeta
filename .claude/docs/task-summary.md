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

---

## Shipped 2026-05-13 — Polish-B (Geos sidebar multi-select)

Spec: `docs/superpowers/specs/2026-05-13-territory-polish-b-design.md`
Plan: `docs/superpowers/plans/2026-05-13-territory-polish-b.md`

Second of four follow-up polish passes. Polish-C (undo/redo across
sidebar mutations + animated tree open/close) and Polish-D (SP3
motion) remain.

### What shipped

- `lib/isEditableTarget.ts` — extracted from `Toolbar.tsx` so the
  sidebar's local keydown handler can reuse it. Toolbar imports it
  instead of redeclaring locally.
- `store/slices/geoSelectionSlice.ts` — session-only multi-select
  state (`selectedGeoNodeIds`, `selectionAnchorId`) + four actions:
  - `setGeoSelection(ids, anchor?)` — replace; anchor defaults to
    last id (or null).
  - `toggleGeoSelection(id)` — add/remove id; anchor moves to id
    (Finder/Linear semantics).
  - `extendGeoSelection(toId, visibleOrder)` — replaces selection
    with the inclusive range from anchor to toId walked through
    `visibleOrder`. If no anchor, sets `[toId]` as the new anchor.
  - `clearGeoSelection()` — empties set; anchor stays.
  Not added to `geoPersistKeys` — parallels the map's
  `selectionSlice`.
- `store/slices/geoSelectionSelectors.ts` —
  `useSelectedGeoNodeIds`, `useGeoSelectionCount`, `useIsGeoSelected`,
  `useGeoSelectionAnchor`. Re-exported via `hooks/useTerritoryStore`.
- `store/slices/geoSlice.ts` — adds `reorderGeoNodes(ids,
  newParentId, beforeId)` and `removeGeoNodes(ids, mode)` bulk
  actions next to their single-node siblings. Cycle/membership
  checks reject the whole batch (matches the single-node policy).
  Bulk delete fires one `directusWrite.deleteGeoNodes` for the union
  of dropped ids; cascade also nulls `activePaintGeoId` if the
  active id is in the union.
- `components/territory/sidebar/GeoNodeRow.tsx` — click dispatcher:
  cmd/ctrl-click → `toggleGeoSelection`; shift-click →
  `extendGeoSelection` over the parent's `visibleOrder` prop; plain
  → `clearGeoSelection()` + existing paint toggle (preserves
  muscle memory). `isSelected` adds
  `bg-brand-soft/60 ring-1 ring-brand/40` (paint mode wins
  visually). `bulkDragActive` prop dims non-active selected rows
  during bulk drag at `opacity-40`.
- `components/territory/sidebar/GeoSelectionDragOverlay.tsx` — count
  chip rendered inside dnd-kit's `<DragOverlay>` during bulk drag.
  Shows the active node's color dot + name + `+N` count badge.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — wraps the
  return in a `<div data-geo-sidebar-root tabIndex={-1}>` with a
  local `onKeyDown` for Esc (clears selection, `stopPropagation`)
  and Backspace/Delete (confirm + bulk delete + clear).
  Background-click on the scroll container clears selection.
  `handleDragStart` detects bulk via the live selection set and
  stores `bulkDragIds`; `handleDragEnd` captures the batch locally,
  resets state, and routes to `reorderGeoNodes` when bulk
  (singleton path unchanged). `bulkDragSet` (memoized) keeps the
  per-row `bulkDragActive` check O(1). `<DragOverlay>` mounts
  inside `<DndContext>` and renders the chip only when
  `bulkDragIds.length > 1`.
- `components/territory/toolbar/Toolbar.tsx` — Esc cascade gets a
  single early-return when `document.activeElement` is inside
  `[data-geo-sidebar-root]`. Switches to the lifted
  `isEditableTarget`.

### Deviations from spec

- The `reparent-children` mode of `removeGeoNodes` is implemented
  for parity with single-node behavior but Polish-B's UI only
  exercises `cascade`. The reparent path mirrors the single-node
  per-id logic (lift children to grandparent).

### Review-pass fixes applied

- T9 code-quality review surfaced an O(roots × batch) per-row check
  on the inline `.includes()`; resolved by memoizing a `Set` of
  `bulkDragIds` and switching to `.has()` (commit `a50449e`).
- Final review surfaced that the original plan's recursive
  `bulkDragActive={false}` left nested selected rows un-dimmed
  during bulk drag. Fixed by passing `bulkDragSet` + `activeDragId`
  down through `GeoNodeRow` so each row computes its own
  membership; same pass pruned unused
  `setGeoSelection` / `useGeoSelectionCount` /
  `useGeoSelectionAnchor` exports (commit `881e720`).

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
Manual UI smoke is the user's responsibility:

1. Plain click on a row → paint mode toggles; no selection styling.
2. Cmd-click rows B, C, D → each gains brand-soft ring/fill; paint
   mode unaffected.
3. Shift-click row F → range from anchor (D, since cmd-click moves
   anchor) through F replaces the selection.
4. Plain click any row → selection clears; paint mode toggles on
   that row.
5. Click empty sidebar background → selection clears.
6. Multi-select 2+ rows, drag any selected row → DragOverlay shows
   `{name} +N`; non-active selected rows dim; drop reparents the
   whole batch.
7. Drag an unselected row → singleton drag exactly as before;
   selection unchanged.
8. Try to drop a batch onto its own descendant → whole batch
   rejected (no state change).
9. Selection active + Backspace/Delete → confirm dialog; OK
   cascade-deletes, Cancel preserves.
10. Selection active + Esc → selection clears; map state
    (paint/eraser/region selection) unchanged.
11. No selection + Esc → Toolbar Esc cascade still fires (popover
    dismiss, paint clear, etc.).
12. Polish-A `g` shortcut still focuses first row → subsequent
    Esc/Backspace operate against the sidebar.

---

## Shipped 2026-05-14 — Polish-C (universal undo/redo + tree animation)

Spec: `docs/superpowers/specs/2026-05-13-territory-polish-c-design.md`
Plan: `docs/superpowers/plans/2026-05-13-territory-polish-c.md`

Third of four follow-up polish passes. Polish-D (SP3 motion) remains.

### What shipped

- `store/slices/geoSlice.ts` — replaces the paint-only undo plumbing
  with a discriminated-union `GeoOp` covering six variants:
  - `paint` (existing four paint/eraser actions; payload unchanged
    via `NodeCodesPatch[]`)
  - `rename` — captures `{id, before, after}` from `updateGeoNode`
  - `color` — captures `{id, before, after}` from `updateGeoNode`
    (sibling push to rename; combined `{name, color}` patches push
    two ops)
  - `add` — captures `{node, sortIndex}` from `addGeoNode`
  - `remove` — captures `{mode, removedNodes, orderIndices,
    liftedChildren?}` from `removeGeoNode`/`removeGeoNodes`
  - `reorder` — captures `{parentChanges, beforeOrder, afterOrder}`
    from `reorderGeoNode`/`reorderGeoNodes`/`reparentGeoNode`;
    `parentChanges` carries both `beforeParentId` and
    `afterParentId` so redo can re-apply forward without re-walking
    siblings.
  Stack fields renamed `geoUndoStack`/`geoRedoStack` →
  `geoOpUndoStack`/`geoOpRedoStack`; actions renamed
  `undoGeoAssignment`/`redoGeoAssignment` → `undoGeoOp`/`redoGeoOp`.
  Slice creator now destructures `(set, get)` so the post-`set`
  Directus replay for `remove` undo can read live `geoNodeOrder`.
  Inside undo/redo, the wrapper-object idiom (`const result: { op:
  GeoOp | null } = { op: null }`) avoids TypeScript narrowing
  fallout from closure-captured assignments.
- `store/slices/geoSelectors.ts` — `useCanUndoGeo`/`useCanRedoGeo`
  switch to the renamed stack fields. Selector names unchanged
  (already generic).
- `components/territory/toolbar/Toolbar.tsx` —
  `undoGeoAssignment`/`redoGeoAssignment` references renamed.
  Button titles tighten from "Undo Geo assignment" to
  "Undo (⌘Z)" / "Redo (⇧⌘Z)".
- `components/territory/sidebar/GeoNodeRow.tsx` — wraps the
  recursive children in a grid container that switches between
  `grid-rows-[0fr]` and `grid-rows-[1fr]` based on `showExpanded`,
  with `motion-safe:transition-[grid-template-rows] duration-200
  ease-out`. Children render unconditionally (clipped by an inner
  `overflow-hidden`). `aria-hidden={!showExpanded}` for SR users.
  `prefers-reduced-motion: reduce` users get the instant toggle.

### Op semantics summary

| Kind | Push site | Undo (data) | Redo (data) | Directus replay |
|---|---|---|---|---|
| paint | 4 assign/clear actions | restore before-codes | restore after-codes | updateGeoNodeRemote per patch |
| rename | `updateGeoNode({name})` | name = before | name = after | updateGeoNodeRemote |
| color | `updateGeoNode({color})` | color = before | color = after | updateGeoNodeRemote |
| add | `addGeoNode` | delete from nodes + order | re-insert at sortIndex | deleteGeoNodes / createGeoNode |
| remove | `removeGeoNode`/`removeGeoNodes` | restore nodes + orderIndices; revert liftedChildren | re-delete (and re-lift) | createGeoNode + lift + reorderGeoNodes / deleteGeoNodes |
| reorder | `reorderGeoNode`/`reorderGeoNodes`/`reparentGeoNode` | restore beforeOrder + beforeParentIds | restore afterOrder + afterParentIds | updateGeoNodeRemote per parent change + reorderGeoNodes |

UI state (`activePaintGeoId`, `selectedGeoNodeIds`,
`selectionAnchorId`, `activeEraser`, `selectActive`,
`pinnedEntityIso`) is NOT touched by undo/redo. The
`activePaintGeoId` nulling that happens forward when its target is
deleted stays nulled even after the deletion is undone.

### Implementation idioms worth knowing

- **Wrapper-object capture for TypeScript narrowing**: TS narrows a
  `let appliedOp: GeoOp | null = null` to `null` after a closure
  assignment. Workaround: `const result: { op: GeoOp | null } = {
  op: null };` then `result.op = top;`. Reads outside the `set`
  callback widen to `GeoOp | null` and re-narrow on `if (op &&
  op.kind === ...)`.
- **Slice-creator `(set, get)` destructure**: introduced in T6 so
  the `remove` undo's Directus replay can call
  `directusWrite.reorderGeoNodes(get().geoNodeOrder)` against the
  live order after `set` runs. Other branches don't need `get`.
- **Tree animation via `grid-template-rows: 0fr ↔ 1fr`**: pure CSS,
  no JS height measurement, no new dependency. Children stay
  mounted while collapsed (clipped by inner `overflow-hidden`) —
  acceptable trade-off; dnd-kit hit testing is unaffected because
  the clipped container has zero height.

### Known limitations (per spec)

- `createGeoNode` during a remove-undo trusts that Directus accepts
  client-supplied UUIDs. Directus has done so since Phase 1; if
  rejected, local state remains correct and a refresh recovers.
- Stack is session-only (not persisted). A page reload clears
  history. Matches the prior paint-only behavior.
- MAX_UNDO remains 50.
- `geoSlice.ts` is now ~1036 lines. Within manageable bounds for
  now. If a future polish pass adds another variant, consider
  extracting `undoGeoOp`/`redoGeoOp` into a sibling
  `geoUndoRedo.ts` (review-suggested follow-up, deferred).

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
Manual UI smoke checklist:

1. Rename a node via inline editor → ⌘Z restores old name;
   ⇧⌘Z reapplies.
2. Change a node's color via swatch → ⌘Z restores old color.
3. Click "New geo" → ⌘Z removes the just-created node.
4. Click ✕ on a node with no children → ⌘Z restores it at its
   position.
5. Click ✕ on a node WITH children (cascade) → ⌘Z restores parent +
   descendants at original positions.
6. Bulk delete via Backspace (Polish-B) → ⌘Z restores all deleted
   nodes at original positions.
7. Drag-reorder a node → ⌘Z restores prior order + parent.
8. Bulk-drag (Polish-B) → ⌘Z restores prior order + parents for
   all moved nodes.
9. Paint a country → ⌘Z still works exactly as before.
10. Mixed sequence (rename + paint + reorder + delete) → four ⌘Z
    unwinds in reverse.
11. Toolbar undo/redo buttons reflect canUndo/canRedo across all
    op types.
12. Expand/collapse a row with children → smooth 200ms height
    animation. `prefers-reduced-motion: reduce` users see instant
    toggle.

---

## Shipped 2026-05-14 — Polish-D (animated drill transition + pan momentum)

Spec: `docs/superpowers/specs/2026-05-14-territory-polish-d-design.md`
Plan: `docs/superpowers/plans/2026-05-14-territory-polish-d.md`

Final follow-up polish pass on territory sub-projects 3 & 4.
**Polish-A through Polish-D backlog is closed.**

### What shipped

- `lib/useCameraAnimation.ts` — RAF-driven center/zoom animation
  hook with cubic ease-in-out, `animateTo(target, durationMs,
  onComplete?)` imperative API, automatic cancellation on
  imperative `setCenter`/`setZoom` calls, and unmount cleanup.
  Respects `prefers-reduced-motion: reduce` (instant target +
  microtask `onComplete`). Captures start values via
  `setCenterState((c) => { startCenter = c; return c; })` so the
  effect doesn't trip `react-hooks/set-state-in-effect`.
- `lib/usePanMomentum.ts` — pan momentum handlers
  (`onMoveStart`/`onMove`/`onMoveEnd`) that record velocity
  samples during drag (last 80ms window, ring buffer of 8),
  compute release velocity, and run a friction-decay RAF (0.92 per
  frame) that drives `setCenter` until below the stop threshold.
  Respects `prefers-reduced-motion: reduce`.
- `components/territory/TerritoryApp.tsx` — owns a 3-phase
  `TransitionState` (`idle | entering | exiting`). Watches
  `drillDownCountryCode` via a `useRef`-tracked diff; on a `null →
  iso` transition kicks off a camera animation (Mercator) or
  cross-fade (US); on `iso → null` mirrors. Cross-fade path
  unmounts after a 200ms timer; Mercator path unmounts via the
  child view's `onCameraSettled` callback after the 300ms RAF
  tween. A new `renderMap()` helper exhaustively covers all
  combinations of phase × crossFade × drillDownCode.
- `components/territory/map/WorldMapView.tsx` and
  `DrillDownMapView.tsx` — replaced their local
  `useState<[center, zoom]>` with `useCameraAnimation`; accept
  three new optional props (`cameraTarget`, `onCameraSettled`,
  `className`); wired `usePanMomentum` into `ZoomableGroup`'s
  `onMoveStart`/`onMove`/`onMoveEnd` (zoom committed
  synchronously in `onMoveEnd`, center handed off to the momentum
  hook). The `onMove` prop is missing from
  `react-simple-maps`'s bundled types; cast via the same
  `Record<string, unknown>` idiom already used for
  `filterZoomEvent`. The drill-down view preserved its existing
  country-change re-derivation by calling the hook's imperative
  `setCenter`/`setZoom` from the same
  `prevInitialZoom`/`prevCenter` detection block (imperative calls
  cancel any in-flight tween).

### Implementation idioms worth knowing

- **`useCameraAnimation` setters are value-only** (not functional
  updaters). Callers that previously used `setZoom((z) => Math.min(z * 1.5, 8))`
  patterns now read from `zoomRef.current` instead. 8 call sites
  total across the two views were converted.
- **Reduced-motion gate** is duplicated in both hooks
  (`prefersReducedMotion()` helper inline in each file). Could be
  lifted to a shared helper if a third user emerges.
- **`onMove` type cast** wraps `react-simple-maps`'s incomplete
  bundled types; runtime shape matches the hook's expectation.

### Deviations from spec

- The plan suggested creating a new `centerRef` in
  `DrillDownMapView` to feed the momentum hook's `getCenter`. The
  file already had a `currentCenterRef` (tracking the live
  rendered center) — the implementer reused it instead of
  introducing a duplicate ref. Matches the spec's intent.
- The plan's spec mentioned the `drill-change effect` would not
  need a timer for non-cross-fade paths. The implementation
  followed that pattern. One inline
  `// eslint-disable-next-line react-hooks/set-state-in-effect`
  was added to silence a lint warning about `setTransition` inside
  the effect — the state machine pattern is the intended design.

### Known limitations

- The US cross-fade is fade-out-only on the outgoing view; the
  incoming view mounts at `opacity-100` immediately rather than
  animating in. Functionally smooth over 200ms, but visually a
  hard cut-in for the new map. A true two-way cross-fade would
  require the incoming view to mount at `opacity-0` and animate up
  via a `useEffect`-driven class swap after first paint. Deferred.

### Out of scope (deferred)

- **Rubber-band edges.** d3-zoom's `translateExtent` is
  hard-clamped; elastic overshoot would require wrapping
  `ZoomableGroup` with a custom pan-interceptor. Future Polish-E
  if revived.
- **Per-country target zoom.** A single `zoom = 6` covers all
  countries because the drill-down view's `fitFeatures`
  recomputes the true fit the instant it mounts — the camera
  animation is visually directional, not precise.
- **Native iPad/Safari multi-touch gestures.** Existing
  `filterZoomEvent` handles wheel + trackpad pinch via the wheel
  event path.

### Verification

`npx tsc --noEmit` clean. `npm run lint` exits 0 with 4 noisy
`react-hooks/exhaustive-deps` warnings about the hook's setters
(stable via `useCallback` chain — warnings are noisy but not
bugs). `npm run build` clean (14/14 pages generated). Manual UI
smoke checklist:

1. Click a non-US country (Germany, Brazil, India) → world map
   smoothly zooms toward the country over 300ms; drill-down view
   takes over with state data.
2. Click "World" breadcrumb from a drill-down → drill-down camera
   zooms out over 300ms; world view resumes.
3. Click the US → world fades out / drill-down fades in over
   200ms.
4. Pan-flick → camera continues drifting with visible inertia
   ~1s, decaying smoothly.
5. Slow pan, release with near-zero velocity → no momentum.
6. Two consecutive country clicks (mid-animation) → second click
   cancels first animation, starts new one.
7. `prefers-reduced-motion: reduce` → all transitions instant; no
   momentum decay.
8. Polish-A through Polish-C features still work: selection chip,
   `/` and `g` shortcuts, sidebar multi-select, bulk drag/delete,
   undo/redo across all op types, tree open/close animation.

---

## Polish backlog status (closing 2026-05-14)

All four follow-up polish passes for sub-projects 3 & 4 have
shipped:

- ✅ Polish-A — map selection chip + `/` / `g` shortcuts
- ✅ Polish-B — Geos sidebar multi-select (selection + bulk drag + bulk delete)
- ✅ Polish-C — universal undo/redo + tree expand/collapse animation
- ✅ Polish-D — animated drill transition + pan momentum

Out-of-scope follow-ups noted in the individual specs (rubber-band
map edges, country-name resolution for the map selection chip,
descendant dim during bulk drag, native iPad multi-touch) remain
deferred. None block ongoing CRM work.

---

## Fix 2026-05-14 — Geo paint mode regression

**Symptom:** Clicking a Geo node in the sidebar no longer entered
paint mode. Toolbar pill never appeared, cursor stayed default,
and country/state clicks fell through to drill-down / no-op. Both
world and drill-down maps affected (since neither ever saw an
`activePaintGeoId`).

**Root cause:** `GeoNodeRow.tsx` renders three absolute-positioned
drop-zone overlays (before/nest/after thirds) on top of the
clickable content row, with `pointer-events-auto` permanently on.
The overlays have no `onClick`, so every click on a row landed on
an overlay and bubbled up past the row's `onClick` (a sibling, not
an ancestor) into a no-op. The structure had been this way since
the original drag-and-drop reorder commit (`20a48b1`); paint
appeared to work earlier because users were entering paint via
"New geo" / "Add child" buttons (which call `setActivePaintGeo`
directly), not via clicking an existing row.

**Fix:** Gate `pointer-events-auto` on `activeDragId !== null`.
Drop zones now use `pointer-events-none` at rest and only become
interactive while a sortable drag is active. Drop-target detection
during drag is unaffected (dnd-kit still tracks the refs);
ordinary clicks now reach the row's handler and toggle paint mode.

Edit is one inline class change per overlay in
`components/territory/sidebar/GeoNodeRow.tsx`. Type-check clean.

---

## Fix 2026-05-14 — Stray rectangle around country in select mode

**Symptom:** After enabling multi-select from the toolbar and
clicking a country, a solid brand-colored rectangle appeared
enclosing the country's bounding box (not following the country
border).

**Root cause:** `.map-region-path:focus-visible` in
`app/globals.css` set `outline: 2px solid var(--color-brand)`.
Applied to an SVG `<path>`, CSS `outline` renders as a rectangle
around the path's bounding box, not as a stroke along the path
itself. Clicking a country focuses the path, triggering the rule.

**Fix:** Replace the rule with `outline: none` on both `:focus`
and `:focus-visible` for `.map-region-path`. Selection / pin /
hover indication is already handled via path stroke in
`CountryGeo` / `StateGeo`, so no replacement focus indicator was
added.

---

## Change 2026-05-14 — Drill-down moved to double-click

**Before:** Single-clicking a country on the world map both
pinned/unpinned it AND called `onDrillDown` to switch to the
drill-down view. Double-click did an in-place 2.5× zoom centered
on the country.

**After:** Single-click only toggles pin/unpin. Double-click
triggers drill-down. The in-place 2.5× zoom on dblclick is gone
(less useful at country level; users can still pan and use
wheel/buttons to zoom the world map).

**Files:**
- `components/territory/map/WorldMapView.tsx` — removed
  `onDrillDown` from `handleClickCountry`; `handleDoubleClickFeature`
  now resolves the geo's name from `geographiesRef` and calls
  `onDrillDown(entityCode, name)`.
- `components/territory/map/MapHelpPopover.tsx` — added
  "Click → pin/unpin country" and "Double-click → drill into
  country" rows to the keyboard shortcuts panel.

Paint / eraser / select-mode click branches are unchanged. Drill
behavior in `DrillDownMapView` is unaffected (states remain
paint-only).

## Architecture decision — Sellable modules (2026-05-17)

Brainstormed productizing the three areas as separately-sellable units.
Decision: **modular monolith with workspace entitlements**, Accounts as the
required base, Tasks + Territory&Team as paid add-ons. Seam enforced via
module manifests + ESLint boundary rules (no physical relocation yet); member
directory moves Core-side to break Tasks→Territory coupling. Server-authoritative
Directus access policies + route gate + conditional hydration. Self-serve billing
deferred to a future spec. Spec: docs/superpowers/specs/2026-05-17-sellable-modules-entitlements-design.md

## Sellable modules — implementation shipped (2026-05-18)

**Spec + plan:** `docs/superpowers/specs/2026-05-17-sellable-modules-entitlements-design.md` / `.claude/docs/plans/2026-05-17-sellable-modules-plan.md`

### What was built

**Server-authoritative entitlements.** New `workspace_entitlements` Directus collection (`workspace_id`, `module`, `status`, `expires_at`). Directus access policies enforce **default-deny** read filters so a workspace without the `tasks` entitlement gets zero rows from `tasks`, and one without `territory` gets zero rows from `geo_nodes`, `teams`, `regions`, `subregions`, `assignments`, `hierarchy_levels`. Bootstrapped idempotently in `scripts/bootstrap-directus.mjs`. Accounts is the required base (always entitled); Tasks and Territory&Team are gated add-ons.

**Entitlement resolution + client.** Pure resolver in `lib/entitlements.ts` (treats `active` and non-expired `trial` as entitled). `lib/entitlementsClient.ts` fetches the current workspace's rows with the same Directus-client + in-memory cache pattern as `lib/workspace.ts`. `hooks/useEntitlements.ts` wraps the client in React state.

**Module manifests.** `modules/manifest.ts` declares each add-on's entitlement key, routes, nav entries, slice list, and `hydrate()` hint. The app shell reads manifests; no ad-hoc module knowledge is hardcoded.

**Route gate + upgrade page.** `components/ModuleGate.tsx` checks entitlement on mount and redirects unentitled visitors to `/upgrade`. Mounted at `app/tasks/page.tsx`, `app/territory/page.tsx`, and `app/teams/page.tsx`. `/upgrade` is a static informational page.

**Conditional hydration.** `lib/hydrationPlan.ts` + `hooks/useDirectusAccounts.ts` gate Directus fetches behind entitlement checks; unentitled slices never hydrate.

**Entitlement-aware nav.** `hooks/useNavModules.ts` exposes `visibleModules()` — a module renders iff **entitled AND `modulesEnabled`**. `modulesEnabled` demoted to display-only (within-plan show/hide preference); it never grants access. Wired into 4 toolbars: `AccountsToolbar`, `TasksApp`, `Toolbar` (territory), `TeamsAdminView`.

**Seam correction — membersSlice as Core.** ESLint boundary rules in `eslint.config.mjs` classify `membersSlice` as Core (not Territory), so a Tasks→members import is Tasks→Core (allowed) rather than Tasks→Territory (forbidden). Tasks ⊥ Territory is fully enforced in CI (`test/eslint-boundaries.test.ts`).

**Account-detail Tasks tab.** Extracted to `components/tasks/AccountTasksTab.tsx` and mounted lazily behind the tasks entitlement in the account detail view, completing the seam fix for account-scoped task display.

**Owner-only admin toggle.** `lib/entitlementsAdmin.ts` + owner-gated UI in `/settings/workspace` (WorkspaceSettingsForm) lets an owner flip modules and set a trial `expires_at`. No payment provider.

**Tests.** 9 test files, 44 tests — all green. Includes ESLint boundary enforcement test, entitlement resolver edge cases, ModuleGate redirect, hydration plan, nav-module visibility, and admin grant/revoke logic.

### Known limitations / follow-ups

1. `hierarchy_levels` is Territory-gated, so a tasks-entitled / territory-unentitled workspace shows blank member-level labels — spec-defined ownership; flagged for product review.
2. Owner admin form does NOT prefill current entitlement values — intentional YAGNI deferral.
3. Account-detail Tasks tab no longer shows a count badge and requires the tasks entitlement.
4. **Directus deploy caveat (existing instances):** `workspace_entitlements.workspace_id → workspaces` relation's `one_field` is NOT auto-updated by the idempotent bootstrap (`tryCreate` skips existing) — requires a manual relation-meta PATCH (`meta.one_field: 'workspace_entitlements'`) or a full recreate. Fresh bootstraps are correct. Manual verification checklist in `scripts/bootstrap-directus.mjs`.
5. Self-serve billing (Stripe/checkout/webhooks) explicitly out of scope — future spec.

Final cross-cutting review (2026-05-18) — READY TO MERGE, no critical/important
issues. Three minor non-blocking follow-ups recorded:
6. Transient entitlement-fetch failure caches `DENY_ALL` with no TTL/retry, so
   a network blip can lock out an *entitled* user until reload (fail-safe
   direction, UX only). Consider not caching error results or a short TTL.
7. `ModuleGate` gates on entitlement only — a workspace entitled-to-X but with
   `modules_enabled.X = false` hides the nav link yet `/X` stays directly
   reachable and hydrates. Consistent with spec (entitlement = security
   boundary; modulesEnabled = visibility), recorded as a conscious decision.
8. Cosmetic: `/teams` shows a Territory nav link while on Teams (both are the
   territory module); other toolbars exclude the current section. No
   correctness/access impact.

**Superseded:** the server-side entitlement enforcement mechanism described above was found incompatible with Directus 11 and was redesigned — see "Directus-11 entitlement enforcement redesign" below.

## Directus-11 entitlement enforcement redesign — shipped + acceptance-tested (2026-05-18)

**Spec + plan:** `docs/superpowers/specs/2026-05-18-entitlement-enforcement-directus11-design.md` / `docs/superpowers/plans/2026-05-18-entitlement-enforcement-directus11.md`

### What was redesigned

The prior implementation used a **relational M2O filter** (`workspace_entitlements.status _eq active`) which Directus 11 does not support in permission rules — it silently ignored the filter and granted full access regardless of entitlement state. The redesign replaces that with a **mirror-column pattern**:

- **Mirror columns** (`tasks_entitled_until`, `territory_entitled_until`) added to `workspaces` table. Each holds a `datetime` value: `9999-12-31T00:00:00.000Z` when the add-on is active with no expiry, the actual expiry timestamp for a trial, or `null` = disabled.
- **Directus permission rule** for each gated collection uses `_gt $NOW` on the mirror column via the workspace M2O join — a scalar date comparison that Directus 11 evaluates correctly.
- **`setEntitlement` second write** in `lib/entitlementsAdmin.ts` writes the mirror value atomically with every entitlement status change.
- **Bootstrap `ensureMirrorColumns`** (T3) adds `tasks_entitled_until` and `territory_entitled_until` to `workspaces` if absent; `setPermission` (T4/T5) is now idempotent — deletes all prior rules for a role+collection+action before inserting one, eliminating duplicate-rule accumulation.
- **`recomputeWorkspaceMirrors`** (T6) recomputes mirrors from `workspace_entitlements` for all workspaces at bootstrap time, so existing data is corrected even if `setEntitlement` was not called.

### Known limitation / caveat

Direct Directus-admin edits to `workspace_entitlements` (e.g. via the Directus admin UI or raw API outside the app) do **not** automatically propagate to the mirror columns. To re-sync, run `node scripts/bootstrap-directus.mjs` (which triggers the recompute pass) or use the owner-settings panel in the app (which calls `setEntitlement` and performs the mirror write).

### Prior known-limitation RESOLVED

The Directus-11 relational-permission-filter incompatibility — the O2M-nested add-on read filter returning HTTP 500/400 on Directus 11.3.5, discovered during post-merge live deny-path testing and NOT previously a numbered limitation — is now resolved by the mirror-column + `_gt $NOW` approach described above. Spec + plan: `docs/superpowers/specs/2026-05-18-entitlement-enforcement-directus11-design.md` / `docs/superpowers/plans/2026-05-18-entitlement-enforcement-directus11.md`.

### Live acceptance results (Step 4 deny-path matrix, 2026-05-18)

Against Directus 11.3.5 at http://localhost:8055, workspace Default (cdeaa9ff-0beb-4306-9bce-7648341c707b), viewer-test@example.com:

```
-- territory+tasks ACTIVE --
geo_nodes: HTTP 200 rows=8
teams: HTTP 200 rows=6
hierarchy_levels: HTTP 200 rows=5
tasks: HTTP 200 rows=1
accounts: HTTP 200 rows=6
-- territory DISABLED --
geo_nodes: HTTP 200 rows=0
teams: HTTP 200 rows=0
hierarchy_levels: HTTP 200 rows=0
-- territory TRIAL future --
geo_nodes: HTTP 200 rows=8
-- territory TRIAL past --
geo_nodes: HTTP 200 rows=0
-- restore territory ACTIVE --
geo_nodes: HTTP 200 rows=8
```

All checks passed: active → rows>0, disabled → rows=0 (not 500), trial future → rows>0, trial past → rows=0, restore → rows>0. Admin unaffected (all 200). Idempotency confirmed (re-run → still exactly 1 rule per add-on read collection). Default workspace restored to territory+tasks active (both `*_entitled_until = 9999-12-31T00:00:00.000Z`).

tasks gating confirmed active/disabled; trial future/past paths exercised via territory (same filter mechanism).

---

## 2026-05-19 — Computed/formula fields design (CRM evolution sub-project A)

Brainstormed and specced the first sub-project in the CRM-primitives phase: **computed fields** for the Accounts module. Spec lives at `docs/superpowers/specs/2026-05-19-computed-fields-design.md`. No code changes yet.

Key decisions locked during brainstorm:

- **Scope:** Accounts only; computed = fourth field type alongside categorical/metric/text. Decomposed the broader "true CRM" ask into sub-projects A (computed fields, this) → B (field-type/schema upgrades) → C (contacts first-class) → D (activities timeline) → E (saved views/bulk actions) → F (audit log) → G (automation). Order is a recommendation, not a commitment.
- **Expressiveness — Tier 2:** arithmetic (`+ − × ÷`) + comparison + `IF` + `AND/OR/NOT`. Output types: `number | text | boolean`. No function library yet (deferred to Tier 3).
- **Builder UX — two-mode:** Simple form (three shapes: arithmetic combinator / bucket-tier / boolean flag) with fall-through to Advanced text editor (field autocomplete on `{`, inline error markers, debounced live preview). Both modes round-trip through a shared canonical AST; "too complex for Simple" banner is the explicit escape hatch.
- **Evaluation — hybrid:** single pure evaluator at `lib/formula/evaluate.ts` called from both (a) editor live preview and (b) materialization into `account.fields` on write. Sortable/filterable for free because values live in the same map.
- **Field refs by `id`, not label** — non-negotiable. Renames are no-ops; deletions surface as `MISSING_FIELD` with a red dot in Manage Fields.
- **`outputType` locked after first save**, with explicit "Convert output type…" destructive action that clears the formula and runs workspace backfill. Avoids mixed-type intermediate states.
- **Errors render `—`** with hover tooltip explaining why; not persisted. Save-time validation blocks parse errors, cycles, type mismatches, output-type mismatch, incomplete Simple rows.
- **Surface integration:** read-only preview in Add/Edit modal · sortable+filterable table columns (text outputs derive distinct-values from observed data, no declared enum) · Kanban grouping only for text outputs with ≤~12 observed values and drag-to-move disabled · excluded from CSV import target dropdown · included in CSV export with `ƒ ` prefix on the header.
- **Boolean rendering:** `✓` true / `✗` false / `—` missing-or-error (distinct from each other).
- **Performance:** target <1ms per eval, no memoization initially; workspace backfill batched into the existing store write path.
- **Testing:** layers 1 (`lib/formula/*` units) and 2 (store integration) land with the feature; layer 3 (FormulaEditor component tests) introduces the UI-test pattern or defers.

Next: write the implementation plan once the user has reviewed and approved the spec.

---

## 2026-05-22 — Computed-fields feature implementation complete (CRM evolution sub-project A)

22-task implementation plan executed end-to-end via subagent-driven-development. Plus 5 follow-up commits resolving every IMPORTANT finding from the final code review. Branch: `accounts-crud` → merging to `main`.

### What shipped

- **`lib/formula/*` foundation** (6 modules + tests): `ast.ts`, `parse.ts`, `evaluate.ts`, `typeCheck.ts`, `recompute.ts`, `simpleForm.ts`, plus `evalErrorMessage.ts` added during review-fix. Pure evaluator with strict type rules, short-circuit semantics, missing-value propagation; Kahn's-algorithm topological order + cycle detection; round-trip Simple ↔ Advanced via canonical AST. Field refs are by stable `id`, not label (non-negotiable).
- **Schema widening** (`lib/accountFields.ts`, `types/account.ts`, `lib/directus-mappers.ts`): `FieldType` gained `'computed'`; `ComputedOutput = 'number' | 'text' | 'boolean'`; `Account.fields` widened to `Record<string, string | number | boolean>`. Boolean rendered as `✓ / ✗ / —` (distinct from each other). `formatFieldValue`'s historic `≤0 → '—'` guard for metrics replaced with finite-number guard (computed metrics can legitimately be 0 or negative).
- **Directus columns** (out-of-band, documented at `docs/superpowers/notes/2026-05-19-field-defs-columns.md`): `output_type`, `formula_source`, `formula_form`, `formula_ast` — all nullable.
- **Store wiring** (`store/slices/accountsSlice.ts`): `recomputeAccount` tail in `addAccount`, `updateAccount`, `setAccountField`, `importAccounts`, `addFieldDef`, `updateFieldDef`, `removeFieldDef`. **Data-loss bug fixed during review**: `refreshAllAccountsForComputed` no longer sweeps orphan non-computed keys (was clobbering the existing "delete field but keep data" flow). `removeFieldDef` on a computed field now explicitly cleans that key out of every account.
- **FormulaEditor** (`components/accounts/formula/*`): two-mode editor — Simple (three shapes: arithmetic combinator / bucket-tier / boolean flag) + Advanced (textarea with `{` autocomplete, inline error markers with "did you mean" suggestions, debounced live preview). Save-gate validates parse, type inference, declared-vs-inferred output match, cycle detection. ConvertOutputDialog **persists immediately** via `onSave` before updating local state (review fix); workspace backfill fires on confirm, not on subsequent Save. `tooComplex` banner derives from the live draft AST, not the saved formula; Advanced → Simple transitions recover SimpleFormConfig via `astToSimple` when possible.
- **Surfaces**: AccountsTable (ƒ glyph in computed column headers; boolean rendering; derived distinct-value filter pills for text outputs; tri-state All/True/False pill for boolean outputs; per-error-code tooltips on errored `—` cells via shared `evalErrorMessage` helper); KanbanBoard (text-output computed allowed as Group-by when ≤12 observed values; drag-to-move disabled with amber banner); AddEditAccountModal (live read-only preview rows with `evaluate`-against-draft and error tooltips); CSV import (computed fields excluded from target dropdown, surfaced in "Skipped — computed field" group); CSV export at `lib/accountsCsvExport.ts` (ƒ-prefixed headers, boolean escaped as true/false strings); OverviewTab detail page (ƒ badge for computed fields); ManageFieldsModal (Computed type option in dropdown, embedded editor, broken-ref red dot via `collectFieldRefs`, dismissible amber warning when categorical option referenced by a computed formula is removed).
- **Tests**: 112 passing across 18 files. Pure `lib/formula/*` units (Layer 1 per spec). Store integration tests covering `setAccountField`, `addFieldDef` (computed backfills all accounts), `removeFieldDef` (both computed-key cleanup and orphan-preservation for non-computed deletes), `importAccounts` batched recompute (Layer 2 per spec).

### Limitations / out-of-band

- The four `field_definitions` Directus columns (`output_type`, `formula_source`, `formula_form`, `formula_ast`) still need to be added in the Directus admin UI before the feature works against real data. Documented at `docs/superpowers/notes/2026-05-19-field-defs-columns.md`. Mappers and store wiring are ready.
- The manual smoke matrix (Task 21 step 2 in the plan: create/edit/delete formulas, cycle detection, conversion, import/export round-trip, disabled-drag Kanban banner, broken-ref red dot, categorical-option-removal warning) is left for human walkthrough against the dev server.
- Workspace-backfill progress toast (spec mention for large workspaces) not implemented — low impact at current scale.
- 3 territory-map files (`components/territory/map/{DrillDownMapView,MapHelpPopover,WorldMapView}.tsx`) have unrelated uncommitted modifications that predate this feature; left untouched throughout.

### Spec compliance verdict (from final review)

CHANGES REQUIRED → ALL 7 IMPORTANT findings resolved (commits `b23c1b3`, `d2d8c2a`, `f33d979`, `e5583fa`, `000e964`). 0 BLOCKERS at any point. 5 NITS deferred (dead `isFieldDefinitionComputed` export, etc.).

### What unlocks next

CRM evolution sub-projects B (field-type & schema upgrades), C (contacts first-class), D (activities timeline), E (saved views / bulk actions), F (audit log), G (automation). Plan was decomposed during brainstorm; specs not yet written for B–G. Computed fields was the foundation pass — schema widening + the recompute tail are reusable by B.

---

## 2026-05-22 — Directus columns added + smoke matrix started (computed-fields follow-up)

Closing out the two limitations called out above ("Directus columns" + "manual smoke matrix").

### Directus columns — DONE

Extended `scripts/bootstrap-directus.mjs` to declare the four computed-fields columns on `field_definitions` (both in the `FIELD_DEFINITIONS_COLLECTION` definition for fresh bootstraps and as `tryCreateField` backfill calls for existing instances):

- `output_type` (string, dropdown: number/text/boolean)
- `formula_source` (text)
- `formula_form` (json)
- `formula_ast` (json)

Ran bootstrap against the live Directus 11.3.5 at http://localhost:8055. Verified via `GET /fields/field_definitions` — all four columns present with correct types. Re-run is idempotent (logs `⟳ already exists — skipping`).

### Bug fixed mid-smoke-test: mapper alias was dropping all four computed columns on write

While walking the smoke matrix at the browser, step 1 (create computed formula) surfaced the symptom "field saves but no computed value populates." Root cause: `lib/directus-write.ts:18` was importing the legacy `fieldDefToRow` mapper under the alias `fieldDefToRowPatch`:

```ts
fieldDefToRow as fieldDefToRowPatch,  // wrong — legacy mapper only handled label/type/options/isCurrency/entity/aliases
```

The legacy mapper had **no awareness** of `output_type`, `formula_source`, `formula_form`, `formula_ast`. Both `createFieldDef` and `updateFieldDef` used the alias, so every computed-field write silently dropped all four columns. Field rows were persisted with `type='computed'` but `formula_ast=null`, so on next hydrate the evaluator had nothing to run.

Tests didn't catch it because `store/slices/accountsSlice.computed.test.ts` mocks `directusWrite.createFieldDef` directly — the mapper path was never exercised in the suite.

Fix:
- `lib/directus-write.ts:18` — import the real `fieldDefToRowPatch` (no alias rename).
- `lib/directus-mappers.ts` — deleted the now-dead legacy `fieldDefToRow` to prevent the import collision recurring.
- `tsc --noEmit` + `npm test` (112/112 across 18 files) clean.

Worth a follow-up integration test that exercises the actual mapper round-trip on write; not done yet.

### Smoke matrix — 4 of 11 verified at browser, paused

Walked at `http://localhost:3000` against live Directus:

- ✅ 1. Create computed formula (Margin = TAM-SAM) — pass *after* the mapper fix
- ✅ 2. Live preview in editor (Advanced mode round-trip, preview row updates per account)
- ✅ 3. Cycle detection (Alias → {Margin}, then Margin → {Alias}+1 correctly blocked with "would create a cycle")
- 🟡 4. Output-type conversion — in progress when paused
- ⏳ 5. Boolean rendering (✓/✗/—)
- ⏳ 6. Broken-ref red dot
- ⏳ 7. Categorical-option-removal amber warning
- ⏳ 8. Kanban disabled-drag banner
- ⏳ 9. CSV export round-trip (ƒ-prefixed headers, boolean serialization)
- ⏳ 10. CSV import excludes computed from target dropdown
- ⏳ 11. Detail-page ƒ badge in OverviewTab

Also caught mid-matrix: Directus JWT expires at 15 min and the app didn't auto-refresh — got a phantom "permission denied" creating Alias. Hard refresh resolved. Worth investigating whether `lib/directus-fetch.ts` (or wherever refresh lives) actually retries on 401; out of scope here.

### Status of the two original limitations

- **Directus columns** — RESOLVED (live + idempotent bootstrap).
- **Manual smoke matrix** — PARTIAL (4/11). Resume by saying "resume smoke matrix"; checklist lives in conversation, not yet codified.

Remaining limitations from 2026-05-22 entry unchanged: workspace-backfill progress toast not implemented; 3 territory-map files have pre-existing uncommitted modifications.

---

## 2026-07-06 — WaferIQ pivot: P0 decouple & stabilize

The prior CRM evolution roadmap (Phase 1 multi-tenant Accounts shipped;
Phases 2–4 planned) is **shelved**. The app is being repointed off
territory planning onto **WaferIQ** — a daily-pain wedge for semiconductor
distributors / design-win teams. The wedge itself (POS/sell-through
reconciliation vs design-win funnel) is gated on customer discovery. Prior
smoke-matrix work (7 unchecked items) is paused indefinitely.

Six engineering phases planned: P0 decouple/stabilize (this batch), P1
wedge-agnostic ingestion (safe to start next), then P2–P5 gated on the
discovery decision. See `.claude/docs/store-shape.md` for the pre-P2 store
audit produced this pass.

### Git surface

- Two closeout commits landed on `main` (Directus computed-fields column
  bootstrap + mapper alias bug; territory-map RU/CA projection tuning) —
  these clear the pre-existing dirty tree so v-territory captures real
  state, not WIP.
- Tag `v-territory` marks the final territory-era commit.
- Branch `pivot/waferiq` cut off `v-territory`. All P0+ work lives here.

### P0 changes on pivot/waferiq

- `lib/legacyFlags.ts` — `isLegacyTerritoryEnabled()` reading
  `NEXT_PUBLIC_LEGACY_TERRITORY_ENABLED`. Documented in
  `.env.local.example`. Default OFF.
- `git mv components/territory → legacy/components/territory` and
  `git mv app/territory/TerritoryClient.tsx → legacy/app/TerritoryClient.tsx`.
  Internal `@/components/territory/*` imports inside the moved tree
  rewritten to `@/legacy/components/territory/*`.
- `app/territory/page.tsx` recreated as a flag-gated proxy: `notFound()`
  when flag off; dynamic import of the moved client when on. Preserves the
  route surface without loading map libs on the critical path.
- `app/page.tsx` root redirect changed from `/territory` → `/accounts`. As
  long as the flag stays off, `react-simple-maps` + `d3-geo` never enter
  the initial critical render path; they remain in `node_modules` and
  importable from legacy.
- Shared libs (`lib/territoryIndex.ts`, `lib/regionData.ts`,
  `lib/geoTreeFilter.ts`, `lib/choropleth.ts`, `lib/geoUtils.ts`,
  `hooks/useGeoData.ts`) NOT moved — consumed by non-territory surfaces
  (accounts). Documented as a P2 pruning target in `store-shape.md`.
- Store slices NOT reshaped — all 15 remain composed into
  `useTerritoryStore`. `store-shape.md` documents each slice's fate under
  WaferIQ (delete / reshape / keep) so P2 has a written map.
- Empty shells created: `ingestion/`, `domain/`, `views/`, each with a
  README stating the phase and intent.
- `CLAUDE.md` updated: fixed stale "no test suite" claim; added pivot
  status.
- ESLint boundary rules in `eslint.config.mjs` NOT updated — the module
  boundaries still target `components/territory/**` glob paths that no
  longer contain code. `test/eslint-boundaries.test.ts` still passes
  because it synthesizes fake file paths. **Follow-up:** either update the
  rules to target the new legacy paths or drop them (they're guarding
  code that's no longer active).

### Harness state

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors, 3 pre-existing warnings (all in the moved
  DrillDownMapView / WorldMapView, `react-hooks/exhaustive-deps`).
- `npm test` — 112/112 pass across 18 files.

### What unlocks next

- **P1 ingestion foundation.** Wedge-agnostic — safe to start under
  `ingestion/` before discovery names the wedge. CSV/XLSX intake, column
  mapping, canonical model, validation, Zustand persistence.
- **Discovery.** Until it names the wedge, do not populate `domain/` or
  `views/` — the P1→P2 gate is real per the plan.

### Limitations / follow-ups

- The 4 shelved smoke-matrix items (5–11) are officially deferred, not
  resumed. The last-run state (4/11 verified against `Margin = TAM-SAM`)
  is preserved above.
- ESLint module boundaries need to be updated to reflect the new paths (or
  dropped) — noted above.
- Store still exposes 15 slices via `useTerritoryStore`; renaming +
  pruning is a P2 task, not P0.

---

## 2026-07-06 — WaferIQ P1: wedge-agnostic ingestion foundation

P1 lands the ingest-normalize-persist pipeline. Wedge-agnostic per the
plan — no entity schemas yet (those are P2). Goal per the plan: "you can
drop a real, messy file in and get a clean, validated dataset out."

### Scope calls made up-front (not user-confirmed, defensible from plan)

1. **New Zustand store** (`store/waferiqStore.ts`) rather than a slice on
   the legacy `useTerritoryStore`. Matches the "separate store may be
   cleaner" note in `store-shape.md`; keeps ingested datasets from
   entangling with parked territory state. Future consolidation is
   mechanical if we ever unify.
2. **No target schema in P1.** Canonical model is loose: `Dataset` with
   typed `Column`s and dynamic `Row`s. Column "mapping" = rename headers,
   override inferred types, toggle required, discard. Mapping to entity
   fields is P2's job (entities don't exist yet).
3. **In-memory persistence only.** Plan lists local persistence as
   optional; deferring to P5 to keep P1 tight.
4. **Root redirect updated** `/accounts` → `/ingest` — the wedge-agnostic
   surface is now the natural landing. Legacy `/accounts` still works;
   territory still parked behind the flag.

### What landed

**Ingestion core (`ingestion/`)**

- `types.ts` — `Dataset`, `Column`, `Row`, `ColumnType`, `ImportSource`,
  `ValidationIssue{Kind}`, `ParsedSheet`. Deliberately loose.
- `parse.ts` — `parseFile(file)` (browser) + `parseArrayBuffer(buf, name)`
  (testable). Uses SheetJS with `cellDates: true`. Multi-sheet workbooks:
  picks first non-empty sheet, tracks the rest in `otherSheets` for
  UI surfacing. Empty cells → null. Empty headers → "Column N". Throws
  `ParseError` on unreadable / empty-sheets input.
- `infer.ts` — `inferColumnType(cells)`: date > number > boolean > text
  priority (dates are the most specific due to narrow regex; number over
  boolean so 0/1 columns infer as number). `coerceCell(raw, type)`: returns
  null on empty or coercion failure (caller decides whether that's an issue).
- `columns.ts` — `initialColumns(sheet)`: derives one `Column` per header
  with slugified stable keys, disambiguates collisions, infers per-column type.
- `validate.ts` — `buildDataset(sheet, columns)`: coerces rows to typed
  `Row` objects. Emits `type_mismatch` on non-empty cell coercion failure,
  `empty_required` on empty cells in required columns. Bad rows still land
  in output with null for the failed cell (P1 doesn't filter — that's
  P2/P3 concern).

**Store**

- `store/waferiqStore.ts` — new `useWaferiqStore` composed from
  `store/slices/datasetsSlice.ts` (`datasets`, `staged`, `startImport`,
  `updateStagedColumn`, `cancelImport`, `commitDataset`, `deleteDataset`).
  Same slice + persistKeys convention as the legacy store.

**UI**

- `/ingest` route: `app/ingest/page.tsx` (server, metadata) →
  `IngestClient.tsx` (client, dynamic-imports `IngestApp` with `ssr:false`)
  → `IngestApp.tsx` (Zustand + orchestration). This three-layer pattern
  works around Next 16's rule that `dynamic({ ssr: false })` can only live
  inside a Client Component (matches the legacy territory pattern).
- Components in `components/ingest/`: `DropZone`, `ColumnMappingTable`,
  `ValidationSummary`, `DatasetList`. Uses existing design tokens
  (`--surface-*`, `--ink-*`, `--brand`).
- Root `app/page.tsx` redirect switched `/accounts` → `/ingest`.

**Tests (+29 new, 141/141 total)**

- `ingestion/parse.test.ts` (5) — hits `parseArrayBuffer` directly
  because jsdom's `File.arrayBuffer` and `Response(file).arrayBuffer`
  don't work as they do in real browsers.
- `ingestion/infer.test.ts` (14) — inferColumnType priority, coerceCell
  edge cases, date narrowness, 0/1-as-number preference.
- `ingestion/columns.test.ts` (5) — slug keys, collision disambiguation,
  fallback to `col_N`, per-column inference, defaults.
- `ingestion/validate.test.ts` (5) — coercion, mismatch issues,
  required-empty issues, discarded columns, missing source columns.

### Harness state

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors, same 3 pre-existing exhaustive-deps warnings
  in the parked map files.
- `npm test` — 141/141 across 22 files (was 112/18).
- `npm run build` — succeeds. All 16 routes prerender; `/ingest` static.

### Verified vs unverified

- **Unit + build: green.**
- **Manual browser verification: NOT DONE in this batch.** Plan's P1
  "done when" is empirical — drop a real messy file, see it round-trip.
  Next step: `npm run dev`, drop distributor POS or design-win export in
  `/ingest`, confirm the mapping + validation surface behaves.

### What unlocks next

- **Discovery gate.** P2+ blocked until customer discovery names the
  wedge. Do NOT populate `domain/` or `views/` before then.
- **Optional between-phase polish** (won't block P2):
  - Local persistence (localStorage / IndexedDB) — currently datasets die
    on refresh. Bump to P5 unless a discovery interview needs it sooner.
  - Sample-data CSV in `public/` for hero-page demoing without a real file.
  - Better staged import name defaulting (filename-sans-ext already, but
    could pull from the sheet name for XLSX).

### Follow-ups from P0 still open

- ESLint module boundaries still point at empty `components/territory/**`
  globs. Update or drop when P2 lands.
- Shared libs (`lib/territoryIndex.ts`, etc.) still colocated with active
  code; prune under P2.

---

## 2026-07-09 — WaferIQ P2: POS-recon data model

### Wedge decision

Locked as **POS / sell-through reconciliation.** Design-win funnel
tracking deferred to a possible sibling wedge later, not killed. Choice
was made without formal discovery, based on the four-point argument
recorded in `[[waferiq-pivot]]` memory: dollar-attached pain per event,
monthly-close cadence matches the retention thesis directly, moat is a
matching algorithm horizontal tools can't replicate cleanly, and the
core is testable with objective correctness. User asked for a
recommendation, took it.

### Scope calls (not user-confirmed, defensible from plan)

1. Wedge domain lives at `domain/pos-recon/` so a `design-win-funnel/`
   sibling is a clean add later.
2. Claims modeled as a **discriminated union** `Claim = ShipAndDebit |
   PriceProtection` with shared base fields, so the P3 matcher walks
   them uniformly.
3. `DiscrepancyFlag` is a nested type on `ReconciliationResult`, not a
   top-level entity. Flags don't exist independently of results.
4. **Store: added new slices, did not rename or reshape the legacy
   `useTerritoryStore`.** The plan says "reshape Zustand stores" — read
   as reshaping the wedge store (`waferiqStore`), not renaming the
   legacy artifact that still powers parked accounts/teams/tasks routes.
   Renaming rippled across those routes would be a big diff for
   cosmetic gain and violates "legacy parked not deleted."
5. **No matching engine here.** P2 is data model only; P3 owns matching.
6. **No UI here.** P4 owns the recon dashboard. `/ingest` still works
   and is enough to see rows land in the new slices via the mapper.
   (The bridge UI that lets a user pick a dataset and hit `mapPOSRecords`
   is a small P2→P3 chore, tracked in `next-steps.md`.)

### What landed

**Domain (`domain/pos-recon/`)**

- `entities.ts` — `POSRecord`, `ClaimBase`, `ShipAndDebitClaim`,
  `PriceProtectionClaim`, `Claim` (union), `ClaimType`,
  `ReconciliationResult`, `DiscrepancyFlag`, `DiscrepancyFlagKind`,
  `DiscrepancySeverity`, `IsoDate`, `Money`. Dates stored as ISO
  strings for serialization / timezone stability. Money is `number` in
  the record's own currency (code stored per-record; tolerance is the
  engine's problem, not the entity's).
- `import.ts` — `mapPOSRecords`, `mapShipAndDebitClaims`,
  `mapPriceProtectionClaims`, `mapClaims` (union-discriminated wrapper).
  Each takes an ingested `Dataset` + a per-entity `ColumnMapping` and
  returns `{ entities, issues }`. Coercion helpers strip currency
  symbols (`$€£¥`) and commas from money fields, normalize dates to
  `YYYY-MM-DD` in UTC. `MappingIssue` kinds: `missing_column`,
  `empty_required`, `type_coerce`.

**Store**

- `store/slices/posRecordsSlice.ts` — `posRecords`, `addPOSRecords`,
  `replacePOSRecordsForDataset`, `deletePOSRecordsForDataset`,
  `clearPOSRecords`. Dataset-scoped ops so re-importing the same file
  replaces rather than duplicates.
- `store/slices/claimsSlice.ts` — mirror shape for `Claim[]`.
- `store/slices/reconResultsSlice.ts` — engine output, populated by
  P3. `lastReconAt` timestamp. Wholesale set/clear; no partial
  mutation API (results regenerate atomically each run).
- `store/waferiqStore.ts` — recomposed to spread all four slices
  (`datasets` + 3 new). Same slice + persistKeys convention as legacy.

**Tests (+8 new, 149/149 total across 23 files)**

- `domain/pos-recon/import.test.ts` — POS projection happy path,
  missing_column path, empty_required path, type_coerce path, currency
  strip on money fields, S&D discrimination, PP discrimination,
  `mapClaims` union.

### Harness state

- `npx tsc --noEmit` clean (fixed one strict index-signature error mid-batch
  by widening a helper to `object` and casting internally).
- `npm run lint` — 0 errors, same 3 pre-existing exhaustive-deps warnings.
- `npm test` — 149/149 across 23 files.
- `npm run build` — succeeds; route table unchanged from P1.

### Verified vs unverified

- Unit + build: green.
- Manual verification NOT DONE. There is no UI wired to `mapPOSRecords`
  yet — the bridge between `/ingest` and the entity slices is a
  P2→P3 chore. Verifying today means writing a scratch script that
  hydrates a fake `Dataset` and calls the mapper, which the tests
  already do. Real-file verification happens when the bridge UI lands.

### What unlocks next

- **P3 — matching engine.** Now unblocked. Takes `POSRecord[]` +
  `Claim[]`, emits `ReconciliationResult[]`. Owns matching
  (part-number + customer + date-window + qty tolerance),
  discrepancy-flag generation, calculated-credit math. Claude Agent
  SDK integration lives here as an isolated module for fuzzy column
  mapping / entity matching per the plan's cross-cutting rule.
- **Small P2→P3 bridge UI.** Once P3 lands, a "run recon" button on
  `/ingest` (or a new `/recon` route) is the minimum needed to see
  the whole pipeline work end-to-end.

### Follow-ups from P0/P1 still open

- ESLint module boundaries (unchanged — still points at empty globs).
- Shared libs pruning (unchanged — accounts still imports them).
- P1 manual browser verification (unchanged — should happen alongside
  the bridge UI work).

---

## 2026-07-09 — WaferIQ P2 bridge UI: /ingest → POS-recon entities

Small batch to close the gap between P1 (raw datasets) and P2 (typed
POS-recon entities). Not a phase in the plan; the P2 done-when only
required the data model, but the P2 entry called this out as the
missing user-facing seam. Landing it now unblocks manual verification.

### What landed

- `domain/pos-recon/suggest.ts` — heuristic column-to-entity-field
  suggester. Synonym tables per entity kind (POS, S&D, PP) covering
  realistic distributor headers ('MPN', 'Disti', 'Qty', 'Ext Total',
  'Auth #', etc.). Scoring: exact = 100, normalized substring = 70,
  token-boundary match = 50. Never fuzzy — false positives are more
  harmful than false negatives when the next step is coercion. Fields
  are processed longest-synonym-list first so specific fields
  (`authorizedPrice`) claim their column before generic ones (`price`).
  Placeholder for a Claude Agent SDK integration in P3.
- `components/ingest/EntityMappingPanel.tsx` — inline panel:
  entity-kind picker, per-field column dropdowns seeded from the
  suggester, "Run mapping" button, outcome summary. Uses the `key`
  remount pattern (`<MappingForm key={kind} />`) so switching entity
  kind resets the form cleanly — avoids the `set-state-in-effect`
  antipattern that Next 16 / React 19 lint now flags.
- `components/ingest/DatasetList.tsx` — expand toggle per dataset,
  entity counts (POS records, S&D claims, PP claims), cascading delete
  so removing a dataset drops its parked entities via the slice APIs.
- Claim replacement logic: when running the mapper for one claim type,
  keep this-dataset claims of the OTHER type intact (a dataset may
  legitimately produce both from separate passes).

### Tests (+7 new, 156/156 total across 24 files)

- `domain/pos-recon/suggest.test.ts` — canonical snake_case matching,
  distributor-style synonyms ('Disti', 'MPN', 'Qty'), no-double-claim
  invariant, no-match returns empty, discarded columns ignored, S&D
  cost/authorized synonyms, PP original/new/effective synonyms.

### Harness state

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors (fixed a `react-hooks/set-state-in-effect`
  error mid-batch by dropping the useEffect reset in favor of `key`
  remount). Same 3 pre-existing exhaustive-deps warnings in parked map
  files.
- `npm test` — 156/156 across 24 files.
- `npm run build` — succeeds. Route table unchanged.

### Verified vs unverified

- Unit + build: green.
- Manual browser verification: NOT DONE. Now genuinely unblocked
  though — bridge UI exists, POS-recon slices exist, ingestion parser
  exists. Next-steps.md prioritizes this.

### What unlocks next

- **P3 — matching engine.** Real work now. Consumes `POSRecord[]` +
  `Claim[]` from `useWaferiqStore`, emits `ReconciliationResult[]`
  via `setReconResults`. Matching algorithm + tolerance + discrepancy
  flag generation. Claude Agent SDK as an isolated fuzzy-matching
  module. Test against real anonymized partner data per the plan.

---

## 2026-07-09 — WaferIQ P3: POS reconciliation engine

Plan's P3 done-when: "real input produces correct flags/metrics, proven
by fixture tests." Landing all the mechanics; partner-real fixtures are
deferred to when a discovery conversation surfaces anonymized data.

### Scope calls (not user-confirmed, defensible from plan)

1. Engine + matcher + normalize in three files, not over-modularized.
2. **`Matcher` interface + `LocalMatcher` only** in P3. Real Claude
   Agent SDK integration deferred until API keys are wired — the seam
   is the module boundary the plan wanted.
3. Sensible `defaultConfig`; overridable via param. No settings UI yet.
4. Minimal `ReconRunner` UI on `/ingest` so the engine is invokable
   end-to-end without a scratch script. Full drill-down = P4.
5. Fixtures are synthetic and cover every flag kind. Partner-real
   fixture ingestion is a follow-up.

### What landed

**Engine core (`domain/pos-recon/`)**

- `normalize.ts` — `normalizePartNumber` (uppercase, strip
  non-alphanumerics), `normalizeCustomer` (lowercase, drop punctuation,
  strip common suffixes: Inc/Ltd/GmbH/Corp/…), `dateDiffDays` (absolute
  int days between ISO dates; NaN on unparseable).
- `matcher.ts` — `Matcher` interface with `customerScore(a, b)` and
  `partScore(a, b)` returning `[0, 1]`. `LocalMatcher` default: exact-
  after-normalize = 1.0, prefix/suffix relationship = 0.7, else 0.
  Deliberately conservative — no edit-distance fuzz; false positives
  in recon cost users real money, so ambiguous cases should end up in
  the flagged bucket via the engine, not silently pass. `AgentMatcher`
  is the follow-up; interface is the seam.
- `engine.ts` — `reconcile(pos, claims, config?, matcher?)` returning
  `ReconciliationResult[]`. Three passes:
  1. Bucket POS by `(distributor | normalizedPart)`; for each claim,
     find best-scoring POS candidate above `customerScoreThreshold`
     and within `hardDateWindowDays`. Beyond hard window → treat as
     unmatched entirely.
  2. Build one result per POS row. Empty → `missing_claim`. Non-empty
     → collect flags via `buildFlagsForMatch`; `matched` if flags
     empty else `flagged`. Compute `calculatedCredit` per claim
     type (S&D: (cost − authorized) × qty; PP: (original − new) × qty).
  3. Any claim not linked to a POS row → `orphan_claim` result.
- `defaultConfig`: qty tolerance ±5%, soft date window 30d, hard 90d,
  customer score threshold 0.7, price-mismatch threshold ±5%, strict
  distributor on.

**Flags emitted**

- `missing_claim` (warning) — POS with no claim.
- `orphan_claim` (error) — Claim with no POS.
- `quantity_mismatch` (error) — Total claim qty for a POS row outside
  tolerance; `amountImpact` = (Δqty × resalePrice).
- `price_mismatch` (error) — **S&D only.** POS resalePrice vs
  authorizedPrice outside threshold. PP doesn't fire this — no
  POS-side "expected new price" to compare against; that's semantics
  we'd need a separate price sheet for.
- `date_out_of_window` (warning) — Claim period vs POS shipDate
  outside soft window but within hard.
- `duplicate_claim` (warning) — Multiple claims tied to one POS row.

**UI**

- `components/ingest/ReconRunner.tsx` — mounts on `/ingest` above the
  dataset list. Hidden while both slices are empty. Shows POS + claim
  counts, "Run reconciliation" button (disabled unless both slices
  non-empty), post-run metric cards (matched / flagged / missing /
  orphan) and total calculated credit. Full drill-down (per-row
  claim links, per-flag filtering, export) is P4.

### Tests (+29 new, 185/185 total across 27 files)

- `normalize.test.ts` (6): part number normalization, customer suffix
  stripping, dateDiffDays incl. NaN.
- `matcher.test.ts` (7): exact / prefix / unrelated / empty cases for
  both scorers.
- `engine.test.ts` (16): happy-path S&D + PP matches with correct
  credit math, every flag kind, tolerance boundaries, hard-window
  rejection, matcher normalization behavior end-to-end, determinism
  across input orderings, empty inputs, config override.

### Harness state

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors, same 3 pre-existing exhaustive-deps
  warnings in parked map files.
- `npm test` — 185/185 across 27 files (was 156/24).
- `npm run build` — succeeds; route table unchanged.

### Verified vs unverified

- Unit + build: green.
- Manual browser verification: still NOT DONE (unchanged from bridge
  UI batch). Now the whole ingest → map → reconcile chain is invokable
  from `/ingest`, so a single browser session can exercise P1 through
  P3.

### What unlocks next

- **P4 — recon dashboard.** Results table, filter by status/flag,
  drill-down from a POS row to matched claims and vice versa, CSV/XLSX
  export. Under-10-minute unaided time-to-first-value target.
- **Real partner fixtures.** The plan's cross-cutting rule says test
  against anonymized real data. Do this when a discovery conversation
  surfaces a real POS + claims file pair.
- **AgentMatcher.** Slot a Claude Agent SDK-backed `Matcher` in when
  we can wire API keys and pick a matching prompt.

---

## 2026-07-09 — WaferIQ P4: reconciliation dashboard

Plan's P4 done-when: "a new user reaches a useful, exportable result
on their own data, unaided, in under 10 minutes." The dashboard
surface, drill-down, filters, and export are in place; the empirical
under-10-minutes bar itself is next-batch verification.

### Scope calls (not user-confirmed, defensible from plan)

1. New top-level `/recon` route, same three-layer pattern as `/ingest`
   (page.tsx server → ReconClient.tsx client wrapper → ReconApp.tsx
   Zustand-using dashboard w/ `dynamic({ ssr: false })`).
2. `/ingest` stays the intake surface; `ReconRunner` there shrinks to
   a small nudge that links into `/recon`. Full metric cards + drill-
   down live on `/recon` only, so users have one place to look at
   results.
3. Minimal top nav in `RootLayout` (`components/AppNav.tsx`, `WaferIQ`
   brand + `Ingest` + `Recon` links). Hidden on `/login`. This closes
   the "no shared nav" item that had been on the punch list since P0.
4. One "chart" — an inline-SVG horizontal stacked bar of status
   distribution. No d3 library needed for a single-bar layout; the
   plan asked for D3 / no chart library, and inline SVG honors the
   spirit without ceremony.
5. Filters (status checkboxes + flag-kind checkboxes + free-text
   search over POS partNumber/customer/distributor) run client-side
   over the store's `reconResults`. Trivial for realistic dataset
   sizes; virtualization is P5 concern.
6. Drill-down is inline row expand, not modal — keeps the "under 10
   minutes" flow snappy.
7. Export uses SheetJS. One flat row per `ReconciliationResult` (POS
   fields + claim ID list + flag list + credit) so the file opens
   cleanly in Excel; per-claim breakdown is via app drill-down. Both
   CSV and XLSX; XLSX is default for round-trippability.
8. Export scope = **currently-filtered results**, not always all
   results. Filter, then export. Discoverable via the button being
   right next to the filters.

### What landed

**Pure logic (`lib/`)**

- `reconView.ts` — `filterResults`, `summarize`, `indexById`,
  `resolveResult`, `ReconFilters` type, plus `STATUS_LABEL` and
  `FLAG_LABEL` maps. Kept out of React so filter + summary math are
  testable in isolation.
- `reconExport.ts` — `reconResultsToRows` (flattens Result + POS +
  linked claims into `ExportRow`), `rowsToWorkbook` (SheetJS
  workbook w/ `Reconciliation` sheet), `downloadWorkbook` (browser
  Blob + <a download>).

**UI (`components/recon/` + `app/recon/`)**

- `SummaryHeader` — 4 metric cards (matched/flagged/missing/orphan),
  total calculated credit, "at-risk" = sum of |amountImpact|,
  last-run timestamp.
- `StatusBar` — inline-SVG horizontal stacked bar, native `<title>`
  tooltips per segment.
- `FiltersBar` — search input, status chips, flag-kind chips, reset.
- `ResultsTable` + `ResultRow` — click a row to expand.
- `ResultDetail` — two-column POS record + claim list (S&D and PP
  shapes rendered distinctly), plus flag list with severity color.
- `ExportButtons` — CSV + XLSX buttons; disabled while empty.
- `ReconApp` — orchestrates the whole page: empty-state helper when
  nothing loaded, "ready to reconcile" state when POS + claims are
  loaded but no run yet, then full dashboard once results exist.

**Nav (`components/AppNav.tsx`)**

- Sticky top bar wired into `app/layout.tsx` between `<body>` and the
  page. Active state via `usePathname`. Hidden on `/login`.

**Trim on `/ingest`**

- `ReconRunner` (P3-era) shrunk to a nudge: recon counts + last-run
  timestamp + a `Link` to `/recon`. Metric cards deleted here — they
  live on `/recon` now.

### Tests (+14 new, 199/199 total across 29 files)

- `lib/reconView.test.ts` (9): summary math incl. flag impact,
  filter by status / flag / search, AND semantics across filters,
  empty POS excludes on search, resolveResult happy path.
- `lib/reconExport.test.ts` (5): flatten shape, joined flag kinds
  and joined messages, orphan_claim falls back to claim fields,
  numeric-vs-empty on missing POS, workbook sheet name.

### Harness state

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors, same 3 pre-existing exhaustive-deps
  warnings in parked map files.
- `npm test` — 199/199 across 29 files (was 185/27).
- `npm run build` — succeeds. `/recon` in the route table, static
  prerender.

### Verified vs unverified

- Unit + build: green.
- Manual browser verification: NOT DONE. This is the empirical
  "under 10 minutes, unaided" bar the plan set for P4. Now the whole
  chain is coherent enough to actually time it.

### What unlocks next

- **P5 — design-partner hardening.** Robust to malformed / large /
  multi-period / multi-distributor inputs, local persistence so
  datasets and results survive refresh, self-serve onboarding, usage
  instrumentation for the retention thesis, pricing-gating hooks
  (seams, not enforcement).
- **Partner-real data.** Still deferred. First discovery conversation
  that yields real files is the natural moment.
- **AgentMatcher.** Still deferred until API keys + prompt.

### Follow-ups from earlier phases still open

- ESLint module boundaries (unchanged).
- Shared libs pruning (unchanged; accounts still imports them).
- Local persistence — the impact grew this batch. Datasets, entities,
  AND recon results all die on refresh now. Bumping this into P5
  proper.

---

## 2026-07-09 — WaferIQ P5: design-partner hardening infrastructure

Plan's P5 outcome-done-when — "1–2 partners use it weekly on live data
and you can measure whether they return" — isn't ship-able as code.
What is ship-able is the infrastructure that makes that outcome
possible: persistence so a weekly return isn't punished, usage
counters so return is measurable, self-serve so a partner can walk
the flow unassisted, robustness polish so the first hiccup doesn't
break trust. All of that landed. The partner conversation itself is
tracked in next-steps.md.

### Scope calls (not user-confirmed, defensible from plan)

1. **Persistence via zustand's `persist` middleware** wrapping a
   size-guarded storage adapter, not a bespoke `exportState`/
   `importState` API. The middleware handles rehydration, versioning,
   and partial state selection; the adapter adds the guardrails.
2. **Size-guarded storage adapter** with a soft byte-cap (default
   4 MB) and QuotaExceededError catch. On either trigger, the store
   silently falls back to in-memory writes for the rest of the
   session; the UI surfaces a small "storage disabled" banner via a
   subscribable status. Backing store injectable for tests.
3. **Usage as a persisted store slice**, not a separate lib +
   localStorage wrapper. Composes with existing slice pattern; means
   `HealthPanel` uses the same `useWaferiqStore` hook everything else
   does.
4. **`HealthPanel` visible on `/recon`**, not gated behind a debug
   toggle. The retention-thesis metric ("return rate = visit-days /
   span-days") is the whole point of P5 — hiding it defeats measurement.
5. **Pricing-gate seam is `checkGate` + `useGate` today**, both
   returning true. `ExportButtons` is the reference consumer so future
   tier work has a real example. Not enforcing anything now; the plan
   says "make the seam exist."
6. **Sample data as three static CSVs in `public/sample/`.** Fetched
   via `parseArrayBuffer` (browser can't build a proper `File` from
   `fetch`, but our test-driven refactor of the parser already exposed
   both entry points). Small (8 POS rows, 6 S&D, 2 PP) but shaped like
   real distributor exports so the suggester heuristics have something
   to bite.
7. **Robustness polish is narrow**: file-size warning at >10 MB (not
   an error — big files are legitimate), better ParseError UI, storage
   banner. Explicitly *not* virtualizing the mapping/results tables;
   punt on that until it hurts.

### What landed

**Persistence (`store/`)**

- `persistedStorage.ts` — `createGuardedStorage({ softCapBytes,
  backing? })`. Injectable backing for tests. Emits status via
  `getStorageState()` + `subscribeStorageState()`. Statuses:
  `ok` | `disabled_quota` | `disabled_unavailable`.
- `waferiqStore.ts` — recomposed with `persist(...)` middleware,
  `partialize` selects only `PERSISTED_KEYS` (skips ephemeral
  `staged` from datasetsSlice), `version: 1`, migration switch stubbed
  for future schema bumps.

**Usage (`store/slices/usageSlice.ts`)**

- `firstSeenAt`, `lastSeenAt`, `visitDays[]` (unique ISO local-day
  strings, sorted), `reconRuns`, `exportsCsv`, `exportsXlsx`,
  `datasetImports`.
- Actions: `recordVisit()`, `recordReconRun()`, `recordExport(fmt)`,
  `recordDatasetImport()`, `resetUsage()`.
- Wire points: `recordVisit` on IngestApp + ReconApp mount,
  `recordReconRun` on ReconApp run, `recordExport` in ExportButtons,
  `recordDatasetImport` in IngestApp commit + sample loader.

**Gates (`lib/waferiqGates.ts`)**

- `checkGate(feature)` (pure), `useGate(feature)` (memoized hook),
  `assertGate(feature)` (throws when blocked).
- Renamed from an earlier draft that used `useGate` throughout — React
  rules-of-hooks lint (Next 16) demanded hook-shaped consumers, so
  the pure form is `checkGate` and the hook is a `useMemo` wrapper.
- Reference consumer: `ExportButtons`, which renders a 🔒 affordance
  when a gate blocks (still unlocked visually today).

**UI**

- `components/HealthPanel.tsx` — usage stats grid + storage status
  line, mounted at bottom of `/recon`.
- `components/ingest/OnboardingCard.tsx` — 5-step intro + "Load sample
  data" button, visible only when `datasets.length === 0`.
- `app/ingest/IngestApp.tsx` — storage-status banner, sample-data
  loader (fetches three CSVs, drives through the normal build path),
  large-file warning (>10 MB soft threshold), clearer parse-error UI.
- `app/recon/ReconApp.tsx` — records visit + run, mounts `HealthPanel`.

**Sample data (`public/sample/`)**

- `pos.csv` (8 rows across 2 distributors, 4 parts, 6 customers).
- `sd_claims.csv` (6 rows; one intentional orphan — "Ghost Trading" —
  to demo an orphan_claim; one intentional qty mismatch on Avnet/DEF-4567
  to demo a quantity_mismatch).
- `pp_claims.csv` (2 rows tied to the two POS rows with matching
  distributors/customers).

### Tests (+14 new, 216/216 total across 32 files)

- `store/persistedStorage.test.ts` (5): backing read/write, quota-error
  fallback, byte-cap enforcement, subscriber notification, null-backing
  fallback.
- `store/slices/usageSlice.test.ts` (7): initial zeros, `firstSeenAt`
  set-once, day-uniqueness in `visitDays`, monotonic counters, per-format
  export bump, dataset-import bump, `resetUsage` clears everything.
- `lib/waferiqGates.test.ts` (2 describe blocks, 5 tests): every gate
  currently allowed for both `checkGate` and `assertGate`.

### Harness state

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors (fixed a `react-hooks/rules-of-hooks`
  error mid-batch by splitting `checkGate`/`useGate`). Same 3
  pre-existing exhaustive-deps warnings in parked map files.
- `npm test` — 216/216 across 32 files (was 199/29).
- `npm run build` — succeeds. Route table unchanged.

### Verified vs unverified

- Unit + build: green.
- Manual browser verification: still NOT DONE. Now especially worth
  doing since persistence changes the failure mode — instead of "recon
  died on refresh," a bug in persist would look like "state didn't
  come back correctly." Should verify with sample data first.

### Explicitly deferred from P5

- **Real auth.** No backend. Local-persistence covers durability for a
  single-user browser. Multi-user / workspace is separate.
- **Server-side analytics beacon.** Same — needs backend. Local
  counters are user-visible for their own retention self-check.
- **Real pricing tiers.** `checkGate` returns true; a future
  workspace-scoped entitlement fetch hooks in when there's a backend.
- **Large-file virtualization.** Nobody's hit the wall yet; deferring.

### Follow-ups from earlier phases

- ESLint module boundaries at empty `components/territory/**` globs
  still stand. Not touched.
- Shared-lib pruning still stands; accounts route still imports.
- P4 empirical done-when (under 10 minutes on real data, unaided) is
  now the primary user-facing next step.

---

## 2026-07-09 — In-context instructions across /ingest and /recon

User pushback: too much guessing about what's required. This batch adds
proper self-serve copy so a partner can walk both pages without a
handhold. No new features, no engine changes.

### What landed

**Glossary (`lib/waferiqGlossary.ts`)**

Central definitions consumed by both pages so wording stays consistent:

- `POS_FIELDS`, `SD_FIELDS`, `PP_FIELDS` — per-field { required, hint }
  for every entity kind. Hints explain the field in a partner's terms
  (e.g. "distributor's allowed selling price under the debit
  authorization. Credit per unit = cost − authorized.").
- `ENTITY_KIND_HEADLINE` — one-sentence description of what each entity
  kind is.
- `STATUS_DEFINITION` — plain-English meaning of matched / flagged /
  missing_claim / orphan_claim.
- `FLAG_DEFINITION` — plain-English meaning of each of the six flag
  kinds.

**Ingest UI copy**

- New page header explains the full workflow (upload → map →
  reconcile) with a link into `/recon`.
- Collapsed `<details>` block: "What files should I upload?" describing
  POS report, S&D claims, PP claims.
- Review-stage callout above the parsed-column table explaining what
  the user is doing on that screen (raw dataset review, not the
  WaferIQ-specific mapping yet).
- Section header on "Saved datasets" explains what mapping does.
- `EntityMappingPanel` shows the kind-specific headline at the top and
  a per-field hint under every dropdown. Required fields marked with
  a rose `*`. Field labels stay monospace so mapping schemas remain
  scannable, but the hint text underneath is prose.

**Recon UI copy**

- Expanded page header explains what reconciliation does in one
  paragraph — the four possible statuses in one sentence each.
- Two new expandable panels laid out side-by-side after the status
  distribution bar:
  - `StatusLegend` — "How to read the results" with the four status
    tokens colored the same as in the table + their definitions.
  - `FlagGlossary` — the six flag kinds with definitions.
- "Showing N of M" line above the results now also hints that rows
  are clickable for drill-down.
- Export note clarified: export is scoped to currently-filtered
  results, not all of them.

### Harness state

- `npx tsc --noEmit` clean.
- `npm run lint` — 0 errors (fixed a dangling `ClaimType` unused-import
  after switching EntityMappingPanel to use the glossary). Same 3
  pre-existing warnings in parked map files.
- `npm test` — 216/216 across 32 files (unchanged; this batch adds
  copy, no logic).
- `npm run build` — succeeds. Route table unchanged.

### What unlocks next

Still the P4/P5 empirical bar (partner-real data + under-10-minutes
unaided) and the actual partner conversation. Nothing else changes.
