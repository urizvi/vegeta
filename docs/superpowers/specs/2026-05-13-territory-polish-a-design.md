# Territory Polish-A — selection chip + `/` and `g` shortcuts

Date: 2026-05-13
Status: design

## Background

Sub-projects 3 and 4 (map interaction, sidebar editing) shipped with an
explicit deferred-polish backlog. This spec is the first of four
follow-up polish passes:

- **Polish-A (this spec)** — surface selection count on the map; add `/`
  and `g` keyboard shortcuts.
- Polish-B — SP4 multi-select (shift/cmd-click range, bulk drag, bulk
  delete).
- Polish-C — undo/redo across sidebar mutations + animated tree
  open/close.
- Polish-D — SP3 motion (animated world↔drill-down transition, pan
  momentum + rubber-band edges).

Polish-A is intentionally the smallest: it de-risks the Toolbar keymap
before Polish-B adds bulk-select hotkeys, and surfaces selection state
that today is invisible whenever no region is pinned.

## Goals

1. **Selection visibility**: when `selectionCount > 0`, the user can see
   how many regions are selected and inspect which ones from anywhere
   on the map view (no requirement to pin a region first).
2. **Faster keyboard access**: `/` jumps focus to the Geos sidebar
   search; `g` jumps focus into the Geos sidebar tree. Both are gated
   by the existing editable-target check so they don't fire while
   typing.
3. **Discoverability**: `MapHelpPopover` documents both keys.

Non-goals: changing selection semantics, changing the chip popover
visual system, adding a global `/`-search across the app (territory
page only).

## Design

### 1. `SelectionChip` in `MapChipsDock`

The 2026-05-12 MapInfoRail rework moved map chrome into
`components/territory/map/MapChipsDock.tsx`. `RegionSummaryPanel` only
renders inside `PinnedRegionCard`, which mounts only when a region is
pinned — so surfacing selection count there is invisible in the common
case (selection without pin). Use the chip dock instead.

Add a new chip:

- Component: `components/territory/map/SelectionChip.tsx`.
- Subscribes to `useSelectedEntityCodes()` and `useSelectionCount()`
  from `store/slices/selectionSelectors`.
- Rendered inside `MapChipsDock` after the existing chips. Returns
  `null` when `count === 0` so the chip only appears with active
  selection.
- Pill label: `"{count} selected"` (e.g. `"3 selected"`). Reuses the
  existing `MapChip` component's `active` styling tokens — no new
  visual tokens introduced.
- Click toggles a 240 px popover anchored above (same idiom as the
  other chips). Popover content:
  - Header row: `"Selected regions"` + small `Clear` text button that
    calls `clearSelection()` and closes the popover.
  - Body: vertical list of selected codes, each row showing the
    resolved region name. Codes are resolved via a new lightweight
    selector `useRegionNameByIso(iso)` in `store/slices/mapUiSelectors`
    that returns just the `name` field (avoid running the full
    `useRegionRollup` per row when only the name is needed).
  - List is virtualized only if length > 50; otherwise rendered
    inline. Selection set is rarely that large for territory work — we
    accept un-virtualized rendering as the default and add a
    `max-h-[280px] overflow-y-auto` clamp on the list.
  - Each row has a small `✕` button that calls
    `toggleSelection(code)` to remove that code from the set.

### 2. `/` and `g` keyboard shortcuts

Extend the existing keydown handler in
`components/territory/toolbar/Toolbar.tsx` (the same `useEffect` that
already handles Esc, `?`, arrow / `+` / `-` / `0`, and undo/redo).

Behavior (both gated by `isEditableTarget(e.target)`):

- `/` — `e.preventDefault()`, then
  `document.getElementById('geo-sidebar-search')?.focus()`.
- `g` — `e.preventDefault()`, then focus the first row in the Geos
  sidebar tree via
  `document.querySelector<HTMLElement>('[data-geo-node-row]')?.focus()`.

No modifier guard — these are bare keys, same as `?`.

### 3. Focus targets

- `components/territory/sidebar/SidebarSearchInput.tsx`: add an
  optional `id` prop. `GeoSidebarPanel` calls it with
  `id="geo-sidebar-search"`. Default keeps it `undefined` so other
  callers (none today, but futureproof) aren't affected.
- `components/territory/sidebar/GeoNodeRow.tsx`: on the existing
  `role="button"` row `<div>`, add `data-geo-node-row` and
  `tabIndex={-1}`. `tabIndex={-1}` keeps the row out of tab order
  (Tab still hits inputs/buttons inside the sidebar as today) but
  allows imperative `focus()` from `g`. Add
  `focus-visible:ring-2 focus-visible:ring-brand/40` to the row div's
  className so the focused row is visible (same treatment as other
  focusable controls in the toolbar).

### 4. `MapHelpPopover` rows

Append two rows to the `rows` array in
`components/territory/map/MapHelpPopover.tsx`:

```ts
['/', 'Focus search'],
['g', 'Focus Geos sidebar'],
```

Order: place them next to `?` at the end (popover dialog has no scroll
today; 10 rows fits the 360 px width comfortably).

## Components and data flow

```
selectionSlice ──► useSelectionCount, useSelectedEntityCodes
                      │
                      ▼
              MapChipsDock
                      │
                      ▼
              SelectionChip ───► MapChip (existing)
                      │
                      ▼
              popover: list ◄── useRegionNameByIso(code)
                                    (new lightweight selector)

Toolbar keydown ───► / → document.getElementById('geo-sidebar-search')
                ───► g → document.querySelector('[data-geo-node-row]')
```

No new slice state; no migration of existing chip code.

## File touches

New:
- `components/territory/map/SelectionChip.tsx`

Modified:
- `components/territory/map/MapChipsDock.tsx` — mount `<SelectionChip />` after existing chips.
- `store/slices/mapUiSelectors.ts` — add `useRegionNameByIso(iso)`.
- `components/territory/toolbar/Toolbar.tsx` — add `/` and `g` cases.
- `components/territory/map/MapHelpPopover.tsx` — append two rows.
- `components/territory/sidebar/SidebarSearchInput.tsx` — `id` prop.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — pass
  `id="geo-sidebar-search"`.
- `components/territory/sidebar/GeoNodeRow.tsx` — `data-geo-node-row`,
  `tabIndex={-1}`, `focus-visible` ring.

## Edge cases

- `g` pressed when the sidebar is collapsed / no nodes exist: query
  returns `null`, `.focus()` no-ops. No error.
- `/` pressed when on a non-territory page: Toolbar isn't mounted, so
  the keydown handler isn't registered. No-op.
- Selection chip popover open while user clicks `Clear`: `clearSelection()` sets count to 0,
  `SelectionChip` returns `null`, popover unmounts. Acceptable —
  matches the existing pattern of chip self-dismiss when state goes
  empty.
- Selection contains a mix of country (`'US'`) and state
  (`'US:US-CA'`) codes: `useRegionNameByIso` resolves both. State
  codes resolve to the state's `name` (e.g. `"California"`).
- Code in selection that no longer matches any region (stale, e.g.
  data refresh removed it): `useRegionNameByIso` returns the raw code
  as fallback so the user can still see it and click `✕` to remove.

## Verification

- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `npm run build` clean.
- Manual smoke (user): select 2+ regions → chip appears with correct
  count; popover lists names; per-row `✕` removes; `Clear` empties
  set. Press `/` from map view → search input focused. Press `g` from
  map view → first geo node row focused. Both keys no-op while typing
  in any input. `MapHelpPopover` shows both new rows.
