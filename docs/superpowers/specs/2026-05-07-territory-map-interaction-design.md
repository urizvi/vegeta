# Territory rework — Sub-project 3: Map interaction & navigation

**Date:** 2026-05-07
**Predecessors:** sub-project 1 (visual polish, shipped), sub-project 2 (info density, shipped 2026-05-06)
**Status:** spec — implementation plan to follow

## Goal

Make the territory map feel tactile and modern — the kind of interaction users expect from Linear/Figma-class tools. This sub-project ships five feature areas: refined zoom/pan, multi-select, keyboard shortcuts, focus management, and cursor states. The animated drill-down transition (originally item B in the umbrella spec) is **deferred** to a future polish pass.

## Scope

### A. Zoom/pan refinements

- **Pinch-to-zoom on trackpads at all zoom levels.** Current `filterZoomEvent` gates wheel-only at zoom 1; rework so pinch gestures (browsers deliver these as wheel events with `ctrlKey: true`) pass through at any zoom.
- **Double-click on a region** zooms-into-feature: `zoom.scaleTo` with the feature centroid as focus, animated via d3-zoom's built-in transition.
- **Out of scope:** momentum/inertia on pan release, rubber-band edges, native iPad/Safari `touchstart`/`gesturestart` handling. These belong in a future "full polish" pass; partial momentum without rubber-band feels worse than none.

### C. Multi-select

- **New "select" tool mode** added to `mapUiSlice.tool` (alongside `'paint'` and `'eraser'`). Toolbar gets a third pill.
- **Click** in select mode replaces selection with the clicked region.
- **Shift-click** adds to selection.
- **Cmd/Ctrl-click** toggles a region's membership.
- **Drag** (mousedown → mousemove → mouseup) draws a lasso `<rect>` overlay; on release, region centroids inside the rect become the selection (or are added if Shift held).
- **Visual:** selected regions render with a 2px brand-color stroke and a 4% brand-color fill overlay, layered on top of choropleth fill.
- **Persistence:** selection survives tool switches (so users can select-then-paint). It clears on Esc only.
- **Hit-test fidelity:** centroid-in-rect. Trade-off accepted — a region whose centroid is off-screen but body intersects the lasso will be missed. Acceptable for ~200 country-sized regions; revisit with `turf.js` polygon-rect if drill-down regions feel sloppy.

### D. Keyboard shortcuts

Page-scoped global listener, attached at the territory page level. Ignores events when an `<input>`, `<textarea>`, or `contentEditable` element is focused.

| Key       | Action                                |
| --------- | ------------------------------------- |
| Arrow keys | Pan the map ~40px in that direction  |
| `+` / `=` | Zoom in one step                      |
| `-`       | Zoom out one step                     |
| `0`       | Reset zoom and pan to identity        |
| `Esc`     | Clear multi-select selection          |
| `?`       | Toggle the help popover               |

**Dropped from the original umbrella spec:**
- `/` to focus search — no search input exists on the territory page.
- `g` to focus Geos sidebar — defer to sub-project 4 when sidebar editing makes the focus story concrete.

### E. Focus management

- Remove `outline: none` from `<Geography>` `<path>` elements. Add `:focus-visible` ring (2px brand) so keyboard users see focus.
- **Roving tabindex** across regions: only the active region has `tabIndex={0}`; the rest get `tabIndex={-1}`. Tab/Shift-Tab move into and out of the map cluster as a single focus stop, not 200.
- Tab order within the map sorted alphabetically by region id (deterministic, not chaotic).
- **Arrow keys remain pan**, not region-to-region focus traversal. Confirmed during brainstorming; pan wins because it's the more frequent interaction.

### F. Cursor states

Computed in `WorldMapView` and `DrillDownMapView` from `mapUiSlice.tool` and current zoom:

- `grab` when zoomed in (pan available); `grabbing` while panning.
- `crosshair` when tool is `'paint'` or `'eraser'`.
- `cell` when tool is `'select'` and hovering a region.

## State & data model

### New slice: `store/slices/selectionSlice.ts`

```ts
type SelectionState = { ids: string[] }; // stored as array for redux serializability

// Actions
setSelection(ids: string[])
addToSelection(ids: string[])
toggleSelection(id: string)
clearSelection()

// Selectors (in selectionSelectors.ts, re-exported via store/selectors.ts)
selectSelectedIds: (state) => string[]
selectIsSelected: (id) => (state) => boolean
```

Region "id" = the existing geo id key on world topojson features (same key `mapUiSlice.summaryRegionId` and `resolveGeoColor` already use).

Session-only — not persisted, matching `mapUiSlice` posture.

### Extension: `store/slices/mapUiSlice.ts`

- `tool` union extended to `'paint' | 'eraser' | 'select'`.
- No other changes.
- Tool switches do **not** clear selection. Esc clears.

## Component touchpoints

**Modified:**

- `components/territory/map/WorldMapView.tsx` and `DrillDownMapView.tsx`
  - Rewrite `filterZoomEvent` to permit pinch (wheel + ctrlKey) at all zoom levels.
  - On `<path>` double-click: compute centroid via projection, call `zoom.scaleTo` with built-in transition.
  - `<Geography>` render-prop: roving `tabIndex`, `onClick`/`onKeyDown` wired to selection actions when tool is `'select'`, remove `outline: none` so focus rings show, layer selection-highlight stroke/fill on top of choropleth.
  - Lasso layer: a single `<rect>` overlay drawn during mousedown→mousemove→mouseup while tool === `'select'`. On mouseup, hit-test centroids against the rect; dispatch `setSelection` (or `addToSelection` if shift was held during drag).
  - Cursor style computed from tool + zoom + hover.

- `components/territory/Toolbar.tsx`
  - Third tool pill: "Select".
  - "?" button next to the tool cluster, toggling `MapHelpPopover`.

- `app/territory/page.tsx` (or `TerritoryApp` host)
  - `useEffect` global key listener attaching the shortcuts in section D. Cleaned up on unmount; ignores events while focus is in an input/textarea/contentEditable.

- `store/slices/mapUiSlice.ts`, `store/selectors.ts`
  - Type extension and selector re-exports.

**New:**

- `store/slices/selectionSlice.ts`, `store/slices/selectionSelectors.ts`.
- `components/territory/map/MapHelpPopover.tsx` — small dismissible popover listing the shortcuts. Closes on Esc or outside-click.

**Deliberately NOT touched:** `AccountLayer`, `MapLabels`, `MapLegend`, `MapInfoRail`, `RegionSummaryPanel`, `ChoroplethScale`. Selection lives on the geography layer only. A future enhancement could surface "N regions selected" in `RegionSummaryPanel`, but that's follow-up.

## Risks & assumptions

1. **Desktop trackpad pinch only.** No native iPad/Safari `touchstart`/`gesturestart` plumbing. Touch device support is a future iteration.
2. **Centroid-in-rect lasso hit-test.** Acceptable for world-map and drill-down feature sizes today; if it feels sloppy on small regions, swap to `turf.js` polygon-rect intersection.
3. **Tab/arrow split.** Tab moves keyboard focus between regions (roving tabindex); arrows pan. The umbrella spec was ambiguous here — this is the resolution.
4. **No new dependencies.** All work uses existing `d3-zoom`, `react-simple-maps`, and `react-redux`. If lasso hit-test is upgraded to polygon-rect later, that introduces `turf.js`.

## Out of scope (deferred)

- Animated drill-down ↔ world-view transition (item B in umbrella spec).
- Momentum/inertia on pan, rubber-band edges, tuned wheel sensitivity (would be a "full polish" pass per the umbrella).
- Native touch gestures.
- Selection surfacing in `RegionSummaryPanel`.
- Quick-toggle keyboard shortcuts for tools (P/E/V) unless trivially cheap.
- `/` to focus search and `g` to focus Geos sidebar.

## Verification

- `tsc --noEmit` and `eslint` clean.
- `npm run build` succeeds.
- Manual UI smoke: pinch-zoom on trackpad, dbl-click-zoom into a country, all multi-select gestures (click / shift-click / cmd-click / lasso), every keyboard shortcut, Tab into map and observe focus ring, every cursor transition.
