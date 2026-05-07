# Territory sub-project 2 — Information density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add metric-driven choropleth, opt-in country labels, hover/pin region summary panel, coverage-gap and conflict surfacing, and a quantitative legend scale to the territory map — without regressing the existing "who owns what" team-color view.

**Architecture:** Spec-driven. The toolbar metric pill drives a new `useChoroplethScale` hook and a new `useChoroplethFillColor` wrapper around the existing `useCountryFillColor`. A new right-rail container `MapInfoRail` consolidates legend + scale + region summary card. New `mapUiSlice` fields (`showLabels`, `pinnedEntityIso`, `highlightedEntityCodes`) carry transient UI state. Coverage gaps & conflicts are computed by new selectors over existing `geoNodes`/`subregions`/`assignments` data.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Zustand, Tailwind v4, react-simple-maps, d3-geo.

**Spec:** `docs/superpowers/specs/2026-05-06-territory-info-density-design.md`

**Verification baseline (no test suite):** every task ends with `npx tsc --noEmit && npm run lint` clean. The final task adds a manual smoke pass and a `npm run build` check.

---

## File structure

**New files:**
- `lib/choropleth.ts` — pure helpers: `buildChoroplethScale`, `mixColor`, `rampStops`.
- `hooks/useChoroplethScale.ts` — memoized scale hook.
- `components/territory/map/MapInfoRail.tsx` — right-rail container.
- `components/territory/map/RegionSummaryPanel.tsx` — region detail card.
- `components/territory/map/ChoroplethScale.tsx` — gradient bar legend.
- `components/territory/map/MapLabels.tsx` — collision-culled label overlay.

**Modified files:**
- `store/slices/mapUiSlice.ts` — add three fields + actions.
- `store/slices/mapUiSelectors.ts` — add selectors.
- `store/selectors.ts` — add `useChoroplethFillColor`.
- `components/territory/map/MapLegend.tsx` — drop chrome wrapper, export bare list.
- `components/territory/map/WorldMapView.tsx` — swap fill hook, add pin-click, mount rail + labels.
- `components/territory/map/DrillDownMapView.tsx` — same wiring as WorldMapView.
- `components/territory/toolbar/Toolbar.tsx` — Labels toggle button.

---

### Task 1: Add new fields and actions to `mapUiSlice`

**Files:**
- Modify: `store/slices/mapUiSlice.ts`

- [ ] **Step 1: Read current slice**

Read `store/slices/mapUiSlice.ts` to confirm current shape (interface + creator).

- [ ] **Step 2: Extend interface and creator**

Replace contents of `store/slices/mapUiSlice.ts` with:

```ts
import type { StateCreator } from 'zustand';
import { DEFAULT_THEME_ID, type MapThemeId } from '@/lib/mapThemes';
import type { TerritoryStore } from '../types';

export interface MapUiSlice {
  activeView: 'map' | 'spreadsheet';
  mapThemeId: MapThemeId;
  drillDownCountryCode: string | null;
  selectedEntityCode: string | null;
  hoveredEntityCode: string | null;
  hoveredEntityIso: string | null;
  showAccounts: boolean;
  mapAccountMetric: string;
  // ── Sub-project 2 (info density) ───────────────────────────────────────────
  showLabels: boolean;
  pinnedEntityIso: string | null;
  highlightedEntityCodes: string[];

  setActiveView: (view: 'map' | 'spreadsheet') => void;
  setMapTheme: (themeId: MapThemeId) => void;
  setDrillDownCountryCode: (code: string | null) => void;
  setSelectedEntityCode: (code: string | null) => void;
  setHoveredEntityCode: (code: string | null) => void;
  setHoveredEntityIso: (code: string | null) => void;
  toggleShowAccounts: () => void;
  setMapAccountMetric: (metric: string) => void;
  setShowLabels: (show: boolean) => void;
  toggleShowLabels: () => void;
  setPinnedEntityIso: (iso: string | null) => void;
  togglePinnedEntityIso: (iso: string) => void;
  setHighlightedEntityCodes: (codes: string[]) => void;
  clearHighlight: () => void;
}

export const mapUiPersistKeys = ['mapThemeId', 'mapAccountMetric'] as const satisfies readonly (keyof MapUiSlice)[];

export const createMapUiSlice: StateCreator<TerritoryStore, [], [], MapUiSlice> = (set) => ({
  activeView: 'map',
  mapThemeId: DEFAULT_THEME_ID,
  drillDownCountryCode: null,
  selectedEntityCode: null,
  hoveredEntityCode: null,
  hoveredEntityIso: null,
  showAccounts: true,
  mapAccountMetric: 'count',
  showLabels: false,
  pinnedEntityIso: null,
  highlightedEntityCodes: [],

  setActiveView: (view) => set({ activeView: view }),
  setMapTheme: (themeId) => set({ mapThemeId: themeId }),
  setDrillDownCountryCode: (code) => set({ drillDownCountryCode: code }),
  setSelectedEntityCode: (code) => set({ selectedEntityCode: code }),
  setHoveredEntityCode: (code) => set({ hoveredEntityCode: code }),
  setHoveredEntityIso: (code) => set({ hoveredEntityIso: code }),
  toggleShowAccounts: () => set((s) => ({ showAccounts: !s.showAccounts })),
  setMapAccountMetric: (metric) => set({ mapAccountMetric: metric }),
  setShowLabels: (showLabels) => set({ showLabels }),
  toggleShowLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setPinnedEntityIso: (iso) => set({ pinnedEntityIso: iso }),
  togglePinnedEntityIso: (iso) =>
    set((s) => ({ pinnedEntityIso: s.pinnedEntityIso === iso ? null : iso })),
  setHighlightedEntityCodes: (codes) => set({ highlightedEntityCodes: codes }),
  clearHighlight: () => set({ highlightedEntityCodes: [] }),
});
```

Note: `showLabels` is intentionally excluded from `mapUiPersistKeys` — it's session-only per spec §10.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add store/slices/mapUiSlice.ts
git commit -m "Add mapUiSlice fields for labels, pinned entity, highlight"
```

---

### Task 2: Add new map UI selectors

**Files:**
- Modify: `store/slices/mapUiSelectors.ts`

- [ ] **Step 1: Append selectors**

Append to `store/slices/mapUiSelectors.ts` (after the existing `useMapAccountMetric` line):

```ts
export const useShowLabels = () => useTerritoryStore((s) => s.showLabels);
export const usePinnedEntityIso = () => useTerritoryStore((s) => s.pinnedEntityIso);
export const useHighlightedEntityCodes = () =>
  useTerritoryStore((s) => s.highlightedEntityCodes);

/** Effective focused entity = pinned (if any) else hovered. */
export const useFocusedEntityIso = () =>
  useTerritoryStore((s) => s.pinnedEntityIso ?? s.hoveredEntityIso);

/** Whether a given entity code is currently highlighted by a coverage badge. */
export const useEntityHighlight = (entityCode: string) =>
  useTerritoryStore((s) => s.highlightedEntityCodes.includes(entityCode));
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add store/slices/mapUiSelectors.ts
git commit -m "Add selectors for labels, pin, focused entity, and highlight"
```

---

### Task 3: Build pure choropleth helpers

**Files:**
- Create: `lib/choropleth.ts`

- [ ] **Step 1: Write the module**

Create `lib/choropleth.ts`:

```ts
import { getEntityMetricVal, type AccountStatsByEntity } from '@/lib/territoryIndex';

/** Sequential ramp endpoints. Tuned to feel like amber-soft → brand. */
const RAMP_FROM = { r: 254, g: 243, b: 199 }; // ≈ amber-100 (--color-accent-soft)
const RAMP_TO   = { r: 79,  g: 70,  b: 229 };  // ≈ indigo-600 (--color-brand)
/** t=0 produces an even softer near-white tint to differentiate "assigned but zero". */
const RAMP_ZERO = { r: 248, g: 250, b: 252 }; // ≈ slate-50

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function mixColor(t: number): string {
  const u = clamp01(t);
  // Two-stop ramp: ZERO → FROM (0..0.05) → TO (0.05..1) so a value just above 0
  // visibly lifts off the near-white floor.
  if (u <= 0.05) {
    const k = u / 0.05;
    const r = lerp(RAMP_ZERO.r, RAMP_FROM.r, k);
    const g = lerp(RAMP_ZERO.g, RAMP_FROM.g, k);
    const b = lerp(RAMP_ZERO.b, RAMP_FROM.b, k);
    return `rgb(${r} ${g} ${b})`;
  }
  const k = (u - 0.05) / 0.95;
  const r = lerp(RAMP_FROM.r, RAMP_TO.r, k);
  const g = lerp(RAMP_FROM.g, RAMP_TO.g, k);
  const b = lerp(RAMP_FROM.b, RAMP_TO.b, k);
  return `rgb(${r} ${g} ${b})`;
}

/** CSS gradient stops for ChoroplethScale's bar. */
export function rampStops(): string {
  return [0, 0.05, 0.5, 1].map((t) => `${mixColor(t)} ${(t * 100).toFixed(1)}%`).join(', ');
}

export interface ChoroplethScale {
  metric: string;
  min: number;
  max: number;
  /** Returns a CSS color string for a given value. Values <= 0 → ZERO tint. */
  fillFor: (value: number) => string;
}

/**
 * Builds a scale for the given metric across the provided stats.
 *
 * `keyFilter` lets the caller restrict to country-level keys (no `:`) or
 * state-level keys (those with `:`).
 */
export function buildChoroplethScale(
  stats: AccountStatsByEntity,
  metric: string,
  keyFilter: (key: string) => boolean,
): ChoroplethScale {
  let min = Infinity;
  let max = 0;
  for (const key in stats) {
    if (!keyFilter(key)) continue;
    const v = getEntityMetricVal(stats[key], metric);
    if (v > 0 && v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min)) min = 0;
  const safeMax = max > 0 ? max : 1;
  return {
    metric,
    min: min === Infinity ? 0 : min,
    max,
    fillFor: (value) => {
      if (value <= 0) return mixColor(0);
      return mixColor(value / safeMax);
    },
  };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/choropleth.ts
git commit -m "Add choropleth scale helpers and amber→brand color ramp"
```

---

### Task 4: Build `useChoroplethScale` hook

**Files:**
- Create: `hooks/useChoroplethScale.ts`

- [ ] **Step 1: Write the hook**

Create `hooks/useChoroplethScale.ts`:

```ts
import { useMemo } from 'react';
import {
  useAccountStatsByEntity,
  useFieldDefs,
  useMapAccountMetric,
} from '@/hooks/useTerritoryStore';
import { buildChoroplethScale, type ChoroplethScale } from '@/lib/choropleth';
import type { FieldDefinition } from '@/lib/accountFields';

export interface UseChoroplethScaleResult {
  active: boolean;
  scale: ChoroplethScale | null;
  fieldDef: FieldDefinition | null;
}

/**
 * The choropleth is "active" when the toolbar metric is something other than
 * the default 'count' AND that metric still resolves to a known field def
 * (so deleting a field mid-session falls back gracefully).
 *
 * `view` selects which entity keys participate in the scale:
 *   - 'world'     → country-level keys only (no `:` in key).
 *   - 'drilldown' → state-level keys only (key contains `:` and starts with iso2).
 */
export function useChoroplethScale(
  view: 'world' | 'drilldown',
  drilldownIso2?: string,
): UseChoroplethScaleResult {
  const metric    = useMapAccountMetric();
  const fieldDefs = useFieldDefs();
  const stats     = useAccountStatsByEntity();

  return useMemo<UseChoroplethScaleResult>(() => {
    if (!metric || metric === 'count') {
      return { active: false, scale: null, fieldDef: null };
    }
    const fieldDef = fieldDefs.find((f) => f.id === metric) ?? null;
    if (!fieldDef) return { active: false, scale: null, fieldDef: null };

    const filter =
      view === 'world'
        ? (key: string) => !key.includes(':')
        : (key: string) => key.includes(':') && (!drilldownIso2 || key.startsWith(`${drilldownIso2}:`));

    const scale = buildChoroplethScale(stats, metric, filter);
    return { active: true, scale, fieldDef };
  }, [metric, fieldDefs, stats, view, drilldownIso2]);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add hooks/useChoroplethScale.ts
git commit -m "Add useChoroplethScale hook scoped to world or drill-down view"
```

---

### Task 5: Add `useChoroplethFillColor`

**Files:**
- Modify: `store/selectors.ts`

- [ ] **Step 1: Append selector**

Append to `store/selectors.ts` (after `useAccountStatsByEntity`):

```ts
import { mixColor } from '@/lib/choropleth';
import { getEntityMetricVal } from '@/lib/territoryIndex';

/**
 * Country/state path fill. Branches by metric:
 *   - 'count' (or unknown metric) → existing team-color behavior.
 *   - real metric:
 *       - assigned entity   → metric-driven ramp value.
 *       - unassigned entity → unassignedFill.
 *
 * `scaleMax` is read from a separately-built scale (callers pass it in), to
 * avoid recomputing the scale on every Geography render.
 */
export const useChoroplethFillColor = (
  entityCode: string,
  scaleMax: number,
  active: boolean,
): string =>
  useTerritoryStore((s) => {
    const unassigned = MAP_THEMES[s.mapThemeId].unassignedFill;
    if (!active) {
      // count mode — preserve existing behavior.
      return getEntityGeoColor(s, entityCode) ?? unassigned;
    }
    const assignedColor = getEntityGeoColor(s, entityCode);
    if (assignedColor === null) return unassigned;
    const stats = getAccountStatsByEntity(s)[entityCode];
    const value = getEntityMetricVal(stats, s.mapAccountMetric);
    const t = scaleMax > 0 ? value / scaleMax : 0;
    return mixColor(t);
  });
```

You will also need to make sure `getEntityGeoColor` and `getAccountStatsByEntity` are imported at the top of `store/selectors.ts`. Check the existing imports — `getAccountStatsByEntity` already comes from `@/lib/territoryIndex`. Add `getEntityGeoColor` to the same import group.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add store/selectors.ts
git commit -m "Add useChoroplethFillColor with mode-toggled fill logic"
```

---

### Task 6: Wire choropleth fill + pin-click into `WorldMapView`

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`

- [ ] **Step 1: Import the new hooks**

In the imports at the top of `WorldMapView.tsx`, replace the existing line that imports `useCountryFillColor` with one that imports `useChoroplethFillColor` instead, and add hook imports:

```ts
import {
  useChoroplethFillColor, useMapTheme, useActions, useActivePaintGeoId, useActiveEraser,
  usePinnedEntityIso,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
```

- [ ] **Step 2: Pass scale into `CountryGeo`**

Update the `CountryGeo` props and body so it accepts `scaleMax: number` and `choroplethActive: boolean`, replaces `useCountryFillColor(entityCode)` with `useChoroplethFillColor(entityCode, scaleMax, choroplethActive)`, and applies a 1.5px brand stroke when `entityCode === pinnedEntityIso` (read via a new `usePinnedEntityIso()` call inside `CountryGeo`):

```tsx
const CountryGeo = memo(function CountryGeo({
  geo, onClickCountry, scaleMax, choroplethActive,
  unassignedFill, unassignedHover, hoverOpacity, countryStroke, countryStrokeWidth, transition,
}: {
  geo: EnrichedGeo;
  onClickCountry: (entityCode: string, name: string) => void;
  scaleMax: number;
  choroplethActive: boolean;
  unassignedFill: string;
  unassignedHover: string;
  hoverOpacity: number;
  countryStroke: string;
  countryStrokeWidth: number;
  transition: string;
}) {
  const entityCode = geo.iso2 || geo.id;
  const fill = useChoroplethFillColor(entityCode, scaleMax, choroplethActive);
  const pinnedIso = usePinnedEntityIso();
  const isPinned = pinnedIso === entityCode;
  const { setHoveredEntityCode, setHoveredEntityIso } = useActions();
  const isUnassigned = fill === unassignedFill;

  return (
    <Geography
      geography={geo as unknown as import('react-simple-maps').GeographyFeature}
      fill={fill}
      stroke={isPinned ? 'var(--color-brand)' : countryStroke}
      strokeWidth={isPinned ? 1.5 : countryStrokeWidth}
      style={{
        default: { outline: 'none', cursor: 'pointer', transition },
        hover:   { outline: 'none', fill: isUnassigned ? unassignedHover : fill, opacity: hoverOpacity },
        pressed: { outline: 'none' },
      }}
      onMouseEnter={() => { setHoveredEntityCode(geo.name); setHoveredEntityIso(entityCode); }}
      onMouseLeave={() => { setHoveredEntityCode(null); setHoveredEntityIso(null); }}
      onClick={() => onClickCountry(entityCode, geo.name)}
      role="button"
      aria-label={geo.name}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') onClickCountry(entityCode, geo.name);
      }}
    />
  );
});
```

- [ ] **Step 3: Compute scale once and add pin-click**

Inside `WorldMapView`, after the existing `useGeoData` line, add:

```tsx
const { active: choroplethActive, scale } = useChoroplethScale('world');
const scaleMax = scale?.max ?? 0;
const { togglePinnedEntityIso, setPinnedEntityIso } = useActions();
```

Update `handleClickCountry` so that when no paint/eraser tool is active, the click pins the entity (instead of, or in addition to, drilling down). Per spec §4 the pin and drill-down need to coexist. We'll use this rule:

- Eraser/paint active → behave as today.
- Otherwise: pin toggles on click; drill-down still happens (the rail follows the pin so it's still useful in drill-down).

```tsx
const handleClickCountry = useCallback(
  (entityCode: string, name: string) => {
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
  [eraserActive, clearCountryAssignment, activePaintId, assignCountryToGeo, togglePinnedEntityIso, onDrillDown],
);
```

- [ ] **Step 4: Add background-click pin clear**

The outermost `<div className="absolute inset-0" ...>` already has `onMouseMove`. Add:

```tsx
const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
  if (e.target === e.currentTarget) setPinnedEntityIso(null);
}, [setPinnedEntityIso]);
```

and pass `onClick={handleBackgroundClick}` to that outer div.

- [ ] **Step 5: Pass scale into the map**

Update the `<CountryGeo … />` invocation inside `<Geographies>` to pass `scaleMax={scaleMax} choroplethActive={choroplethActive}`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Briefly load the dev server (`npm run dev`) and confirm: default count mode looks unchanged; selecting a real metric in the toolbar pill repaints countries with the gradient.

- [ ] **Step 7: Commit**

```bash
git add components/territory/map/WorldMapView.tsx
git commit -m "Wire choropleth fill, pin-click, and background-clear in WorldMapView"
```

---

### Task 7: Mirror Task 6 wiring in `DrillDownMapView`

**Files:**
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Apply identical pattern at the state level**

Replace the import line that brings in `useCountryFillColor` with:

```ts
import {
  useChoroplethFillColor, useMapTheme, useActions, useActivePaintGeoId, useActiveEraser,
  usePinnedEntityIso,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
```

In `StateGeo`, swap `useCountryFillColor(entityCode)` for `useChoroplethFillColor(entityCode, scaleMax, choroplethActive)` and add the same `pinnedIso === entityCode → 1.5px brand stroke` rule used in Task 6. Pass `scaleMax` and `choroplethActive` from props.

In the parent `DrillDownMapView` component, compute the scale scoped to this country's states and add the same `togglePinnedEntityIso` / `setPinnedEntityIso` wiring. Use:

```tsx
const { active: choroplethActive, scale } = useChoroplethScale('drilldown', countryIso2);
const scaleMax = scale?.max ?? 0;
const { togglePinnedEntityIso, setPinnedEntityIso } = useActions();
```

`onClickState` should toggle the pin instead of (or in addition to — match the existing handler's behavior) any other action. Background click on the outer container should call `setPinnedEntityIso(null)` only when `e.target === e.currentTarget`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/DrillDownMapView.tsx
git commit -m "Wire choropleth fill, pin-click, and background-clear in DrillDownMapView"
```

---

### Task 8: Refactor `MapLegend` into a bare list

**Files:**
- Modify: `components/territory/map/MapLegend.tsx`

- [ ] **Step 1: Strip outer chrome**

Replace contents of `MapLegend.tsx`:

```tsx
'use client';

import { useShallow } from 'zustand/react/shallow';
import { useGeoChildren, useMapTheme, useTerritoryStore } from '@/hooks/useTerritoryStore';
import type { GeoNode } from '@/types/territory';

/**
 * Bare-list variant of the legend. The outer rail chrome is now provided by
 * `MapInfoRail`; this component renders only the title and dot rows.
 */
export default function MapLegend() {
  const roots = useGeoChildren(null);
  const theme = useMapTheme();
  const colorByRootId = useTerritoryStore(
    useShallow((s) => {
      const out: Record<string, string | null> = {};
      for (const r of roots) {
        out[r.id] = resolveColor(s.geoNodes, r.id);
      }
      return out;
    }),
  );

  if (roots.length === 0) return null;

  return (
    <div>
      <p className={theme.legendTitleClass}>Geos</p>
      <div className="flex flex-col gap-1.5">
        {roots.map((g) => {
          const color = colorByRootId[g.id] ?? theme.unassignedFill;
          return (
            <div key={g.id} className={theme.legendTextClass}>
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: color }}
              />
              <span className="max-w-[160px] truncate">{g.name}</span>
            </div>
          );
        })}
        <div className={`${theme.legendTextClass} opacity-60`}>
          <span
            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: theme.unassignedFill }}
          />
          <span>Unassigned</span>
        </div>
      </div>
    </div>
  );
}

function resolveColor(nodes: Record<string, GeoNode>, startId: string): string | null {
  let cur: string | null = startId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n: GeoNode | undefined = nodes[cur];
    if (!n) return null;
    if (n.color) return n.color;
    cur = n.parentId;
  }
  return null;
}
```

(The only change vs. the original is dropping the `theme.legendClass` outer `div`.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/MapLegend.tsx
git commit -m "Strip MapLegend chrome — list-only, MapInfoRail will own chrome"
```

---

### Task 9: Build `ChoroplethScale`

**Files:**
- Create: `components/territory/map/ChoroplethScale.tsx`

- [ ] **Step 1: Write the component**

Create `components/territory/map/ChoroplethScale.tsx`:

```tsx
'use client';

import { useMapTheme } from '@/hooks/useTerritoryStore';
import { rampStops } from '@/lib/choropleth';
import { formatFieldValue } from '@/lib/accountFields';
import type { FieldDefinition } from '@/lib/accountFields';
import type { ChoroplethScale as Scale } from '@/lib/choropleth';

interface Props {
  scale: Scale;
  fieldDef: FieldDefinition;
}

export default function ChoroplethScale({ scale, fieldDef }: Props) {
  const theme = useMapTheme();
  const minLabel = formatFieldValue(scale.min, fieldDef);
  const maxLabel = formatFieldValue(scale.max, fieldDef);

  return (
    <div>
      <p className={theme.legendTitleClass}>{fieldDef.label}</p>
      <div
        className="h-3 w-full rounded-sm ring-1 ring-black/10"
        style={{ backgroundImage: `linear-gradient(to right, ${rampStops()})` }}
      />
      <div className={`mt-1 flex justify-between font-mono tabular-nums ${theme.legendTextClass}`}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/ChoroplethScale.tsx
git commit -m "Add ChoroplethScale gradient bar with min/max labels"
```

---

### Task 10: Build `RegionSummaryPanel` + `useRegionRollup`

**Files:**
- Modify: `store/slices/mapUiSelectors.ts`
- Create: `components/territory/map/RegionSummaryPanel.tsx`

- [ ] **Step 1: Add `useRegionRollup` selector**

Append to `store/slices/mapUiSelectors.ts`:

```ts
import { useShallow } from 'zustand/react/shallow';
import { getEntityGeoIndex, getAccountStatsByEntity, getEntityMetricVal } from '@/lib/territoryIndex';
import type { FieldDefinition } from '@/lib/accountFields';

export interface RegionRollup {
  entityCode: string;
  name: string;
  /** GeoNode trail from root → owning leaf. Empty if unassigned. */
  geoTrail: string[];
  count: number;
  topMetricTotals: { fieldId: string; label: string; total: number; field: FieldDefinition }[];
  topOwners: { repId: string; name: string; teamColor: string | null; count: number }[];
}

/**
 * Rollup for the focused entity. Returns null when no entity is focused or
 * when the entity has zero accounts AND no assignment trail.
 */
export const useRegionRollup = (entityCode: string | null) =>
  useTerritoryStore(
    useShallow((s): RegionRollup | null => {
      if (!entityCode) return null;
      // Name lookup: hoveredEntityCode is set on enter, but we can fall back to
      // the iso when nothing better is available.
      const name = s.hoveredEntityCode ?? entityCode;

      // Geo trail
      const idx = getEntityGeoIndex(s);
      let nodeId: string | undefined = idx[entityCode];
      if (!nodeId && entityCode.includes(':')) nodeId = idx[entityCode.split(':')[0]];
      const trail: string[] = [];
      let cur: string | null | undefined = nodeId ?? null;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const n = s.geoNodes[cur];
        if (!n) break;
        trail.unshift(n.name);
        cur = n.parentId;
      }

      // Stats for this entity
      const stats = getAccountStatsByEntity(s)[entityCode];
      const count = stats?.count ?? 0;

      // Top metric totals
      const topMetricTotals = s.fieldDefs
        .filter((f) => f.entity === 'account' && (f.type === 'number' || f.type === 'currency'))
        .map((f) => ({
          fieldId: f.id,
          label: f.label,
          total: getEntityMetricVal(stats, f.id),
          field: f,
        }))
        .sort((a, b) => {
          // Pin the active toolbar metric to position 1.
          if (a.fieldId === s.mapAccountMetric) return -1;
          if (b.fieldId === s.mapAccountMetric) return 1;
          return b.total - a.total;
        })
        .slice(0, 3);

      // Top owners — count accounts in this region per repId.
      const ownerCounts: Record<string, number> = {};
      for (const aid of s.accountOrder) {
        const a = s.accounts[aid];
        if (!a?.repId) continue;
        const matches = entityCode.includes(':')
          ? a.state === entityCode
          : a.country === entityCode;
        if (!matches) continue;
        ownerCounts[a.repId] = (ownerCounts[a.repId] ?? 0) + 1;
      }
      const topOwners = Object.entries(ownerCounts)
        .map(([repId, c]) => {
          const m = s.members[repId];
          const teamId = m?.teamId ?? null;
          const teamColor = teamId ? (s.teams[teamId]?.color ?? null) : null;
          return { repId, name: m?.name ?? 'Unknown', teamColor, count: c };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      if (count === 0 && trail.length === 0) {
        // Still useful — return a minimal rollup so the panel can show "no accounts".
        return { entityCode, name, geoTrail: [], count: 0, topMetricTotals: [], topOwners: [] };
      }
      return { entityCode, name, geoTrail: trail, count, topMetricTotals, topOwners };
    }),
  );
```

If a property name (e.g., `repId`, `teamId`, `members`, `teams`, or `accounts`) doesn't match the actual store shape when type-checking, adjust to the real names in `types/territory.ts` rather than inventing aliases. Read those types first if uncertain.

- [ ] **Step 2: Build the panel**

Create `components/territory/map/RegionSummaryPanel.tsx`:

```tsx
'use client';

import Link from 'next/link';
import {
  useFocusedEntityIso, useRegionRollup, useEntityNoun, useOwnerNoun, useMapTheme,
} from '@/hooks/useTerritoryStore';
import { formatFieldValue } from '@/lib/accountFields';

export default function RegionSummaryPanel() {
  const iso = useFocusedEntityIso();
  const rollup = useRegionRollup(iso);
  const entityNoun = useEntityNoun();
  const ownerNoun = useOwnerNoun();
  const theme = useMapTheme();

  if (!iso || !rollup) {
    return (
      <p className={`${theme.legendTextClass} opacity-60`}>
        Hover a region to see details.
      </p>
    );
  }

  const isState = iso.includes(':');
  const filterParam = isState ? `state:${iso}` : `country:${iso}`;
  const accountsHref = `/accounts?filter=${encodeURIComponent(filterParam)}`;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className={`${theme.legendTitleClass} truncate`}>{rollup.name}</p>
        {rollup.geoTrail.length > 0 ? (
          <p className={`${theme.legendTextClass} opacity-70 truncate`}>
            {rollup.geoTrail.join(' › ')}
          </p>
        ) : (
          <p className={`${theme.legendTextClass} opacity-60`}>Unassigned</p>
        )}
      </div>

      <p className={theme.legendTextClass}>
        <span className="font-medium">{rollup.count}</span> {entityNoun.plural}
      </p>

      {rollup.topMetricTotals.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {rollup.topMetricTotals.map((m) => (
            <div key={m.fieldId} className={`${theme.legendTextClass} flex justify-between gap-2`}>
              <span className="truncate opacity-80">{m.label}</span>
              <span className="font-mono tabular-nums">{formatFieldValue(m.total, m.field)}</span>
            </div>
          ))}
        </div>
      )}

      {rollup.topOwners.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className={`${theme.legendTextClass} opacity-70`}>Top {ownerNoun.plural}</p>
          {rollup.topOwners.map((o) => (
            <div key={o.repId} className={`${theme.legendTextClass} flex items-center gap-1.5`}>
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: o.teamColor ?? '#94a3b8' }}
              />
              <span className="truncate flex-1">{o.name}</span>
              <span className="font-mono tabular-nums opacity-70">{o.count}</span>
            </div>
          ))}
        </div>
      )}

      <Link href={accountsHref} className={`${theme.legendTextClass} text-brand hover:underline`}>
        → {entityNoun.plural} in this region
      </Link>
    </div>
  );
}
```

The hook return shapes for `useEntityNoun()` and `useOwnerNoun()` may differ — read those hooks before finalizing. If they return `string` rather than `{ singular, plural }`, adjust accordingly.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add store/slices/mapUiSelectors.ts components/territory/map/RegionSummaryPanel.tsx
git commit -m "Add useRegionRollup selector and RegionSummaryPanel"
```

---

### Task 11: Build `MapInfoRail` and mount in both map views

**Files:**
- Create: `components/territory/map/MapInfoRail.tsx`
- Modify: `components/territory/map/WorldMapView.tsx`
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Write the rail container**

Create `components/territory/map/MapInfoRail.tsx`:

```tsx
'use client';

import { useMapTheme } from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import MapLegend from './MapLegend';
import ChoroplethScale from './ChoroplethScale';
import RegionSummaryPanel from './RegionSummaryPanel';

interface Props {
  view: 'world' | 'drilldown';
  drilldownIso2?: string;
}

export default function MapInfoRail({ view, drilldownIso2 }: Props) {
  const theme = useMapTheme();
  const { active, scale, fieldDef } = useChoroplethScale(view, drilldownIso2);

  return (
    <div
      className={`${theme.legendClass} absolute right-4 top-16 z-10 flex w-[300px] flex-col gap-3 max-h-[calc(100%-7rem)] overflow-y-auto`}
    >
      {active && scale && fieldDef && (
        <ChoroplethScale scale={scale} fieldDef={fieldDef} />
      )}
      <MapLegend />
      <div className="border-t border-hairline pt-3">
        <RegionSummaryPanel />
      </div>
    </div>
  );
}
```

The `top-16` offset clears the existing zoom-controls panel at `top-4`. If the layout looks off in dev, adjust the offset.

- [ ] **Step 2: Replace `<MapLegend />` mount in `WorldMapView`**

In `WorldMapView.tsx`, replace `<MapLegend />` near the bottom of the JSX with `<MapInfoRail view="world" />`. Remove the `import MapLegend from './MapLegend';` line. Add `import MapInfoRail from './MapInfoRail';`.

- [ ] **Step 3: Replace `<MapLegend />` mount in `DrillDownMapView`**

Same swap in `DrillDownMapView.tsx`: replace `<MapLegend />` with `<MapInfoRail view="drilldown" drilldownIso2={countryIso2} />`. Update imports accordingly.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/territory/map/MapInfoRail.tsx components/territory/map/WorldMapView.tsx components/territory/map/DrillDownMapView.tsx
git commit -m "Mount MapInfoRail in both map views, replacing legacy MapLegend slot"
```

---

### Task 12: Coverage gaps & conflicts selectors + badges

**Files:**
- Modify: `store/slices/mapUiSelectors.ts`
- Modify: `components/territory/map/MapInfoRail.tsx`

- [ ] **Step 1: Add the two selectors**

Append to `store/slices/mapUiSelectors.ts`:

```ts
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';

export interface CoverageInfo {
  count: number;
  codes: string[];
}

/**
 * Countries (world view) or states (drill-down) with no resolved assignment.
 * Counted via the existing `getEntityGeoIndex` lookup.
 */
export const useCoverageGaps = (
  view: 'world' | 'drilldown',
  drilldownIso2?: string,
) =>
  useTerritoryStore(
    useShallow((s): CoverageInfo => {
      const idx = getEntityGeoIndex(s);
      if (view === 'world') {
        const codes: string[] = [];
        for (const code of Object.keys(COUNTRY_CENTROIDS)) {
          if (!idx[code]) codes.push(code);
        }
        return { count: codes.length, codes };
      }
      // drill-down: enumerate state codes referenced by any subregion in this country.
      if (!drilldownIso2) return { count: 0, codes: [] };
      const seen = new Set<string>();
      for (const sid of s.subregionOrder) {
        for (const code of s.subregions[sid]?.stateCodes ?? []) {
          if (code.startsWith(`${drilldownIso2}:`)) seen.add(code);
        }
      }
      const codes: string[] = [];
      for (const code of seen) {
        if (!idx[code]) codes.push(code);
      }
      return { count: codes.length, codes };
    }),
  );

/**
 * Conflicts: the country resolves to GeoNode A, but one of its states resolves
 * to a different GeoNode B (and B is not an ancestor/descendant of A).
 *
 * In world view, `codes` holds the conflicting parent country codes (so the
 * highlight paints the country path). In drill-down, `codes` holds the
 * conflicting state codes directly.
 */
export const useAssignmentConflicts = (
  view: 'world' | 'drilldown',
  drilldownIso2?: string,
) =>
  useTerritoryStore(
    useShallow((s): CoverageInfo => {
      const idx = getEntityGeoIndex(s);
      const conflicts: { country: string; state: string }[] = [];
      for (const stateCode in idx) {
        if (!stateCode.includes(':')) continue;
        const country = stateCode.split(':')[0];
        const stateNode = idx[stateCode];
        const countryNode = idx[country];
        if (!countryNode) continue;
        if (stateNode === countryNode) continue;
        // Walk parent chain — if stateNode is a descendant or ancestor of
        // countryNode, treat as compatible.
        const chain = (start: string) => {
          const out = new Set<string>();
          let cur: string | null = start;
          const seen = new Set<string>();
          while (cur && !seen.has(cur)) {
            seen.add(cur);
            out.add(cur);
            cur = s.geoNodes[cur]?.parentId ?? null;
          }
          return out;
        };
        const stateChain = chain(stateNode);
        const countryChain = chain(countryNode);
        const compatible =
          stateChain.has(countryNode) || countryChain.has(stateNode);
        if (!compatible) conflicts.push({ country, state: stateCode });
      }
      if (view === 'world') {
        const set = new Set(conflicts.map((c) => c.country));
        return { count: set.size, codes: [...set] };
      }
      const filtered = drilldownIso2
        ? conflicts.filter((c) => c.country === drilldownIso2)
        : conflicts;
      return { count: filtered.length, codes: filtered.map((c) => c.state) };
    }),
  );
```

- [ ] **Step 2: Add badge buttons to the rail**

Update `components/territory/map/MapInfoRail.tsx` to render the badges below the legend:

```tsx
'use client';

import {
  useMapTheme, useActions, useHighlightedEntityCodes,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import { useCoverageGaps, useAssignmentConflicts } from '@/store/slices/mapUiSelectors';
import MapLegend from './MapLegend';
import ChoroplethScale from './ChoroplethScale';
import RegionSummaryPanel from './RegionSummaryPanel';

interface Props {
  view: 'world' | 'drilldown';
  drilldownIso2?: string;
}

export default function MapInfoRail({ view, drilldownIso2 }: Props) {
  const theme = useMapTheme();
  const { active, scale, fieldDef } = useChoroplethScale(view, drilldownIso2);
  const gaps = useCoverageGaps(view, drilldownIso2);
  const conflicts = useAssignmentConflicts(view, drilldownIso2);
  const { setHighlightedEntityCodes, clearHighlight } = useActions();
  const highlighted = useHighlightedEntityCodes();

  const isHighlightingGaps = highlighted.length > 0 && gaps.codes.every((c) => highlighted.includes(c)) && highlighted.length === gaps.codes.length;
  const isHighlightingConflicts = highlighted.length > 0 && conflicts.codes.every((c) => highlighted.includes(c)) && highlighted.length === conflicts.codes.length;

  return (
    <div className={`${theme.legendClass} absolute right-4 top-16 z-10 flex w-[300px] flex-col gap-3 max-h-[calc(100%-7rem)] overflow-y-auto`}>
      {active && scale && fieldDef && (
        <ChoroplethScale scale={scale} fieldDef={fieldDef} />
      )}
      <MapLegend />

      {(gaps.count > 0 || conflicts.count > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {gaps.count > 0 && (
            <button
              type="button"
              onClick={() => isHighlightingGaps ? clearHighlight() : setHighlightedEntityCodes(gaps.codes)}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingGaps ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              {gaps.count} unassigned
            </button>
          )}
          {conflicts.count > 0 && (
            <button
              type="button"
              onClick={() => isHighlightingConflicts ? clearHighlight() : setHighlightedEntityCodes(conflicts.codes)}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingConflicts ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              {conflicts.count} conflicts
            </button>
          )}
        </div>
      )}

      <div className="border-t border-hairline pt-3">
        <RegionSummaryPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Apply highlight stroke in `<Geography>`**

In both `WorldMapView.tsx` and `DrillDownMapView.tsx`, inside the geography `memo` (`CountryGeo` / `StateGeo`), call `useEntityHighlight(entityCode)` and use it to add a 2px brand stroke when truthy. Pin and highlight can both apply — the highlight stroke should win when both are true. Update the `stroke=` and `strokeWidth=` props:

```tsx
const isHighlighted = useEntityHighlight(entityCode);
// …
stroke={isHighlighted ? 'var(--color-brand)' : isPinned ? 'var(--color-brand)' : countryStroke}
strokeWidth={isHighlighted ? 2 : isPinned ? 1.5 : countryStrokeWidth}
```

Add `useEntityHighlight` to the import from `@/hooks/useTerritoryStore` in both files.

- [ ] **Step 4: Add Esc-to-clear**

In each map view, add a `useEffect` near the existing hooks that listens for `Escape` and clears the highlight + unpins:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearHighlight();
      setPinnedEntityIso(null);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [clearHighlight, setPinnedEntityIso]);
```

`clearHighlight` and `setPinnedEntityIso` come from `useActions()` already (or destructure them).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Manually: confirm gaps/conflicts pills appear when applicable; clicking highlights paths; clicking again or pressing Esc clears.

- [ ] **Step 6: Commit**

```bash
git add store/slices/mapUiSelectors.ts components/territory/map/MapInfoRail.tsx components/territory/map/WorldMapView.tsx components/territory/map/DrillDownMapView.tsx
git commit -m "Add coverage-gap and conflict badges with transient highlight"
```

---

### Task 13: Build `MapLabels` overlay and Toolbar toggle

**Files:**
- Create: `components/territory/map/MapLabels.tsx`
- Modify: `components/territory/map/WorldMapView.tsx`
- Modify: `components/territory/map/DrillDownMapView.tsx`
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Write the overlay**

Create `components/territory/map/MapLabels.tsx`:

```tsx
'use client';

import { memo, useMemo } from 'react';
import { geoBounds, geoPath, type GeoProjection } from 'd3-geo';

interface LabelGeo {
  rsmKey: string;
  name: string;
  geometry: unknown;
}

interface Props {
  geographies: LabelGeo[];
  projection: GeoProjection;
  zoom: number;
}

interface Rect { x1: number; y1: number; x2: number; y2: number }

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
}

/**
 * Cull labels that don't fit inside their projected bbox at the current zoom,
 * then a single-pass collision cull keeping the wider bboxes first.
 *
 * Labels render as `text` siblings inside the same <ZoomableGroup> so they
 * inherit the zoom transform.
 */
export default memo(function MapLabels({ geographies, projection, zoom }: Props) {
  const placed = useMemo(() => {
    const path = geoPath(projection);
    type Candidate = { name: string; cx: number; cy: number; w: number; h: number; bboxW: number };

    const candidates: Candidate[] = [];
    for (const g of geographies) {
      const centroid = path.centroid(g.geometry as Parameters<typeof path.centroid>[0]);
      if (!centroid || isNaN(centroid[0])) continue;
      const [b0, b1] = geoBounds(g.geometry as Parameters<typeof geoBounds>[0]);
      const tl = projection([b0[0], b1[1]]);
      const br = projection([b1[0], b0[1]]);
      if (!tl || !br) continue;
      const bboxW = Math.abs(br[0] - tl[0]) * zoom;
      const fontPx = 10;
      const w = g.name.length * fontPx * 0.55;
      const h = fontPx * 1.1;
      if (bboxW < w + 4) continue; // doesn't fit
      candidates.push({ name: g.name, cx: centroid[0], cy: centroid[1], w, h, bboxW });
    }

    // Greedy collision cull: prefer larger-bbox features (more important on screen).
    candidates.sort((a, b) => b.bboxW - a.bboxW);
    const accepted: Candidate[] = [];
    const rects: Rect[] = [];
    for (const c of candidates) {
      const r: Rect = {
        x1: c.cx - c.w / 2,
        y1: c.cy - c.h / 2,
        x2: c.cx + c.w / 2,
        y2: c.cy + c.h / 2,
      };
      if (rects.some((existing) => rectsOverlap(existing, r))) continue;
      accepted.push(c);
      rects.push(r);
    }
    return accepted;
  }, [geographies, projection, zoom]);

  return (
    <g style={{ pointerEvents: 'none' }}>
      {placed.map((p) => (
        <text
          key={p.name}
          x={p.cx}
          y={p.cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10 / zoom}
          fontWeight={500}
          fill="rgb(51 65 85 / 0.85)"
        >
          {p.name}
        </text>
      ))}
    </g>
  );
});
```

- [ ] **Step 2: Mount in `WorldMapView`**

In `WorldMapView.tsx`, inside `<Geographies>`'s render function — right after the `geographies.map((geo) => <CountryGeo … />)` block — return a fragment that also contains `<MapLabels />`. The `Geographies` render-prop receives `{ geographies, projection }` so destructure both:

```tsx
import { useShowLabels } from '@/hooks/useTerritoryStore';
import MapLabels from './MapLabels';

// inside WorldMapView:
const showLabels = useShowLabels();

// inside <Geographies>:
{({ geographies, projection }) => (
  <>
    {geographies.map((geo) => (
      <CountryGeo /* …existing props… */ />
    ))}
    {showLabels && (
      <MapLabels
        geographies={geographies as unknown as { rsmKey: string; name: string; geometry: unknown }[]}
        projection={projection}
        zoom={zoom}
      />
    )}
  </>
)}
```

- [ ] **Step 3: Mount in `DrillDownMapView`**

Same pattern in `DrillDownMapView.tsx`, using the state geographies.

- [ ] **Step 4: Add Labels toggle in Toolbar**

In `components/territory/toolbar/Toolbar.tsx`, add a 28px ghost button right of the metric pill. Read showLabels via `useShowLabels()` and call `toggleShowLabels` from `useActions()`:

```tsx
import { useShowLabels } from '@/hooks/useTerritoryStore';
// …
const showLabels = useShowLabels();
const { toggleShowLabels } = useActions();

// In the JSX, near the metric pill:
<button
  type="button"
  onClick={toggleShowLabels}
  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-hairline ${showLabels ? 'bg-brand-soft text-brand' : 'bg-panel hover:bg-canvas'}`}
  aria-label={showLabels ? 'Hide labels' : 'Show labels'}
  aria-pressed={showLabels}
>
  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {showLabels ? (
      <>
        <ellipse cx="8" cy="8" rx="6" ry="3.5" />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      </>
    ) : (
      <>
        <path d="M2 8c1.5-2 3.5-3 6-3 1 0 1.9.15 2.7.4" />
        <path d="M14 8c-1.4 1.9-3.3 2.9-5.7 3" />
        <path d="M3 3l10 10" />
      </>
    )}
  </svg>
</button>
```

If `Toolbar.tsx` already places metric controls inside a specific group, place the new button alongside them rather than introducing a new group.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Run `npm run dev` and confirm: clicking the new toggle in the toolbar surfaces country/state labels; zoom in/out — labels cull cleanly without piling up.

- [ ] **Step 6: Commit**

```bash
git add components/territory/map/MapLabels.tsx components/territory/map/WorldMapView.tsx components/territory/map/DrillDownMapView.tsx components/territory/toolbar/Toolbar.tsx
git commit -m "Add opt-in collision-culled map labels with toolbar toggle"
```

---

### Task 14: Final smoke pass and build check

**Files:**
- None (verification only)
- Modify: `vegeta/.claude/docs/task-summary.md` — append a sub-project 2 shipping note in Part 8 mirroring the sub-project 1 entry.

- [ ] **Step 1: Manual smoke**

Run `npm run dev`. Confirm in order:

1. Default load (count metric): country fills match team colors (no regression vs. main).
2. Toolbar metric pill → switch to a numeric field. Country fills shift to amber→indigo gradient. ChoroplethScale appears at top of right rail with min/max labels.
3. Hover regions → RegionSummaryPanel updates with name, geo trail, count, top 3 metric totals (active metric pinned), top 3 owners.
4. Click a region → it pins (1.5px brand stroke); the panel stays. Click empty ocean → unpins.
5. Toggle Labels in toolbar → country names render, sized stable through zoom; cull fires correctly at low and high zooms.
6. If gaps/conflicts exist: click each pill → entities highlight (2px brand stroke). Press Esc or click pill again → clears.
7. Drill into a country → state-level choropleth, summary panel, and gaps/conflicts continue to work.
8. Switch workspace via WorkspaceSwitcher → rail state resets cleanly.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Update task-summary**

Append a new section under "Part 8" of `vegeta/.claude/docs/task-summary.md` summarizing what shipped, mirroring the sub-project 1 entry's tone (one paragraph + bullet list of touched files / behavior). Note the verification status (lint/tsc/build clean; manual smoke complete).

- [ ] **Step 4: Commit**

```bash
git add vegeta/.claude/docs/task-summary.md
git commit -m "Document sub-project 2 (info density) shipping notes"
```

---

## Self-review notes

- **Spec coverage:** Q1 (mode toggle) → Tasks 3–7. Q2 (opt-in name labels) → Task 13. Q3 (hover/pin) → Tasks 6, 7, 10, 12. Q4 (country/state mismatch) → Task 12. Q5 (consolidated rail + transient highlight) → Tasks 8, 11, 12.
- **Naming consistency:** `useChoroplethScale` returns `{ active, scale, fieldDef }` everywhere it's used; `useChoroplethFillColor(entityCode, scaleMax, active)` signature matches across both map views; `setPinnedEntityIso` / `togglePinnedEntityIso` / `setHighlightedEntityCodes` / `clearHighlight` actions used consistently in Tasks 6, 7, 12.
- **Risk callout:** Tasks 10's `useRegionRollup` and 12's `useAssignmentConflicts` reach into store fields (`members`, `teams`, `accounts.repId`, `subregions.stateCodes`, `geoNodes.parentId`) whose exact shapes I've inferred from existing code but not exhaustively verified. The agent executing these tasks should read `types/territory.ts` first and adjust property names if they differ.
- **No persistence keys added** — `mapUiPersistKeys` in Task 1 deliberately leaves out the new fields per spec §10.
