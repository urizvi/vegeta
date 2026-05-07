# Territory rework — Sub-project 2: Information density on the map

**Date:** 2026-05-06
**Status:** Spec approved; awaiting implementation plan
**Predecessors:** Sub-project 1 (visual polish) — shipped
**Successors:** Sub-project 3 (interaction/navigation), Sub-project 4 (sidebar editing)

## Goal

Make the territory map readable at a glance. Today the map shows assignment color (who owns what) and bubble-sized account counts. We want to layer in: a metric-driven choropleth, optional country labels, a region-detail summary panel, coverage-gap and conflict surfacing, and a quantitative scale on the legend — without regressing the existing "who owns what" view.

## Decisions

| # | Question | Choice |
|---|---|---|
| 1 | Choropleth color model | **C — Mode toggle.** When `metric === 'count'` (default), keep team-color paint. When a real metric is selected, switch to a global sequential ramp `amber-soft → brand`. |
| 2 | On-map labels | **A — Opt-in, name-only.** Hidden by default; toolbar toggle turns them on. Labels show place name only, never metric value. |
| 3 | Summary-panel trigger | **A — Hover updates, click pins.** Hovering a region updates the panel; clicking pins it until clicking another region or empty ocean. |
| 4 | Conflict definition | **A — Country/state owner mismatch.** A conflict is a country assigned to team X with one or more of its states assigned to team Y. |
| 5 | Right-rail layout | **A — Consolidated rail.** Legend (with new gradient scale + gap badges) and region-summary card stack in a single right-rail container. Old MapLegend corner slot is removed. Coverage-gap highlight uses a transient `highlightedEntityCodes` field on `mapUiSlice` (not a new selection slice — sub-project 3 will introduce that). |

## Architecture

### New files

- `components/territory/map/MapInfoRail.tsx` — right-rail container. Composes legend + scale + summary card in a `flex flex-col gap-3` layout, reusing `theme.legendClass` chrome.
- `components/territory/map/RegionSummaryPanel.tsx` — region detail card driven by `useFocusedEntityIso()` + `useRegionRollup()`.
- `components/territory/map/ChoroplethScale.tsx` — gradient bar with min/max numerals; renders only when a real metric is active.
- `components/territory/map/MapLabels.tsx` — overlay sibling of `<Geographies>` rendering collision-culled country/state names.
- `lib/choropleth.ts` — pure helpers: `buildChoroplethScale(stats, metric, fieldDefs) → { min, max, ramp, fillFor(val) }`. Sequential ramp interpolates `--color-accent-soft` → `--color-brand` (OKLCH if available, RGB lerp fallback).
- `hooks/useChoroplethScale.ts` — reads metric + stats, memoizes scale. Returns `{ active: boolean, scale }`.

### Modified files

- `store/slices/mapUiSlice.ts` — add `showLabels: boolean`, `pinnedEntityIso: string | null`, `highlightedEntityCodes: string[]`, plus `setShowLabels`, `setPinnedEntityIso`, `setHighlightedEntityCodes`, `clearHighlight`.
- `store/slices/mapUiSelectors.ts` — `useFocusedEntityIso`, `useRegionRollup(iso)`, `useCoverageGaps()`, `useAssignmentConflicts()`, `useEntityHighlight(code)`, `useShowLabels`.
- `store/selectors.ts` — new `useChoroplethFillColor(entityCode)` wrapping `useCountryFillColor` with metric-mode branch.
- `components/territory/map/WorldMapView.tsx` and `DrillDownMapView.tsx` — mount `<MapInfoRail />` (top-right), wire pin via path click, render `<MapLabels />` overlay when `showLabels` is true. Replace `useCountryFillColor` with `useChoroplethFillColor` on `<Geography>`.
- `components/territory/map/MapLegend.tsx` — drop standalone chrome wrapper; export bare list for `MapInfoRail` to compose. Old top-left mount points removed.
- `components/territory/toolbar/Toolbar.tsx` — add 28px ghost "Labels" toggle (eye-open / eye-closed glyph) immediately right of the metric pill.
- `components/territory/map/AccountLayer.tsx` — no behavioral change (bubbles continue to encode count via radius and team color).

## Components

### `MapInfoRail`

Right-side rail, fixed top-right, ~300px wide, anchored inside the map container with `theme.legendClass`-style chrome. Children, top-to-bottom:

1. `<ChoroplethScale />` — only when `useChoroplethScale().active`.
2. Legend body — geo-root color dots + names + Unassigned row (the existing `MapLegend` content, now bare).
3. Coverage-gap badges — `[● 12 unassigned]` (slate-400 dot) and `[△ 3 conflicts]` (amber dot, hidden when count === 0).
4. `<RegionSummaryPanel />` — separated from the legend block by a `divide-hairline` rule.

### `RegionSummaryPanel`

Reads `useFocusedEntityIso()` (= `pinnedEntityIso ?? hoveredEntityIso`). When null, renders a quiet placeholder ("Hover a region to see details"). Otherwise:

- **Header** — region name + breadcrumb of the owning Geo trail (e.g., `EMEA › Germany`). Trail derived by walking `geoNodes` from the assigned root downward.
- **Account count** — `n {entityNounPlural}` via `useEntityNoun()`. Unassigned regions get a small "Unassigned" badge above the count.
- **Top-3 metric totals** — for each numeric `FieldDefinition` with `entity: 'account'`, sum across accounts in region; show top 3 by total. Format via `formatFieldValue`. When a metric is active in the toolbar, that metric is pinned to position 1.
- **Top-3 owners** — labelled per `useOwnerNoun()`. Counts of accounts per `rep_id` within the region; top 3 with their team color dot.
- **Footer** — `→ {entityNounPlural} in this region` link routing to `/accounts?filter=country:US` (world view) or `/accounts?filter=state:US-CA` (drill-down). Uses the existing accounts-page filter param convention.

When a region is pinned, its `<Geography>` gets a 1.5px brand stroke; pure hover gets a 1px slate-700/40 stroke. Clicking the map background (svg root, outside any `<Geography>`) clears the pin; an `onClick` on the `<ComposableMap>` root that `e.target === e.currentTarget` filters this.

### `ChoroplethScale`

12px-tall horizontal gradient bar (CSS `linear-gradient` matching `scale.ramp`), with `min` and `max` numerals at each end formatted via `formatFieldValue(val, fieldDef)`, and the metric's display label above. ~260px wide.

### `MapLabels`

Sibling of `<Geographies>` inside the same `<ZoomableGroup>` so labels transform with zoom. For each rendered geo:

1. Project the geometry's bbox to screen coords.
2. Estimate text width (`name.length * 6.2 / zoom` is good enough).
3. Skip if `screenWidth < estimatedTextWidth + 4px padding`.
4. Run a single-pass interval-tree collision cull on label rects (sufficient for ~250 countries / ~50 states; no full quadtree needed).

Font: matches `MapTooltip` numerals (`text-[10px] font-medium fill-slate-700/85`), scaled by `1/zoom`. `pointer-events: none`.

## Data flow

```
Toolbar metric pill ──► mapUiSlice.mapAccountMetric
                          │
                          ├─► useChoroplethScale ──► ChoroplethScale (gradient bar)
                          │                       └► useChoroplethFillColor ──► Geography fill
                          │
Geography hover ─────────► mapUiSlice.hoveredEntityIso ─┐
Geography click ─────────► mapUiSlice.pinnedEntityIso  ─┴► useFocusedEntityIso
                                                               │
                                                               └► useRegionRollup
                                                                    │
                                                                    └► RegionSummaryPanel
geoNodes/assignments ─┬─► useCoverageGaps ─┐
                      └─► useAssignmentConflicts ─┴─► coverage badges → highlightedEntityCodes
                                                                            │
                                                                            └► useEntityHighlight → Geography stroke
Toolbar Labels toggle ──► mapUiSlice.showLabels ──► MapLabels overlay (collision-culled)
```

All reads use existing `useTerritoryStore` + `useShallow` patterns. No new persistence keys — rail UI state is session-only.

### Choropleth fill logic

```
useChoroplethFillColor(entityCode):
  if (metric === 'count' || metric == null)         → existing team-color behavior
  else if (assignment exists for entityCode)        → ramp(value), where
                                                       value = getEntityMetricVal(stats[entityCode], metric)
                                                       t     = value / scale.max  (0 → near-white tint, 1 → brand)
  else                                              → unassignedFill (slate-400)
```

`null/0` values render as a near-white tint at `t = 0`, distinct from unassigned slate, so "assigned but zero" reads differently from "unassigned."

### Coverage selectors

- `useCoverageGaps()` — counts entities (countries in world view; states in drill-down) with no assignment. Returns `{ count, codes: string[] }`.
- `useAssignmentConflicts()` — finds (country, state) pairs where the country is assigned to team X but the state's resolved assignment differs. Returns `{ count, codes: string[] }` with state codes like `US:US-CA`. The badge appears in both world and drill-down views; in world view, clicking highlights the *parent countries* that contain conflicts, in drill-down it highlights the conflicting state paths directly.

Clicking a badge sets `mapUiSlice.highlightedEntityCodes`. Each `<Geography>` reads `useEntityHighlight(code)` and applies a 2px brand stroke + `mix-blend-multiply` overlay when highlighted. Clicking the same badge again, clicking elsewhere, or pressing `Esc` clears it.

## Error handling & edge cases

- **Empty workspace / no accounts** — `useChoroplethScale` returns `active: false`; `RegionSummaryPanel` shows "No {plural} here yet" when rollup is null.
- **Metric removed mid-session** (field def deleted) — `useChoroplethScale` checks the metric still exists in `fieldDefs`; falls back to `count` mode silently. Same guard the toolbar already applies.
- **Drill-down state-level metric** — `getEntityMetricVal` already keys on full state codes (`US:US-CA`); the scale is built per view (world stats or drill-down stats), not reused.
- **Stale `pinnedEntityIso`** when assignments change — iso still resolves to a region; rollup recomputes. No invalidation needed.
- **Label hover flicker** — labels are `pointer-events: none` (matching bubbles).
- **Workspace switch** — `pinnedEntityIso`, `highlightedEntityCodes`, `showLabels` reset along with existing slice hydration on workspace change.

## Testing

No formal test suite exists in vegeta (per `vegeta/CLAUDE.md`). Verification:

- `npm run lint` clean
- `npx tsc --noEmit` clean
- `npm run build` succeeds
- Manual smoke (matches `task-summary.md` Part 8 conventions):
  - Toggle metric pill → choropleth appears, scale shows min/max, country fills update.
  - Default `count` metric → team-color paint preserved (no regression).
  - Hover regions → summary updates; click → pins; click empty ocean → unpins.
  - Toggle Labels → country names appear, collision-cull respected at multiple zooms.
  - Click "n unassigned" badge → unassigned countries highlighted; click again or Esc → cleared.
  - Click "n conflicts" badge → conflicting states highlighted (drill-down).
  - Switch to drill-down → all features still work on state paths.
  - Switch workspace → rail state resets cleanly.

## Out of scope

- Multi-select / lasso (sub-project 3).
- Keyboard navigation, focus rings, momentum pan/zoom (sub-project 3).
- Sidebar tree editing (sub-project 4).
- Persisting label toggle / pin / highlight across sessions.
- New metric types beyond what the field-def system already exposes.
- Email/calendar integration, reporting, public API (Phase deferrals — see `project_crm_evolution.md`).
