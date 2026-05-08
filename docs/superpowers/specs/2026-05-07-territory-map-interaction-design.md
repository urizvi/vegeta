# Territory rework — Sub-project 3: Map interaction & navigation

**Date:** 2026-05-07
**Predecessors:** sub-project 1 (visual polish, shipped), sub-project 2 (info density, shipped 2026-05-06)
**Status:** spec — implementation plan to follow

## Goal

Make the territory map feel tactile and modern — the kind of interaction users expect from Linear/Figma-class tools. This sub-project ships five feature areas: refined zoom/pan, multi-select, keyboard shortcuts, focus management, and cursor states. The animated drill-down transition (originally item B in the umbrella spec) is **deferred** to a future polish pass.

## Existing architecture (must conform to)

- State is **Zustand** (`store/territoryStore.ts`) composed of `StateCreator` slices in `store/slices/`. There is no Redux.
- "Paint mode" is `geoSlice.activePaintId: string | null` (a Geo id). "Eraser mode" is `geoSlice.eraserActive: boolean`. They are mutually exclusive — setting one clears the other in the slice setters.
- Component layer reads via hooks: `useActivePaintGeo()`, `useActiveEraser()`, and writes via `useActions()` returning `setActivePaintGeo` / `setActiveEraser`.
- `Toolbar.tsx` already owns a `window.keydown` listener that handles `Esc` (clears paint/eraser) and `cmd+z` / `cmd+shift+z` (geo undo/redo). Editable-target guard already exists. New shortcuts extend this listener; we do **not** add a separate page-level listener.
- The hovered/clicked region key is `mapUiSlice.selectedEntityCode` / `hoveredEntityCode` — an "entity code" string (e.g. `'US'`, `'US-CA'`). New multi-select set uses the same key shape.

## Scope

### A. Zoom/pan refinements

- **Pinch-to-zoom on trackpads at all zoom levels.** Current `filterZoomEvent` in `WorldMapView` and `DrillDownMapView` gates wheel-only at zoom 1; rework so pinch gestures (browsers deliver these as wheel events with `ctrlKey: true`) pass through at any zoom.
- **Double-click on a region** zooms-into-feature: compute centroid via projection, call `zoom.scaleTo` with d3-zoom's built-in transition.
- **Out of scope:** momentum/inertia on pan release, rubber-band edges, native iPad/Safari `touchstart`/`gesturestart` handling. These belong in a future "full polish" pass; partial momentum without rubber-band feels worse than none.

### C. Multi-select

- **New select mode** added as `selectActive: boolean` on `geoSlice`, mutually exclusive with `activePaintId` and `eraserActive` (setters clear the other two when set true). Toolbar gets a third pill alongside the existing paint/eraser affordances.
- **Click** in select mode replaces the multi-selection with the clicked region.
- **Shift-click** adds to the multi-selection.
- **Cmd/Ctrl-click** toggles a region's membership.
- **Drag** (mousedown → mousemove → mouseup) draws a lasso `<rect>` overlay; on release, region centroids inside the rect become the selection (or are added if Shift was held during drag).
- **Visual:** selected regions render with a 2px brand-color stroke and a 4% brand-color fill overlay, layered on top of choropleth fill.
- **Persistence:** the multi-selection survives mode switches (so users can select-then-paint). It clears on `Esc`.
- **Hit-test fidelity:** centroid-in-rect. Trade-off accepted — a region whose centroid is off-screen but body intersects the lasso will be missed. Acceptable for ~200 country-sized regions; revisit with `turf.js` polygon-rect if drill-down regions feel sloppy.

### D. Keyboard shortcuts

Added inside the existing `Toolbar.tsx` keydown listener (which already has the editable-target guard). Listener cleanup is already handled.

| Key       | Action                                                              |
| --------- | ------------------------------------------------------------------- |
| Arrow keys | Pan the map ~40px in that direction (call into d3-zoom translateBy) |
| `+` / `=` | Zoom in one step                                                    |
| `-`       | Zoom out one step                                                   |
| `0`       | Reset zoom and pan to identity                                      |
| `Esc`     | Cascade: close help popover → clear multi-selection → clear paint/eraser |
| `?`       | Toggle the help popover                                             |

The map view exposes its `zoomRef` (a ref to the d3-zoom behavior + svg selection) via a small store field or a ref-context so the Toolbar listener can drive zoom. Decision: lightweight zustand field `mapUiSlice.mapZoomCommand` carrying a discriminated union (`{ kind: 'panBy', dx, dy }` | `{ kind: 'zoomBy', factor }` | `{ kind: 'reset' }`) plus a counter, consumed by an effect inside the active map view. Avoids prop-drilling refs across views.

**Dropped from the original umbrella spec:**
- `/` to focus search — no search input exists on the territory page.
- `g` to focus Geos sidebar — defer to sub-project 4 when sidebar editing makes the focus story concrete.

### E. Focus management

- Remove `outline: none` from `<Geography>` `<path>` elements. Add a `:focus-visible` ring (2px brand) so keyboard users see focus.
- **Roving tabindex** across regions: only the active region has `tabIndex={0}`; the rest get `tabIndex={-1}`. Tab/Shift-Tab move into and out of the map cluster as a single focus stop, not 200.
- Tab order within the map sorted alphabetically by entity code (deterministic, not chaotic).
- **Arrow keys remain pan**, not region-to-region focus traversal.

### F. Cursor states

Computed in `WorldMapView` and `DrillDownMapView` from `useActivePaintGeo()` / `useActiveEraser()` / `useActiveSelect()` plus current zoom:

- `grab` when zoomed in and no tool active (pan available); `grabbing` while panning.
- `crosshair` when paint or eraser is active.
- `cell` when select is active and hovering a region.

The existing `cursor` ternary at `WorldMapView:136` and `DrillDownMapView:210` extends to a small helper.

## State & data model

### New slice: `store/slices/selectionSlice.ts`

Zustand `StateCreator` slice, mirroring sibling-slice conventions. Holds the multi-selection set of entity codes only — the **mode flag** lives on `geoSlice` (next section).

```ts
export interface SelectionSlice {
  selectedEntityCodes: string[]; // multi-select set; '' is never a member

  setSelection: (codes: string[]) => void;
  addToSelection: (codes: string[]) => void;
  toggleSelection: (code: string) => void;
  clearSelection: () => void;
}
```

`selectionSlice.ts` is wired into `territoryStore.ts` alongside the existing slices. No persist keys (session-only, matching `mapUiSlice` posture for hover/select state).

Companion file `store/slices/selectionSelectors.ts` exposes hooks following project pattern:

```ts
export const useSelectedEntityCodes = () =>
  useTerritoryStore((s) => s.selectedEntityCodes);
export const useIsEntitySelected = (code: string) =>
  useTerritoryStore((s) => s.selectedEntityCodes.includes(code));
```

`useActions()` in `store/selectors.ts` is extended to expose `setSelection`, `addToSelection`, `toggleSelection`, `clearSelection`, `setActiveSelect`.

### Extension: `store/slices/geoSlice.ts`

- Add `selectActive: boolean` field (defaults to `false`).
- Add `setActiveSelect(active: boolean)` setter. When set `true`, clear `activePaintId` and `eraserActive` (mirror existing `setActiveEraser` mutual-exclusion logic).
- Update `setActivePaintGeo` and `setActiveEraser` to clear `selectActive` when activating (extends existing mutual-exclusion).
- Companion hook `useActiveSelect()` added to `geoSelectors.ts` mirroring `useActiveEraser()`.

### Extension: `store/slices/mapUiSlice.ts`

- Add `mapZoomCommand: ZoomCommand | null` and `setMapZoomCommand(cmd: ZoomCommand): void` for the keyboard-driven zoom/pan. The active map view consumes the latest command in a `useEffect` and clears it via the same setter.

```ts
type ZoomCommand =
  | { kind: 'panBy'; dx: number; dy: number; nonce: number }
  | { kind: 'zoomBy'; factor: number; nonce: number }
  | { kind: 'reset'; nonce: number };
```

`nonce` (a counter incremented on dispatch) ensures repeated identical commands re-fire the consumer effect.

## Component touchpoints

**Modified:**

- `components/territory/map/WorldMapView.tsx` and `components/territory/map/DrillDownMapView.tsx`
  - Rewrite `filterZoomEvent` to permit pinch (wheel + ctrlKey) at all zoom levels.
  - On `<Geography>` double-click: compute centroid via the existing projection, call `zoom.scaleTo` with built-in transition.
  - `<Geography>` render-prop: compute selection-aware stroke/fill (2px brand stroke + 4% brand fill overlay when in `selectedEntityCodes`), roving `tabIndex`, remove inline `outline: none` so `:focus-visible` ring shows, click handler routes to selection actions when select mode is active (replacing the existing paint/eraser branch when select is on).
  - Lasso layer: a single `<rect>` overlay rendered while `selectActive && dragging`. On `mousedown` over the SVG (not a region), capture start point; on `mousemove`, update rect; on `mouseup`, hit-test region centroids against the rect and call `setSelection` (or `addToSelection` if shift held during drag).
  - Cursor style computed via the new helper.
  - `useEffect` consuming `mapZoomCommand` from `mapUiSlice` and applying it via the local d3-zoom behavior ref. Clears the command via setter after consumption (preserves nonce semantics).

- `components/territory/toolbar/Toolbar.tsx`
  - Third tool pill: "Select" — same visual idiom as paint/eraser pills.
  - "?" button toggling `MapHelpPopover`.
  - Existing keydown listener (lines ~57-81) extended:
    - `Esc` cascade: if popover open → close popover; else if multi-selection non-empty → clear it; else if paint/eraser active → existing behavior.
    - Arrows / `+` / `-` / `0` → dispatch `setMapZoomCommand` with the appropriate kind (skip if editable target focused, as with existing keys).
    - `?` → toggle popover state (local component state, lifted only if needed).

- `store/slices/geoSlice.ts`
  - `selectActive` field, `setActiveSelect`, mutual-exclusion patches in existing setters.

- `store/slices/mapUiSlice.ts`
  - `mapZoomCommand` field + `setMapZoomCommand` action.

- `store/selectors.ts` and `store/slices/geoSelectors.ts`
  - Re-exports for new selection hooks, `useActiveSelect`, `setActiveSelect`, and zoom-command setter.

- `store/territoryStore.ts`
  - Compose `selectionSlice` into the store.

**New:**

- `store/slices/selectionSlice.ts`, `store/slices/selectionSelectors.ts`.
- `components/territory/map/MapHelpPopover.tsx` — small dismissible popover listing the shortcuts. Closes on `Esc` or outside-click. Toolbar owns the open state.

**Deliberately NOT touched:** `AccountLayer`, `MapLabels`, `MapLegend`, `MapInfoRail`, `RegionSummaryPanel`, `ChoroplethScale`. Selection lives on the geography layer only. A future enhancement could surface "N regions selected" in `RegionSummaryPanel`, but that's follow-up.

## Risks & assumptions

1. **Desktop trackpad pinch only.** No native iPad/Safari `touchstart`/`gesturestart` plumbing. Touch device support is a future iteration.
2. **Centroid-in-rect lasso hit-test.** Acceptable for world-map and drill-down feature sizes today; if it feels sloppy on small regions, swap to `turf.js` polygon-rect intersection.
3. **Tab/arrow split.** Tab moves keyboard focus between regions (roving tabindex); arrows pan. Resolved during brainstorming.
4. **Mutual exclusion of paint/eraser/select.** All three modes are now mutually exclusive at the slice level; activating any one clears the other two. Component reads remain via the existing per-mode hooks. The multi-selection *set* is independent and persists across mode switches; only `Esc` clears it.
5. **No new dependencies.** All work uses existing `d3-zoom`, `react-simple-maps`, and `zustand`. If lasso hit-test is upgraded to polygon-rect later, that introduces `turf.js`.
6. **`mapZoomCommand` indirection.** Keyboard-driven zoom/pan goes through a store field rather than a shared ref, avoiding prop-drilling and decoupling Toolbar from whichever map view is mounted. The dispatcher and consumer both live inside the territory page tree, so the indirection cost is a single effect per view.

## Out of scope (deferred)

- Animated drill-down ↔ world-view transition (item B in umbrella spec).
- Momentum/inertia on pan, rubber-band edges, tuned wheel sensitivity (would be a "full polish" pass per the umbrella).
- Native touch gestures.
- Selection surfacing in `RegionSummaryPanel`.
- Quick-toggle keyboard shortcuts for tools (P/E/V).
- `/` to focus search and `g` to focus Geos sidebar.

## Verification

- `tsc --noEmit` and `eslint` clean.
- `npm run build` succeeds.
- Manual UI smoke: pinch-zoom on trackpad, dbl-click-zoom into a country, all multi-select gestures (click / shift-click / cmd-click / lasso), every keyboard shortcut, Tab into map and observe focus ring, every cursor transition, mode mutual-exclusion (activating select clears paint/eraser and vice versa), Esc cascade (popover → selection → paint/eraser).
