# MapInfoRail rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obstructing 260px `MapInfoRail` with a compact bottom-left chips dock (legend/scale/gaps/conflicts) plus a top-right `PinnedRegionCard` that opens only on region click.

**Architecture:** Three independent overlays mounted by `WorldMapView` and `DrillDownMapView`: existing `MapTooltip` (hover preview, unchanged), new `MapChipsDock` (always-on info chips with click-to-expand popovers), and new `PinnedRegionCard` (region summary, opens on click, dismisses on click/Esc). `MapInfoRail` is deleted. Region click → pin and Esc → clear-pin are *already* implemented in both views; this plan only swaps the visual surfaces.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Zustand (existing `mapUiSlice`).

**Verification model:** This project has no test suite (see `CLAUDE.md`). Verification per task is `tsc --noEmit` (via `npm run lint` which also runs `tsc`) + `npm run build`. Manual UI smoke is the user's responsibility after the plan completes.

**Spec:** `docs/superpowers/specs/2026-05-12-map-info-rail-rework-design.md`

---

## File Structure

New:
- `components/territory/map/MapChip.tsx` — reusable presentational pill (no popover responsibility)
- `components/territory/map/MapChipsDock.tsx` — bottom-left container, owns popover state, mounts the four chips
- `components/territory/map/PinnedRegionCard.tsx` — top-right pinned card wrapping `RegionSummaryPanel`

Modified:
- `components/territory/map/RegionSummaryPanel.tsx` — accept an optional `iso` prop; fall back to current `useFocusedEntityIso()` only when prop is omitted
- `components/territory/map/WorldMapView.tsx` — swap `<MapInfoRail view="world"/>` for `<MapChipsDock view="world"/>` + `<PinnedRegionCard view="world"/>`
- `components/territory/map/DrillDownMapView.tsx` — same swap with `view="drilldown"` and `drilldownIso2={countryCode}`

Deleted:
- `components/territory/map/MapInfoRail.tsx`

No state slice changes — `pinnedEntityIso`, `togglePinnedEntityIso`, `setPinnedEntityIso`, `usePinnedEntityIso` all exist already.

---

## Task 1: `MapChip` presentational pill

**Files:**
- Create: `components/territory/map/MapChip.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { forwardRef, type ReactNode } from 'react';

interface Props {
  label: string;
  glance: ReactNode;
  active: boolean;
  onClick: () => void;
}

const MapChip = forwardRef<HTMLButtonElement, Props>(function MapChip(
  { label, glance, active, onClick }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={
        `inline-flex items-center gap-1.5 rounded-full border border-hairline bg-panel px-2.5 py-1 text-xs transition-colors hover:bg-canvas ` +
        (active ? 'ring-1 ring-brand bg-brand/5' : '')
      }
    >
      {glance}
    </button>
  );
});

export default MapChip;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: clean (no new errors in `components/territory/map/MapChip.tsx`).

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/MapChip.tsx
git commit -m "feat(territory): add MapChip presentational pill"
```

---

## Task 2: Make `RegionSummaryPanel` driven by an explicit iso

**Files:**
- Modify: `components/territory/map/RegionSummaryPanel.tsx`

Goal: stop coupling the panel to `useFocusedEntityIso()` (which falls back to hover). Allow the caller to pass the iso it cares about (the pinned one). Preserve existing behavior when no prop is passed so any other consumer continues to work.

- [ ] **Step 1: Add optional `iso` prop with fallback**

Replace the top of the file:

```tsx
'use client';

import Link from 'next/link';
import {
  useFocusedEntityIso,
  useMapTheme,
} from '@/store/slices/mapUiSelectors';
import { useRegionRollup } from '@/store/slices/mapUiSelectors';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useOwnerNoun } from '@/hooks/useOwnerNoun';
import { formatFieldValue } from '@/lib/accountFields';

interface Props {
  /** Override the iso to summarize. Defaults to `useFocusedEntityIso()` (pin-or-hover). */
  iso?: string | null;
}

export default function RegionSummaryPanel({ iso: isoProp }: Props = {}) {
  const focusedIso = useFocusedEntityIso();
  const iso = isoProp !== undefined ? isoProp : focusedIso;
  const rollup = useRegionRollup(iso);
  const entityPlural = useEntityNoun('plural');
  const ownerNoun = useOwnerNoun();
  const theme = useMapTheme();

  if (!iso || !rollup) return null;
  // …rest of the file unchanged
```

The rest of the file (the JSX from `const isState = iso.includes(':');` onward) is untouched.

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/RegionSummaryPanel.tsx
git commit -m "refactor(territory): RegionSummaryPanel accepts explicit iso prop"
```

---

## Task 3: `PinnedRegionCard`

**Files:**
- Create: `components/territory/map/PinnedRegionCard.tsx`

The card mounts only when `pinnedEntityIso` is set. It uses `usePinnedEntityIso` directly (no hover fallback). Esc-to-dismiss is already handled inside the views (`WorldMapView.tsx:122` and `DrillDownMapView`); the card also exposes a ✕ button.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { usePinnedEntityIso, useMapTheme } from '@/store/slices/mapUiSelectors';
import { useActions } from '@/hooks/useTerritoryStore';
import RegionSummaryPanel from './RegionSummaryPanel';

export default function PinnedRegionCard() {
  const iso = usePinnedEntityIso();
  const theme = useMapTheme();
  const { setPinnedEntityIso } = useActions();

  if (!iso) return null;

  return (
    <div
      className={`${theme.legendClass} absolute right-4 top-16 z-10 w-[280px] max-h-[calc(100%-7rem)] overflow-y-auto`}
      role="dialog"
      aria-label="Pinned region details"
    >
      <div className="flex items-center justify-end -mb-1">
        <button
          type="button"
          onClick={() => setPinnedEntityIso(null)}
          aria-label="Close pinned region"
          className="rounded p-1 opacity-60 hover:opacity-100 hover:bg-canvas"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>
      </div>
      <RegionSummaryPanel iso={iso} />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/PinnedRegionCard.tsx
git commit -m "feat(territory): add PinnedRegionCard"
```

---

## Task 4: `MapChipsDock` with four chip popovers

**Files:**
- Create: `components/territory/map/MapChipsDock.tsx`

The dock owns `openChip: 'legend' | 'scale' | 'gaps' | 'conflicts' | null`. Outside-click and re-click close the open popover. Each chip's popover is an `absolute` element positioned above the chip (i.e. `bottom-full mb-2`). The gap/conflict chips' popovers contain the existing highlight toggle buttons (lifted from `MapInfoRail.tsx`).

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useMapTheme, useActions, useHighlightedEntityCodes,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import {
  useCoverageGaps, useAssignmentConflicts,
} from '@/store/slices/mapUiSelectors';
import MapLegend from './MapLegend';
import ChoroplethScale from './ChoroplethScale';
import MapChip from './MapChip';

interface Props {
  view: 'world' | 'drilldown';
  drilldownIso2?: string;
}

type OpenChip = 'legend' | 'scale' | 'gaps' | 'conflicts' | null;

export default function MapChipsDock({ view, drilldownIso2 }: Props) {
  const theme = useMapTheme();
  const { active, scale, fieldDef } = useChoroplethScale(view, drilldownIso2);
  const gaps = useCoverageGaps(view, drilldownIso2);
  const conflicts = useAssignmentConflicts(view, drilldownIso2);
  const { setHighlightedEntityCodes, clearHighlight } = useActions();
  const highlighted = useHighlightedEntityCodes();
  const [openChip, setOpenChip] = useState<OpenChip>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const isHighlightingGaps =
    highlighted.length > 0 &&
    highlighted.length === gaps.codes.length &&
    gaps.codes.every((c) => highlighted.includes(c));
  const isHighlightingConflicts =
    highlighted.length > 0 &&
    highlighted.length === conflicts.codes.length &&
    conflicts.codes.every((c) => highlighted.includes(c));

  useEffect(() => {
    if (!openChip) return;
    function onDocClick(e: MouseEvent) {
      if (!dockRef.current) return;
      if (e.target instanceof Node && !dockRef.current.contains(e.target)) {
        setOpenChip(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openChip]);

  function toggle(chip: Exclude<OpenChip, null>) {
    setOpenChip((cur) => (cur === chip ? null : chip));
  }

  return (
    <div
      ref={dockRef}
      className="absolute left-4 bottom-4 z-10 flex items-end gap-2"
    >
      <ChipWithPopover
        open={openChip === 'legend'}
        popover={<MapLegend />}
        theme={theme}
      >
        <MapChip
          label="Legend"
          active={openChip === 'legend'}
          onClick={() => toggle('legend')}
          glance={<span className="font-medium">Legend</span>}
        />
      </ChipWithPopover>

      {active && scale && fieldDef && (
        <ChipWithPopover
          open={openChip === 'scale'}
          popover={<ChoroplethScale scale={scale} fieldDef={fieldDef} />}
          theme={theme}
        >
          <MapChip
            label="Choropleth scale"
            active={openChip === 'scale'}
            onClick={() => toggle('scale')}
            glance={
              <span
                aria-hidden="true"
                className="inline-block h-2 w-8 rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--color-amber-400), var(--color-brand))' }}
              />
            }
          />
        </ChipWithPopover>
      )}

      {gaps.count > 0 && (
        <ChipWithPopover
          open={openChip === 'gaps'}
          popover={
            <button
              type="button"
              onClick={() => (isHighlightingGaps ? clearHighlight() : setHighlightedEntityCodes(gaps.codes))}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingGaps ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              {gaps.count} unassigned — highlight
            </button>
          }
          theme={theme}
        >
          <MapChip
            label={`${gaps.count} coverage gaps`}
            active={openChip === 'gaps' || isHighlightingGaps}
            onClick={() => toggle('gaps')}
            glance={
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                <span className="font-mono tabular-nums">{gaps.count}</span>
              </>
            }
          />
        </ChipWithPopover>
      )}

      {conflicts.count > 0 && (
        <ChipWithPopover
          open={openChip === 'conflicts'}
          popover={
            <button
              type="button"
              onClick={() => (isHighlightingConflicts ? clearHighlight() : setHighlightedEntityCodes(conflicts.codes))}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingConflicts ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              {conflicts.count} conflicts — highlight
            </button>
          }
          theme={theme}
        >
          <MapChip
            label={`${conflicts.count} assignment conflicts`}
            active={openChip === 'conflicts' || isHighlightingConflicts}
            onClick={() => toggle('conflicts')}
            glance={
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-mono tabular-nums">{conflicts.count}</span>
              </>
            }
          />
        </ChipWithPopover>
      )}
    </div>
  );
}

interface PopoverProps {
  open: boolean;
  popover: ReactNode;
  theme: { legendClass: string };
  children: ReactNode;
}

function ChipWithPopover({ open, popover, theme, children }: PopoverProps) {
  return (
    <div className="relative">
      {open && (
        <div
          className={`${theme.legendClass} absolute left-0 bottom-full mb-2 w-[240px]`}
          role="dialog"
        >
          {popover}
        </div>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/MapChipsDock.tsx
git commit -m "feat(territory): add MapChipsDock with legend/scale/gaps/conflicts popovers"
```

---

## Task 5: Swap in `WorldMapView`

**Files:**
- Modify: `components/territory/map/WorldMapView.tsx`

- [ ] **Step 1: Replace the `MapInfoRail` import**

Change:

```tsx
import MapInfoRail from './MapInfoRail';
```

to:

```tsx
import MapChipsDock from './MapChipsDock';
import PinnedRegionCard from './PinnedRegionCard';
```

- [ ] **Step 2: Replace the mount site**

Find the `<MapInfoRail view="world" />` line (currently `WorldMapView.tsx:406`) and replace with:

```tsx
<MapChipsDock view="world" />
<PinnedRegionCard />
```

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/territory/map/WorldMapView.tsx
git commit -m "feat(territory): swap MapInfoRail for chips dock + pinned card in world view"
```

---

## Task 6: Swap in `DrillDownMapView`

**Files:**
- Modify: `components/territory/map/DrillDownMapView.tsx`

- [ ] **Step 1: Locate the rail mount**

Run: `grep -n "MapInfoRail" components/territory/map/DrillDownMapView.tsx`
Expected: one import line and one mount line (`<MapInfoRail view="drilldown" drilldownIso2={…}/>`).

- [ ] **Step 2: Replace the import**

Change `import MapInfoRail from './MapInfoRail';` to:

```tsx
import MapChipsDock from './MapChipsDock';
import PinnedRegionCard from './PinnedRegionCard';
```

- [ ] **Step 3: Replace the mount site**

Replace `<MapInfoRail view="drilldown" drilldownIso2={countryCode} />` (or whatever the local prop name is — confirm from grep output) with:

```tsx
<MapChipsDock view="drilldown" drilldownIso2={countryCode} />
<PinnedRegionCard />
```

- [ ] **Step 4: Verify**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/territory/map/DrillDownMapView.tsx
git commit -m "feat(territory): swap MapInfoRail for chips dock + pinned card in drilldown view"
```

---

## Task 7: Delete `MapInfoRail` + final verification

**Files:**
- Delete: `components/territory/map/MapInfoRail.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "MapInfoRail" --include="*.ts" --include="*.tsx" .`
Expected: no matches (besides the file itself).

- [ ] **Step 2: Delete the file**

```bash
git rm components/territory/map/MapInfoRail.tsx
```

- [ ] **Step 3: Run full verification**

```bash
npm run lint
npm run build
```

Expected: both clean. If build fails on a leftover import, grep again and fix.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(territory): remove MapInfoRail (replaced by chips dock + pinned card)"
```

- [ ] **Step 5: Update task-summary**

Append a section to `.claude/docs/task-summary.md` under the territory subproject area describing the rail rework, naming the three new components, noting the deleted file, and listing manual smoke items: pin/unpin/swap by region click, Esc clears pin, each chip popover opens/closes correctly, gap/conflict highlight buttons still work from chip popovers, no obstruction at narrow viewport widths.

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log map info rail rework"
```

---

## Self-review notes

- **Spec coverage** — Section by section: architecture (Tasks 4+3+5+6+7), components (Tasks 1–4, 7), state (no work needed; existing slice already has `pinnedEntityIso` + actions; spec's proposed rename is unnecessary), interaction (Esc + pin click already implemented in views — spec's "extend Toolbar Esc cascade" is moot for this work, the views handle Esc themselves), file touches (all listed in File Structure), verification (Task 7 step 3).
- **Deviation from spec** — Spec proposed adding `pinRegion`/`unpinRegion` actions and renaming `focusedEntityIso`. Actual state surface already has `pinnedEntityIso`, `setPinnedEntityIso`, `togglePinnedEntityIso`, and `usePinnedEntityIso`, and `useFocusedEntityIso` is a (pin-or-hover) derived selector that `RegionSummaryPanel` was using. The plan instead threads an explicit `iso` prop into `RegionSummaryPanel` (Task 2) so the pinned card uses `usePinnedEntityIso` directly without touching the slice. No behavior regressions: `useFocusedEntityIso` still resolves the same way for any other caller.
- **Esc cascade** — Spec proposed extending Toolbar's cascade with chip + pin entries. Reality: chip popovers dismiss on outside-click and re-click (Task 4); pin is already cleared by the per-view Esc handler (`WorldMapView.tsx:122`). No Toolbar changes required. Trade-off: pressing Esc with a chip popover open does not close just the popover — it would clear-pin if any (since the view's Esc handler fires). This is acceptable for the first pass; a follow-up could move chip Esc into the dock with `stopImmediatePropagation`.
- **No placeholders** — every code step contains the actual code to write.
