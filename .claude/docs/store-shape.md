# Zustand store shape — pre-P2 audit

Written 2026-07-06 as part of WaferIQ P0. Snapshot of what lives in
`store/` on the pivot branch so P2 can reshape confidently. Point-in-time —
verify before load-bearing decisions.

## Anatomy

- `store/territoryStore.ts` — single `create<TerritoryStore>()` instance,
  composed by spreading 15 slice creators. Name is a v-territory-era
  artifact; will be renamed under P2.
- `store/types.ts` — intersects the 15 slice interfaces + a `RootActions`
  interface (`exportState`, `importState`) into `TerritoryStore`.
- `store/selectors.ts` — Core-owned aggregation selectors (any module may
  import).
- `store/slices/*` — one slice + one selectors file per domain concept.
  Persistence keys are exported as `<name>PersistKeys` from each slice and
  aggregated in the root store as `PERSIST_KEYS`. `export/importState` walk
  those keys to round-trip the store as JSON (there is no third-party
  persist middleware; the store uses plain `create`, not `create` +
  `persist`).

## The 15 slices, grouped by fate under WaferIQ

### Territory-flavored — candidate for delete or rename in P2

Directly model the territory-planning domain. Once the wedge is locked and
the territory route stays parked, these are dead weight for WaferIQ.

- `mapUiSlice` — camera state (zoom, pan, drill-down country). Territory-map only.
- `regionsSlice`, `subregionsSlice` — the sales-region tree.
- `assignmentsSlice` — geo-node → region assignments.
- `geoSlice`, `geoSelectionSlice` — geographic node data + the sidebar selection.
- `hierarchyLevelsSlice` — the tree levels UI concept.

### Generic CRM primitives — reshape or replace in P2

Not territory-specific but shaped for the prior CRM roadmap. Under WaferIQ
these either get repurposed toward the wedge's entities or superseded.

- `accountsSlice` — customer/account records, computed fields, categorical
  options. Largest slice by far; the closest thing to a canonical "row"
  today. Under POS-recon this may morph into POS records + claims; under
  design-win funnel it may morph into design-win records.
- `contactsSlice`, `activitiesSlice`, `tasksSlice` — CRM-shaped social
  layer. Not obviously load-bearing for either wedge.
- `pipelineStagesSlice` — funnel stages. **Directly reusable** for a
  design-win funnel wedge; delete under POS-recon.
- `teamsSlice`, `membersSlice` — identity / org. `membersSlice` is Core per
  the eslint boundary comment (see eslint.config.mjs). Likely to survive.

### UI ephemera — keep

- `selectionSlice` — generic multi-select scaffolding, wedge-agnostic. Keep.

## Persistence

- All slices except `selectionSlice` and `geoSelectionSlice` export
  `persistKeys`. Territory + CRM state serializes; UI selection state does
  not (correct — ephemeral).
- No middleware persistence — `exportState()` / `importState(json)` are the
  only round-trip. If P5 wants weekly-use durability, this is where to add
  it (localStorage / IndexedDB / Directus).

## Module boundaries (eslint.config.mjs)

Direct imports of slice internals are restricted by module:

- Territory internals: `geoSlice`, `geoSelectionSlice`, `regionsSlice`,
  `subregionsSlice`, `assignmentsSlice`, `teamsSlice`,
  `hierarchyLevelsSlice`, `mapUiSlice`.
- Tasks internals: `tasksSlice`, `tasksSelectors`.
- Core (`components/accounts/*`, `app/accounts/*`) may not import either.
- `membersSlice` is Core, not Territory, per the comment in the config.

The composed store (`@/store/territoryStore`) and Core selectors
(`@/store/selectors`) are unrestricted.

## What P2 needs to decide

1. Rename `territoryStore` → wedge-appropriate name (mechanical).
2. Delete territory-flavored slices if the flag is never flipped on again,
   or leave them in place indefinitely (they only cost bundle if imported —
   the store composes them all, so today they ship on every page).
3. Prune the CRM primitives that don't map to the wedge's entities. The
   `PERSIST_KEYS` union is the load-bearing thing to update carefully so
   `importState` doesn't silently drop fields.
4. Reconsider whether the single-store pattern still fits. If ingestion
   introduces a large parsed-dataset shape, a separate store may be
   cleaner than another slice.
