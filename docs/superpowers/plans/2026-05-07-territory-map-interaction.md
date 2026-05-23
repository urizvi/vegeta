# Territory Sub-project 3 — Map Interaction & Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-select tool, keyboard shortcuts, focus management, refined zoom interactions, and cursor states to the territory map in `vegeta`.

**Architecture:** State is **Zustand** (`store/territoryStore.ts` composing slices via `StateCreator`). The new "select" mode joins the existing paint/eraser modes on `geoSlice` with three-way mutual exclusion. The multi-selection set lives in a new `selectionSlice`. Keyboard shortcuts extend the existing `Toolbar.tsx` keydown listener; arrow/+/-/0 keystrokes cross to the active map view via a `mapZoomCommand` field on `mapUiSlice`. The `vegeta` repo has no test suite — verification is `npm run lint`, `npm run build`, plus manual UI smoke.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Zustand 5, react-simple-maps 3, d3-zoom (transitively). No new deps.

**Spec:** `docs/superpowers/specs/2026-05-07-territory-map-interaction-design.md`

**Existing field/setter names (verified, do not invent):**

- `geoSlice.activePaintGeoId: string | null`, `geoSlice.activeEraser: boolean`
- Setters: `setActivePaintGeo(id)`, `setActiveEraser(active)` — already mutually exclusive.
- Hooks: `useActivePaintGeoId()`, `useActivePaintGeo()`, `useActiveEraser()`.
- `useActions()` in `store/selectors.ts` returns `useTerritoryStore.getState()` — every slice setter is reachable via destructure.
- `mapUiSlice.selectedEntityCode: string | null` (singular — used for the *focused* country, NOT multi-select).
- The clicked-region key is `geo.iso2 || geo.id` (computed in `CountryGeo` at `WorldMapView.tsx:46`).

---

### Task 1: Extend `geoSlice` with `selectActive` mode

**Files:**
- Modify: `store/slices/geoSlice.ts`
- Modify: `store/slices/geoSelectors.ts`

- [ ] **Step 1: Add `selectActive` field, setter, and three-way mutual exclusion**

In `store/slices/geoSlice.ts`, add to the `GeoSlice` interface (next to `activeEraser`):

```ts
  selectActive: boolean;
```

Add the setter signature (next to `setActiveEraser`):

```ts
  setActiveSelect: (active: boolean) => void;
```

Add the initial value (next to `activeEraser: false,`):

```ts
  selectActive: false,
```

Replace the existing `setActivePaintGeo` and `setActiveEraser` and add `setActiveSelect`:

```ts
  setActivePaintGeo(id) {
    if (id) set({ activePaintGeoId: id, activeEraser: false, selectActive: false });
    else set({ activePaintGeoId: null });
  },
  setActiveEraser(active) {
    if (active) set({ activeEraser: true, activePaintGeoId: null, selectActive: false });
    else set({ activeEraser: false });
  },
  setActiveSelect(active) {
    if (active) set({ selectActive: true, activePaintGeoId: null, activeEraser: false });
    else set({ selectActive: false });
  },
```

Search the file for any other reference to `activePaintGeoId` or `activeEraser` in reducer-style updates (e.g. `activePaintGeoId: toDrop.has(...) ? null : ...` near line 220). These delete-cascade paths do not need to clear `selectActive`; selection is in a separate slice and unrelated to geo-node deletion.

- [ ] **Step 2: Add `useActiveSelect` hook**

In `store/slices/geoSelectors.ts`, add next to `useActiveEraser`:

```ts
export const useActiveSelect = () => useTerritoryStore((s) => s.selectActive);
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no new warnings).

- [ ] **Step 4: Commit**

```bash
git add store/slices/geoSlice.ts store/slices/geoSelectors.ts
git commit -m "feat(territory): add selectActive mode to geoSlice with three-way exclusion"
```

---

### Task 2: Create `selectionSlice` for the multi-selection set

**Files:**
- Create: `store/slices/selectionSlice.ts`
- Create: `store/slices/selectionSelectors.ts`
- Modify: `store/territoryStore.ts`
- Modify: `store/types.ts`

- [ ] **Step 1: Inspect existing slice composition pattern**

Read `store/territoryStore.ts` and `store/types.ts` first so the new slice integrates with the existing `TerritoryStore` type union and the store factory. Slices are typically combined via intersection in `types.ts` and spread in `territoryStore.ts`.

- [ ] **Step 2: Create `selectionSlice.ts`**

```ts
// store/slices/selectionSlice.ts
import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';

export interface SelectionSlice {
  selectedEntityCodes: string[];

  setSelection: (codes: string[]) => void;
  addToSelection: (codes: string[]) => void;
  toggleSelection: (code: string) => void;
  clearSelection: () => void;
}

export const createSelectionSlice: StateCreator<TerritoryStore, [], [], SelectionSlice> = (set) => ({
  selectedEntityCodes: [],

  setSelection: (codes) => set({ selectedEntityCodes: Array.from(new Set(codes)) }),
  addToSelection: (codes) =>
    set((s) => ({
      selectedEntityCodes: Array.from(new Set([...s.selectedEntityCodes, ...codes])),
    })),
  toggleSelection: (code) =>
    set((s) => ({
      selectedEntityCodes: s.selectedEntityCodes.includes(code)
        ? s.selectedEntityCodes.filter((c) => c !== code)
        : [...s.selectedEntityCodes, code],
    })),
  clearSelection: () => set({ selectedEntityCodes: [] }),
});
```

- [ ] **Step 3: Create `selectionSelectors.ts`**

```ts
// store/slices/selectionSelectors.ts
import { useTerritoryStore } from '../territoryStore';

export const useSelectedEntityCodes = () =>
  useTerritoryStore((s) => s.selectedEntityCodes);

export const useIsEntitySelected = (code: string) =>
  useTerritoryStore((s) => s.selectedEntityCodes.includes(code));

export const useSelectionCount = () =>
  useTerritoryStore((s) => s.selectedEntityCodes.length);
```

- [ ] **Step 4: Wire into `types.ts`**

Add `SelectionSlice` to the `TerritoryStore` intersection. Pattern matches existing slices — find the line that intersects `MapUiSlice & GeoSlice & ...` and add `& SelectionSlice`. Import at top:

```ts
import type { SelectionSlice } from './slices/selectionSlice';
```

- [ ] **Step 5: Wire into `territoryStore.ts`**

Import `createSelectionSlice` and spread it into the `create()` call alongside the other `create*Slice(...)` calls. Match the existing pattern exactly.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add store/slices/selectionSlice.ts store/slices/selectionSelectors.ts store/types.ts store/territoryStore.ts
git commit -m "feat(territory): add selectionSlice for multi-select set"
```

---

### Task 3: Add `mapZoomCommand` to `mapUiSlice`

**Files:**
- Modify: `store/slices/mapUiSlice.ts`

- [ ] **Step 1: Add the type, field, and setter**

At the top of the file (after the `import` lines), add:

```ts
export type ZoomCommand =
  | { kind: 'panBy'; dx: number; dy: number; nonce: number }
  | { kind: 'zoomBy'; factor: number; nonce: number }
  | { kind: 'reset'; nonce: number };
```

In the `MapUiSlice` interface, add:

```ts
  mapZoomCommand: ZoomCommand | null;
  setMapZoomCommand: (cmd: ZoomCommand | null) => void;
```

In the slice creator, add the initial value:

```ts
  mapZoomCommand: null,
```

And the setter:

```ts
  setMapZoomCommand: (cmd) => set({ mapZoomCommand: cmd }),
```

- [ ] **Step 2: Add hook in the same file**

At the bottom of the file (or in `mapUiSelectors.ts` if one exists — check first):

```ts
export const useMapZoomCommand = () => useTerritoryStore((s) => s.mapZoomCommand);
```

If `mapUiSelectors.ts` is the convention, put it there instead. Match pattern.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add store/slices/mapUiSlice.ts store/slices/mapUiSelectors.ts
git commit -m "feat(territory): add mapZoomCommand bridge for keyboard-driven zoom/pan"
```

---

### Task 4: Add Select tool pill to `Toolbar`

**Files:**
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Wire the new state into the component**

Near the existing `useActivePaintGeo` / `useActiveEraser` reads (~line 45-46), add:

```ts
  const selectActive  = useActiveSelect();
```

Add the import at top of file:

```ts
import { useActivePaintGeoId, useActivePaintGeo, useActiveEraser, useActiveSelect, useCanUndoGeo, useCanRedoGeo } from '@/store/slices/geoSelectors';
```

(Adjust to whatever existing import line covers these — preserve existing structure.)

In the `useActions()` destructure (~line 51-55), add `setActiveSelect, clearSelection`:

```ts
  const {
    setActiveView, setDrillDownCountryCode, setMapTheme,
    toggleShowAccounts, setMapAccountMetric, setActivePaintGeo, setActiveEraser, setActiveSelect,
    undoGeoAssignment, redoGeoAssignment, toggleShowLabels, clearSelection,
  } = useActions();
```

- [ ] **Step 2: Add the Select pill in the toolbar JSX**

Locate the existing paint/eraser pill cluster (around line 180 — `{!paintGeo && !eraserActive && (...)}`). Adjust the condition and append a Select pill that mirrors the existing eraser pill markup. Concretely:

Find the block that renders the eraser button when `!paintGeo && !eraserActive`. Add a third pill button alongside the eraser button:

```tsx
            <button
              type="button"
              onClick={() => setActiveSelect(!selectActive)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                selectActive
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-hairline bg-canvas text-ink-muted hover:text-ink'
              }`}
              title={selectActive ? 'Exit select mode (Esc)' : 'Multi-select regions'}
              aria-pressed={selectActive}
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3l4 10 2-4 4-2z" />
              </svg>
              Select
            </button>
```

The exact class tokens may need to mirror the existing eraser pill verbatim — copy from the file rather than inventing. Goal: visual parity with the eraser pill.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add components/territory/toolbar/Toolbar.tsx
git commit -m "feat(territory): add Select mode pill to map toolbar"
```

---

### Task 5: Selection rendering + click handlers in `WorldMapView`

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`

- [ ] **Step 1: Read the file in full**

Open `components/territory/map/WorldMapView.tsx` and re-read top to bottom. The `CountryGeo` memo'd component at line ~31 owns per-region rendering; click handling routes through `onClickCountry` prop down to `handleClickCountry` in the parent (line ~114).

- [ ] **Step 2: Add selection-aware imports and hooks in the parent**

Near the top imports add:

```ts
import { useActiveSelect } from '@/store/slices/geoSelectors';
import { useSelectedEntityCodes } from '@/store/slices/selectionSelectors';
```

Inside `WorldMapView`, near other hook reads (~line 81-87):

```ts
  const selectActive = useActiveSelect();
  const selectedCodes = useSelectedEntityCodes();
  const { setSelection, addToSelection, toggleSelection } = useActions();
```

- [ ] **Step 3: Update `handleClickCountry` to branch on select mode**

Replace the existing `handleClickCountry` callback with a version that takes the click event so we can read modifier keys, and routes to selection actions when `selectActive`:

```ts
  const handleClickCountry = useCallback(
    (entityCode: string, name: string, e: React.MouseEvent) => {
      if (selectActive) {
        if (e.metaKey || e.ctrlKey) toggleSelection(entityCode);
        else if (e.shiftKey) addToSelection([entityCode]);
        else setSelection([entityCode]);
        return;
      }
      if (eraserActive) {
        clearCountryAssignment(entityCode);
        return;
      }
      if (activePaintId) {
        assignCountryToGeo(activePaintId, entityCode);
        return;
      }
      togglePinnedEntityIso(entityCode);
      onDrillDown(entityCode, name);
    },
    [
      selectActive, toggleSelection, addToSelection, setSelection,
      eraserActive, clearCountryAssignment, activePaintId, assignCountryToGeo,
      togglePinnedEntityIso, onDrillDown,
    ],
  );
```

- [ ] **Step 4: Update `CountryGeo` signature and render to take selection state**

Change the `onClickCountry` prop type to accept the event:

```ts
  onClickCountry: (entityCode: string, name: string, e: React.MouseEvent) => void;
```

Add an `isSelected` prop:

```ts
  isSelected: boolean;
```

In the rendered `<Geography>`, layer selection styling on top of the existing stroke/fill. Replace the existing `stroke` and `strokeWidth` with:

```tsx
      stroke={isSelected ? 'var(--color-brand)' : isHighlighted ? 'var(--color-brand)' : isPinned ? 'var(--color-brand)' : countryStroke}
      strokeWidth={isSelected ? 2 : isHighlighted ? 2 : isPinned ? 1.5 : countryStrokeWidth}
      style={{
        default: {
          outline: 'none',
          cursor: 'pointer',
          transition,
          ...(isSelected ? { fill: `color-mix(in srgb, var(--color-brand) 4%, ${fill})` } : {}),
        },
        hover:   { outline: 'none', fill: isUnassigned ? unassignedHover : fill, opacity: hoverOpacity },
        pressed: { outline: 'none' },
      }}
```

Update `onClick` to pass the event:

```tsx
      onClick={(e: React.MouseEvent<SVGPathElement>) => onClickCountry(entityCode, geo.name, e)}
```

`onKeyDown` for `Enter`/`Space` does not have a mouse event — synthesize a no-modifier shape:

```tsx
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClickCountry(entityCode, geo.name, { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey } as React.MouseEvent);
        }
      }}
```

- [ ] **Step 5: Pass `isSelected` from parent to each `CountryGeo`**

In the `Geographies` render-prop where `CountryGeo` is mapped (~line 175):

```tsx
                  {geographies.map((geo) => {
                    const entityCode = (geo as unknown as EnrichedGeo).iso2 || (geo as unknown as EnrichedGeo).id;
                    return (
                      <CountryGeo
                        key={geo.rsmKey}
                        geo={geo as unknown as EnrichedGeo}
                        onClickCountry={handleClickCountry}
                        isSelected={selectedCodes.includes(entityCode)}
                        scaleMax={scaleMax}
                        choroplethActive={choroplethActive}
                        unassignedFill={theme.unassignedFill}
                        unassignedHover={theme.unassignedHover}
                        hoverOpacity={theme.hoverOpacity}
                        countryStroke={theme.countryStroke}
                        countryStrokeWidth={theme.countryStrokeWidth}
                        transition={theme.transition}
                      />
                    );
                  })}
```

- [ ] **Step 6: Lint and build**

```bash
npm run lint
npm run build
```

Expected: build succeeds, no new lint warnings.

- [ ] **Step 7: Commit**

```bash
git add components/territory/map/WorldMapView.tsx
git commit -m "feat(territory): selection rendering + click handlers in WorldMapView"
```

---

### Task 6: Selection rendering + click handlers in `DrillDownMapView`

**Files:**
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Mirror Task 5 changes**

Apply the same set of changes as Task 5 to `DrillDownMapView.tsx`:

- Import `useActiveSelect`, `useSelectedEntityCodes`, and the selection actions.
- Read `selectActive` and `selectedCodes`.
- Update the click handler (around line ~162) to branch on `selectActive` and route to `setSelection` / `addToSelection` / `toggleSelection` based on modifier keys, before falling through to the existing eraser/paint branches.
- Update the per-state child component (the `StateGeo`-equivalent at `DrillDownMapView`) to accept `isSelected` and apply the brand stroke + 4% brand fill overlay.
- Pass `isSelected={selectedCodes.includes(stateCode)}` from the parent's `geographies.map`.

The drill-down view uses state codes (e.g. `US-CA`) instead of country codes; treat them identically — same `selectedEntityCodes` array holds both kinds because the spec keeps one selection set across views (per spec section C, "persistence" — selection survives mode switches; it also survives view switches).

- [ ] **Step 2: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/map/DrillDownMapView.tsx
git commit -m "feat(territory): selection rendering + click handlers in DrillDownMapView"
```

---

### Task 7: Lasso overlay in `WorldMapView`

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`

- [ ] **Step 1: Add lasso state and centroid hit-test helper**

In the parent component, alongside `mousePos`:

```ts
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number; shift: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
```

We need access to the projection to compute centroids. The existing render-prop already exposes `projection` inside `Geographies`. Capture the geographies list and projection in a parent ref so the lasso mouseup can hit-test:

```ts
  const projectionRef = useRef<GeoProjection | null>(null);
  const geographiesRef = useRef<GeographyFeature[]>([]);
```

Inside the `Geographies` render-prop, set the refs each render before mapping:

```tsx
                projectionRef.current = projection;
                geographiesRef.current = geographies;
```

- [ ] **Step 2: Wire lasso mouse handlers**

Add mouse handlers gated on `selectActive`. These attach to the outer container (the `<div>` at line ~138-143) so the lasso captures background drags, not region clicks:

```ts
  const handleLassoMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectActive) return;
    if (e.target !== e.currentTarget) {
      // Click started on a region — let the region's own click handler run.
      // Only initiate lasso when the drag starts on background.
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setLasso({
      x0: e.clientX - rect.left,
      y0: e.clientY - rect.top,
      x1: e.clientX - rect.left,
      y1: e.clientY - rect.top,
      shift: e.shiftKey,
    });
  }, [selectActive]);

  const handleLassoMouseMove = useCallback((e: React.MouseEvent) => {
    if (!lasso) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setLasso({ ...lasso, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
  }, [lasso]);

  const handleLassoMouseUp = useCallback(() => {
    if (!lasso) return;
    const proj = projectionRef.current;
    const geos = geographiesRef.current;
    const svg = svgRef.current;
    if (proj && geos.length && svg) {
      const x0 = Math.min(lasso.x0, lasso.x1);
      const y0 = Math.min(lasso.y0, lasso.y1);
      const x1 = Math.max(lasso.x0, lasso.x1);
      const y1 = Math.max(lasso.y0, lasso.y1);
      // The map renders 980x551 logical units (its viewBox) but is CSS-scaled.
      // Convert lasso pixel coords (relative to the outer container) into map coords.
      const svgRect = svg.getBoundingClientRect();
      const sx = 980 / svgRect.width;
      const sy = 551 / svgRect.height;
      const mx0 = x0 * sx, my0 = y0 * sy, mx1 = x1 * sx, my1 = y1 * sy;
      const hits: string[] = [];
      for (const geo of geos) {
        const [lng, lat] = geoCentroid(geo as unknown as GeoJSON.Feature);
        const projected = (proj as unknown as (coords: [number, number]) => [number, number] | null)([lng, lat]);
        if (!projected) continue;
        const [cx, cy] = projected;
        if (cx >= mx0 && cx <= mx1 && cy >= my0 && cy <= my1) {
          hits.push((geo as unknown as EnrichedGeo).iso2 || (geo as unknown as EnrichedGeo).id);
        }
      }
      if (hits.length) {
        if (lasso.shift) addToSelection(hits);
        else setSelection(hits);
      } else if (!lasso.shift) {
        setSelection([]);
      }
    }
    setLasso(null);
  }, [lasso, addToSelection, setSelection]);
```

Add the `d3-geo` import at the top of the file:

```ts
import { geoCentroid } from 'd3-geo';
```

`d3-geo` is a transitive dep of `react-simple-maps`. Verify presence: `ls node_modules/d3-geo/package.json`. If somehow absent: `npm i d3-geo @types/d3-geo`.

- [ ] **Step 3: Render the lasso `<rect>` overlay**

Inside the outer `<div>` (after the `<ComposableMap>` close tag, but still inside the absolute-positioned container), render the lasso rect when active:

```tsx
      {lasso && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <rect
            x={Math.min(lasso.x0, lasso.x1)}
            y={Math.min(lasso.y0, lasso.y1)}
            width={Math.abs(lasso.x1 - lasso.x0)}
            height={Math.abs(lasso.y1 - lasso.y0)}
            fill="var(--color-brand)"
            fillOpacity={0.06}
            stroke="var(--color-brand)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        </svg>
      )}
```

Attach `onMouseDown={handleLassoMouseDown}`, `onMouseMove={handleLassoMouseMove}` (combined with existing `handleMouseMove` — call both), `onMouseUp={handleLassoMouseUp}` to the outer `<div>`. Wire `ref={svgRef}` onto the `<ComposableMap>` (it forwards to its inner SVG; if it doesn't, find the rendered SVG via `containerRef.current?.querySelector('svg')` instead).

- [ ] **Step 4: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/map/WorldMapView.tsx
git commit -m "feat(territory): lasso multi-select overlay in WorldMapView"
```

---

### Task 8: Lasso overlay in `DrillDownMapView`

**Files:**
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Mirror Task 7**

Apply the lasso state, mouse handlers, hit-test, and `<rect>` overlay to `DrillDownMapView.tsx`. The drill-down map has different dimensions — find the actual `width`/`height` props on its `ComposableMap` and use those as the map-coord scale denominators in the hit-test (they may not be 980×551).

- [ ] **Step 2: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/map/DrillDownMapView.tsx
git commit -m "feat(territory): lasso multi-select overlay in DrillDownMapView"
```

---

### Task 9: Pinch zoom filter + double-click-zoom-into-feature

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Update `filterZoomEvent` to be explicit about pinch**

Pinch gestures arrive as wheel events with `ctrlKey: true`; the existing filter at `WorldMapView.tsx:158-161` already lets all wheel events through, so pinch already works in principle. Make it explicit so future readers understand. Replace the filter with:

```ts
          {...({ filterZoomEvent: (evt: Event) => {
            // Wheel events include trackpad pinch (delivered as wheel + ctrlKey). Always allow.
            if (evt.type === 'wheel') return true;
            if (evt.type === 'dblclick') return true;
            // Mousedown-drag pan only when zoomed in, to keep clicks at zoom 1 from being eaten by drag.
            return zoomRef.current > 1.05;
          }} as Record<string, unknown>)}
```

Apply the same change to `DrillDownMapView.tsx` (its filter at the equivalent location).

- [ ] **Step 2: Add double-click-zoom on `<Geography>`**

In each map view, add a `onDoubleClick` handler on `<Geography>` that zooms into the feature centroid. The simplest implementation: bump the existing `zoom` state and recenter on the geo centroid. Inside `CountryGeo` add a prop `onDoubleClickFeature: (entityCode: string) => void`, wired to a parent callback that uses the existing `geoCentroid` import (added in Task 7) to compute the centroid coordinate and updates `setZoom` and `setCenter`:

```ts
  // In WorldMapView body, near handleClickCountry:
  const handleDoubleClickFeature = useCallback((entityCode: string) => {
    const geo = geographiesRef.current.find(
      (g) => ((g as unknown as EnrichedGeo).iso2 || (g as unknown as EnrichedGeo).id) === entityCode,
    );
    if (!geo) return;
    const [lng, lat] = geoCentroid(geo as unknown as GeoJSON.Feature);
    setCenter([lng, lat]);
    setZoom((z) => Math.min(z * 2.5, 8));
  }, []);
```

Pass `onDoubleClickFeature={handleDoubleClickFeature}` to `CountryGeo`. Inside `CountryGeo`, add:

```tsx
      onDoubleClick={(e: React.MouseEvent<SVGPathElement>) => {
        e.stopPropagation(); // prevent ZoomableGroup's own dblclick zoom from also firing
        onDoubleClickFeature(entityCode);
      }}
```

Apply equivalent to `DrillDownMapView` (note: drill-down probably already centers on a country, so the double-click target there would be a state). Use the same pattern with that view's geographies ref.

- [ ] **Step 3: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/map/WorldMapView.tsx components/territory/map/DrillDownMapView.tsx
git commit -m "feat(territory): explicit pinch filter + dbl-click-zoom-into-feature"
```

---

### Task 10: `mapZoomCommand` consumer effect in both map views

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Consume the command in `WorldMapView`**

Add the import and hook:

```ts
import { useMapZoomCommand } from '@/store/slices/mapUiSlice';
// ...
  const zoomCommand = useMapZoomCommand();
  const { setMapZoomCommand } = useActions();
```

Add the consumer effect:

```ts
  useEffect(() => {
    if (!zoomCommand) return;
    if (zoomCommand.kind === 'panBy') {
      // Translate dx/dy (pixels) into longitude/latitude shifts. At zoom Z and the geoMercator
      // projection used here, ~1 logical pixel ≈ (360 / (980 * Z)) degrees of longitude near
      // the equator. This is approximate but fine for keyboard nudges.
      const dLng = (zoomCommand.dx * 360) / (980 * zoom);
      const dLat = (zoomCommand.dy * 180) / (551 * zoom);
      setCenter(([lng, lat]) => [lng - dLng, lat + dLat]);
    } else if (zoomCommand.kind === 'zoomBy') {
      setZoom((z) => Math.min(Math.max(z * zoomCommand.factor, 1), 8));
    } else if (zoomCommand.kind === 'reset') {
      setZoom(1);
      setCenter([0, 20]);
    }
    setMapZoomCommand(null);
  }, [zoomCommand, zoom, setMapZoomCommand]);
```

Note: `setCenter` callback form requires `useState<[number, number]>` to be `[number, number]`-typed — verify the existing declaration uses functional updates, or replace `setCenter(([lng, lat]) => ...)` with reading `center` and calling `setCenter([newLng, newLat])`.

- [ ] **Step 2: Mirror in `DrillDownMapView`**

Same effect, but use the drill-down view's local `zoom` and `setCenter` state and its actual map width/height in the pixel-to-degree formula.

- [ ] **Step 3: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/map/WorldMapView.tsx components/territory/map/DrillDownMapView.tsx
git commit -m "feat(territory): map views consume mapZoomCommand for keyboard-driven zoom/pan"
```

---

### Task 11: Focus management + cursor states in both map views

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`
- Modify: `components/territory/map/DrillDownMapView.tsx`
- Modify: `app/globals.css` (focus ring class only)

- [ ] **Step 1: Add a focus-visible ring style**

In `app/globals.css`, append:

```css
/* Territory map focus ring — Sub-project 3 */
.map-region-path:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 1px;
}
```

- [ ] **Step 2: Wire roving tabindex into `CountryGeo`**

In `WorldMapView.tsx`, the parent computes the active focus index and passes `isTabFocus` to each region. The simplest model: a single `focusIndex: number` parent state, defaulting to 0; `Tab` enters the map cluster and lands on the alphabetically-first region. Within the cluster, `Tab` moves out (browser default since other regions are `tabIndex={-1}`); a future enhancement could add region-to-region keyboard nav, but it's out of scope (per spec, arrow keys pan).

Sort the geographies once for deterministic order. Derive from `countries` directly (NOT `geographiesRef.current`, which is empty on first render):

```ts
  const firstFocusableCode = useMemo(() => {
    const codes = countries
      .map((c) => (c as unknown as EnrichedGeo).iso2 || (c as unknown as EnrichedGeo).id)
      .sort();
    return codes[0] ?? null;
  }, [countries]);
```

Pass `isTabFocus={entityCode === firstFocusableCode}` to `CountryGeo`. In `CountryGeo`, replace `tabIndex={0}` with `tabIndex={isTabFocus ? 0 : -1}` and add `className="map-region-path"`. Also remove `outline: 'none'` from the `default`/`hover`/`pressed` style entries — keep only `cursor`/`fill`/`opacity`/`transition`.

- [ ] **Step 3: Update cursor computation**

Replace the existing `cursor` ternary at `WorldMapView.tsx:136`:

```ts
  const cursor =
    activePaintId || eraserActive ? 'crosshair' :
    selectActive ? 'cell' :
    isZoomed ? 'grab' : 'default';
```

Apply the same to `DrillDownMapView.tsx` (`useActiveSelect` already imported in Task 6).

- [ ] **Step 4: Mirror Steps 2-3 in `DrillDownMapView`**

Same: roving tabindex on the per-state child, `.map-region-path` class, removed inline `outline: none`, updated cursor ternary.

- [ ] **Step 5: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/map/WorldMapView.tsx components/territory/map/DrillDownMapView.tsx app/globals.css
git commit -m "feat(territory): focus-visible rings + roving tabindex + cursor states"
```

---

### Task 12: Extend `Toolbar` keydown listener for shortcuts + Esc cascade

**Files:**
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Read existing handler**

Read `Toolbar.tsx` lines 57-81 — the existing `onKey` handler.

- [ ] **Step 2: Add help-popover state and selection state**

Near other hook reads in `Toolbar`:

```ts
  const [helpOpen, setHelpOpen] = useState(false);
  const selectionCount = useSelectionCount();
```

Imports:

```ts
import { useState } from 'react';
import { useSelectionCount } from '@/store/slices/selectionSelectors';
```

Add to `useActions()` destructure: `setMapZoomCommand`. (Already added `clearSelection`, `setActiveSelect` in Task 4.)

- [ ] **Step 3: Replace the `onKey` body with the extended cascade**

```ts
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      // Esc cascade: popover → selection → paint/eraser
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return; }
        if (selectionCount > 0) { clearSelection(); return; }
        if (paintGeo || eraserActive) {
          setActivePaintGeo(null);
          setActiveEraser(false);
          return;
        }
        return;
      }

      // ? toggles help (Shift + / on US layout — both produce key === '?')
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Arrow / +/- / 0 — dispatch zoom commands (no modifier)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        let cmd: ZoomCommand | null = null;
        const PAN_PX = 40;
        if (e.key === 'ArrowUp')    cmd = { kind: 'panBy', dx: 0, dy: -PAN_PX, nonce: Date.now() };
        else if (e.key === 'ArrowDown')  cmd = { kind: 'panBy', dx: 0, dy:  PAN_PX, nonce: Date.now() };
        else if (e.key === 'ArrowLeft')  cmd = { kind: 'panBy', dx: -PAN_PX, dy: 0, nonce: Date.now() };
        else if (e.key === 'ArrowRight') cmd = { kind: 'panBy', dx:  PAN_PX, dy: 0, nonce: Date.now() };
        else if (e.key === '+' || e.key === '=') cmd = { kind: 'zoomBy', factor: 1.5, nonce: Date.now() };
        else if (e.key === '-')                  cmd = { kind: 'zoomBy', factor: 1 / 1.5, nonce: Date.now() };
        else if (e.key === '0')                  cmd = { kind: 'reset', nonce: Date.now() };
        if (cmd) {
          e.preventDefault();
          setMapZoomCommand(cmd);
          return;
        }
      }

      // Existing undo/redo (cmd+z, cmd+shift+z, cmd+y)
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoGeoAssignment();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redoGeoAssignment();
      }
    }
```

Update the dep list of the surrounding `useEffect`:

```ts
  }, [
    paintGeo, eraserActive, helpOpen, selectionCount,
    setActivePaintGeo, setActiveEraser, undoGeoAssignment, redoGeoAssignment,
    clearSelection, setMapZoomCommand,
  ]);
```

Import the `ZoomCommand` type:

```ts
import type { ZoomCommand } from '@/store/slices/mapUiSlice';
```

- [ ] **Step 4: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/toolbar/Toolbar.tsx
git commit -m "feat(territory): keyboard shortcuts + Esc cascade in Toolbar listener"
```

---

### Task 13: `MapHelpPopover` component + `?` button

**Files:**
- Create: `components/territory/map/MapHelpPopover.tsx`
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Create the popover**

```tsx
// components/territory/map/MapHelpPopover.tsx
'use client';

import { useEffect, useRef } from 'react';

export function MapHelpPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  if (!open) return null;

  const rows: Array<[string, string]> = [
    ['↑ ↓ ← →', 'Pan the map'],
    ['+ / -', 'Zoom in / out'],
    ['0', 'Reset view'],
    ['Shift + click', 'Add to selection'],
    ['⌘ / Ctrl + click', 'Toggle selection'],
    ['Drag (in Select mode)', 'Lasso multi-select'],
    ['Esc', 'Close popover · clear selection · clear paint/eraser'],
    ['?', 'Toggle this popover'],
  ];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Map keyboard shortcuts"
      className="absolute right-4 top-14 z-30 w-[360px] rounded-xl border border-hairline bg-canvas/95 p-4 text-[12px] shadow-lg backdrop-blur-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Keyboard shortcuts
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-ink-body">
        {rows.map(([key, desc]) => (
          <div key={key} className="contents">
            <dt className="font-mono text-ink">{key}</dt>
            <dd className="text-ink-muted">{desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Wire the `?` button and render the popover**

In `Toolbar.tsx`, import the popover:

```ts
import { MapHelpPopover } from '@/components/territory/map/MapHelpPopover';
```

Render the `?` button somewhere visible in the toolbar (e.g., next to the Select pill cluster):

```tsx
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-hairline text-[11px] font-semibold text-ink-muted hover:text-ink"
              aria-label="Keyboard shortcuts"
              aria-expanded={helpOpen}
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
```

Render the popover at the end of the `Toolbar` JSX (the popover positions itself absolutely; the toolbar container needs `relative` — line 91 already sets `relative`):

```tsx
      <MapHelpPopover open={helpOpen} onClose={() => setHelpOpen(false)} />
```

- [ ] **Step 3: Lint, build, commit**

```bash
npm run lint
npm run build
git add components/territory/map/MapHelpPopover.tsx components/territory/toolbar/Toolbar.tsx
git commit -m "feat(territory): keyboard shortcuts help popover"
```

---

### Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Build clean**

```bash
npm run lint
npm run build
```

Both must succeed with no new warnings.

- [ ] **Step 2: Manual UI smoke checklist**

Start `npm run dev`, open `/territory`, and verify each item:

- [ ] Pinch-zoom on trackpad zooms in/out at zoom 1 and at deeper zoom levels.
- [ ] Double-click on a country zooms into it (animated).
- [ ] Click the **Select** pill — paint and eraser both clear if they were active.
- [ ] Click the Select pill again — exits select mode.
- [ ] In Select mode: single-click a region — replaces selection. Selected region shows brand stroke + 4% brand fill overlay.
- [ ] Shift-click another region — adds to selection.
- [ ] Cmd/Ctrl-click a selected region — removes it; Cmd/Ctrl-click an unselected one — adds it.
- [ ] Drag on background — lasso rect appears; on release, regions whose centroids are inside the rect are selected.
- [ ] Shift-drag — adds to existing selection.
- [ ] Switch to Paint mode — selection persists visually.
- [ ] Press `Esc` — selection clears (and popover/paint/eraser cascade fires correctly).
- [ ] Arrow keys — map pans ~40px each press.
- [ ] `+`/`-` — zoom in/out one step. `0` — resets to world view.
- [ ] `?` — opens help popover. `?` again or `Esc` — closes it.
- [ ] Click outside popover — closes it.
- [ ] Tab — keyboard focus enters the map cluster, lands on the alphabetically-first region with a visible 2px brand outline.
- [ ] Tab again — focus moves out of the map.
- [ ] Hover behavior in Select mode — cursor is `cell`. In Paint/Eraser — `crosshair`. When zoomed and no tool active — `grab`.
- [ ] Drill into a country (single-click at zoom 1) — verify all selection/zoom/keyboard interactions also work in `DrillDownMapView`.

- [ ] **Step 3: Update task summary**

Per memory, append a "Sub-project 3 (shipped 2026-05-07)" section to `vegeta/.claude/docs/task-summary.md` Part 8, summarizing what shipped and any deviations from the spec.

- [ ] **Step 4: Final commit**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log sub-project 3 (map interaction & navigation) shipping"
```
