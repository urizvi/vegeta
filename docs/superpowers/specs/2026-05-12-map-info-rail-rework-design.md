# MapInfoRail rework — split chips dock + pinned region card

**Date:** 2026-05-12
**Status:** spec
**Context:** Carryover from the territory map interaction sub-projects. The `MapInfoRail` (260px top-right floating panel) still obstructs the map even after a width reduction and a collapse chevron, and it hides the empty-state region panel. The root issue is that the rail co-locates two surfaces with different lifecycles: always-on legend/scale/badges and situational region summary.

## Goal

Replace `MapInfoRail` with two orthogonal overlays whose footprints match their job:

1. A compact **chips dock** at the bottom-left for the always-on info (legend, choropleth scale, gap/conflict pills).
2. A **pinned region card** at the top-right that only appears when the user clicks a region.

The existing `MapTooltip` (cursor-following hover preview) is unchanged and provides ambient region info before the user commits to pinning.

## Non-goals

- Hover-tracking summary card (rejected — `MapTooltip` already covers that)
- Drawer / icon rail style (rejected — heavier than warranted)
- Bottom horizontal dock with inline region summary (rejected — mixes lifecycles again)
- Drag-to-reposition the pinned card (out of scope this pass)
- New keyboard shortcut for pin-on-hovered-region (deferred)

## Architecture

Three independent overlays mounted directly by `WorldMapView` and `DrillDownMapView`:

| Overlay | Lifetime | Trigger |
|---|---|---|
| `MapChipsDock` | always mounted | always visible |
| `MapTooltip` (existing) | mounted while hovering | cursor hover |
| `PinnedRegionCard` | mounted while `pinnedEntityIso` is set | region click (no active tool) |

`MapInfoRail.tsx` is deleted.

## Components

All paths under `components/territory/map/`:

- **`MapChipsDock.tsx`** (new) — bottom-left absolute container (`absolute left-4 bottom-4 z-10`). Owns:
  - `openChip: 'legend' | 'scale' | 'gaps' | 'conflicts' | null`
  - Outside-click handler (closes open popover)
  - Esc handler hook-in (delegated through Toolbar cascade; see Interaction)
  - Renders four chip wrappers in order: Legend, Scale (if `useChoroplethScale().active`), Gaps (if `gaps.count > 0`), Conflicts (if `conflicts.count > 0`).
- **`MapChip.tsx`** (new) — presentational pill. Props: `glance: ReactNode`, `label: string`, `active: boolean`, `onClick: () => void`. Rounded-full, `bg-panel`, hairline border, hover state. No popover responsibility — that's the parent's job.
- **Inline chip wrappers** inside `MapChipsDock.tsx` (not separate files):
  - `LegendChip` — glance is a row of up to 4 team-color dots + "+N" if more. Popover renders `<MapLegend />`.
  - `ScaleChip` — glance is a 32px-wide gradient bar. Popover renders `<ChoroplethScale scale={scale} fieldDef={fieldDef} />`.
  - `GapsChip` — glance is `● {count}`. Popover renders the gap highlight button (current behavior preserved: toggles highlighted entity codes).
  - `ConflictsChip` — glance is `▲ {count}` (amber). Popover renders the conflict highlight button.
- **`PinnedRegionCard.tsx`** (new) — `absolute right-4 top-16 z-10 w-[280px]` card with `bg-panel`, hairline border, soft shadow. Header row: region label + ✕ close button. Body wraps the existing `<RegionSummaryPanel />`. Returns `null` when no region is pinned. Handles its own Esc.

Components reused without modification: `MapLegend`, `ChoroplethScale`, `RegionSummaryPanel` (body).

## State

`store/slices/mapUiSlice.ts`:

- **Rename** `focusedEntityIso` → `pinnedEntityIso` (semantic shift: pin-focused, not hover-focused). Update `useFocusedEntityIso` selector accordingly.
- **Add** `pinRegion(iso: string)` action (sets `pinnedEntityIso`).
- **Add** `unpinRegion()` action (clears `pinnedEntityIso`).
- **Remove** any setters tied to the old hover-focus semantics (verify with grep — current code may not actually use it that way).

Local component state:

- `MapChipsDock.openChip` — `useState`
- `MapInfoRail.collapsed` — gone (rail deleted)

Highlight flow (`highlightedEntityCodes`, `setHighlightedEntityCodes`, `clearHighlight`) is unchanged — moved from the rail to the gap/conflict chip popovers.

## Interaction

- **Region click → pin** (in `WorldMapView` / `DrillDownMapView` click handler): only when no tool is active (`!paintActive && !eraserActive && !selectActive`). Plain click → `pinRegion(iso)`. If clicked region is already pinned → `unpinRegion()` (toggle). If a different region is pinned → replace.
- **Selection mode**: when `selectActive`, clicks route to the existing selection flow; pinning is suppressed.
- **Chip popovers**: `absolute` element above each chip (~8px gap), left-aligned to chip; flip to right-align when the popover bbox would clip the viewport's right edge. No portals — popovers live inside the map container so the existing z-stack (tooltip on top of popover on top of map) holds.
- **Esc cascade** (`Toolbar.tsx` keydown listener — extend existing chain):
  1. help popover open → close it
  2. chip popover open → close it
  3. region pinned → unpin it
  4. selection non-empty → clear selection
  5. paint/eraser active → exit tool
- **Tooltip vs. pinned card**: both can co-exist. Tooltip follows cursor; card is anchored top-right. They never visually overlap given default sizes.
- **Cross-mode persistence**: chips and pinned card remain visible across paint/eraser/select mode switches.

## File touches

- New: `components/territory/map/MapChipsDock.tsx`, `components/territory/map/MapChip.tsx`, `components/territory/map/PinnedRegionCard.tsx`
- Modified: `components/territory/map/WorldMapView.tsx`, `components/territory/map/DrillDownMapView.tsx` (swap `<MapInfoRail/>` for `<MapChipsDock/>` + `<PinnedRegionCard/>`; add pin/unpin click branch)
- Modified: `components/territory/Toolbar.tsx` (Esc cascade extension)
- Modified: `store/slices/mapUiSlice.ts`, `store/slices/mapUiSelectors.ts` (rename + new actions)
- Modified: `hooks/useTerritoryStore.ts` (re-export new actions/selectors if barrel-exported)
- Deleted: `components/territory/map/MapInfoRail.tsx`

## Verification

- `tsc --noEmit`, `npm run lint`, `npm run build` all clean.
- Manual UI smoke (user's responsibility):
  - Pin/unpin/swap a region.
  - Esc cascade unwinds in the documented order.
  - Each chip popover opens, closes on outside-click, closes on re-click, and closes on Esc.
  - Gap/conflict highlight buttons still toggle the region ring.
  - At narrow viewport widths, the bottom chips dock doesn't collide with the toolbar; the pinned card doesn't collide with the help popover.
  - Cross-mode: pinning persists when switching between paint/eraser/select.

## Open questions

None at spec time. Implementation may surface positioning edge cases (chip popover clipping inside zoomed-in drill-down view); resolve inline.
