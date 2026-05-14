# Territory Polish-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SelectionChip` in `MapChipsDock` so the multi-region selection count and contents are visible from the map; add `/` and `g` keyboard shortcuts for focusing the Geos sidebar search and tree.

**Architecture:** New `SelectionChip` consumes existing `selectionSlice` selectors and reuses the `MapChip` + `ChipWithPopover` idioms. A new best-effort `useRegionNameByIso` selector resolves state names from `stateLoader.ts`'s existing cache (country names deferred to Polish-B). Toolbar extends its existing keydown switch with two bare-key cases targeting a stable `id` on `SidebarSearchInput` and a `data-geo-node-row` attribute on `GeoNodeRow`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Zustand, Tailwind v4. No test framework configured — verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus user manual smoke per task.

**Spec:** `docs/superpowers/specs/2026-05-13-territory-polish-a-design.md`.

---

## File Structure

New:
- `components/territory/map/SelectionChip.tsx` — chip + popover for the active selection set.

Modified:
- `store/slices/mapUiSelectors.ts` — adds `useRegionNameByIso(iso)`.
- `components/territory/map/MapChipsDock.tsx` — adds `'selection'` to `OpenChip`, mounts `<SelectionChip />`.
- `components/territory/toolbar/Toolbar.tsx` — adds `/` and `g` cases to existing keydown handler.
- `components/territory/map/MapHelpPopover.tsx` — appends two rows.
- `components/territory/sidebar/SidebarSearchInput.tsx` — accepts optional `id` prop.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — passes `id="geo-sidebar-search"`.
- `components/territory/sidebar/GeoNodeRow.tsx` — adds `data-geo-node-row`, `tabIndex={-1}`, focus-visible ring on row root div.

No slice schema changes. No new dependencies.

---

## Task 1: `useRegionNameByIso` selector

**Files:**
- Modify: `store/slices/mapUiSelectors.ts` (append below existing exports, before the `RegionRollup` block — around line 35)

- [ ] **Step 1: Add the selector**

Append after the existing `useEntityHighlight` export (around line 34):

```ts
import { getStatesForCountry } from '@/lib/stateLoader';

/**
 * Best-effort name resolver for selection-chip popover rows.
 *
 * - State codes (`"US:US-CA"`): split on `:`, look up the state code in
 *   `stateLoader`'s cache. Returns `name` if cached, else `null`.
 * - Country codes (`"US"`): not resolved here. Capturing country
 *   display names requires slice changes scheduled for Polish-B.
 * - Stale / unknown codes: `null`.
 */
export const useRegionNameByIso = (iso: string): string | null => {
  // Subscribe to nothing — stateLoader cache is module-scoped and
  // populated as a side effect of drill-down. Selection popover
  // re-renders when selectedEntityCodes changes (its parent
  // subscriber), and a missed cache miss just shows the code, which
  // is acceptable per spec.
  if (!iso.includes(':')) return null;
  const [iso2, stateCode] = iso.split(':');
  if (!iso2 || !stateCode) return null;
  const feats = getStatesForCountry(iso2);
  const match = feats.find((f) => f.id === stateCode);
  return match ? match.name : null;
};
```

Note: the `import` line goes at the top of the file with the other imports — do not duplicate.

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean exit, no new errors.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add store/slices/mapUiSelectors.ts
git commit -m "feat(territory): add useRegionNameByIso best-effort state name resolver"
```

---

## Task 2: `SelectionChip` component

**Files:**
- Create: `components/territory/map/SelectionChip.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { forwardRef } from 'react';
import { useActions } from '@/hooks/useTerritoryStore';
import {
  useSelectedEntityCodes,
  useSelectionCount,
} from '@/store/slices/selectionSelectors';
import { useRegionNameByIso } from '@/store/slices/mapUiSelectors';
import MapChip from './MapChip';

interface Props {
  open: boolean;
  onToggle: () => void;
}

const SelectionChip = forwardRef<HTMLButtonElement, Props>(function SelectionChip(
  { open, onToggle }, ref,
) {
  const count = useSelectionCount();
  if (count === 0) return null;

  return (
    <MapChip
      ref={ref}
      label={`${count} selected`}
      active={open}
      onClick={onToggle}
      glance={
        <>
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-brand"
          />
          <span className="font-mono tabular-nums">{count}</span>
          <span className="text-ink-muted">selected</span>
        </>
      }
    />
  );
});

export default SelectionChip;

export function SelectionChipPopover() {
  const codes = useSelectedEntityCodes();
  const { toggleSelection, clearSelection } = useActions();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Selected regions
        </span>
        <button
          type="button"
          onClick={clearSelection}
          className="text-[11px] text-brand hover:underline"
        >
          Clear
        </button>
      </div>
      <ul className="max-h-[280px] overflow-y-auto flex flex-col gap-0.5">
        {codes.map((code) => (
          <SelectionRow
            key={code}
            code={code}
            onRemove={() => toggleSelection(code)}
          />
        ))}
      </ul>
    </div>
  );
}

function SelectionRow({ code, onRemove }: { code: string; onRemove: () => void }) {
  const name = useRegionNameByIso(code);
  return (
    <li className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-canvas">
      <span className="flex-1 truncate text-[12px]">
        {name ? (
          <>
            <span className="text-ink">{name}</span>
            <span className="ml-1 font-mono text-[10px] text-ink-muted">{code}</span>
          </>
        ) : (
          <span className="font-mono text-[12px] text-ink-body">{code}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${code} from selection`}
        className="rounded p-0.5 text-ink-faint hover:bg-sunken hover:text-ink"
      >
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
        </svg>
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: clean exit (note: `SelectionChip` component is created here but not yet mounted; Task 3 wires it in).

- [ ] **Step 4: Commit**

```bash
git add components/territory/map/SelectionChip.tsx
git commit -m "feat(territory): add SelectionChip component"
```

---

## Task 3: Wire `SelectionChip` into `MapChipsDock`

**Files:**
- Modify: `components/territory/map/MapChipsDock.tsx`

- [ ] **Step 1: Extend `OpenChip` union**

Find the line:

```ts
type OpenChip = 'legend' | 'scale' | 'gaps' | 'conflicts' | null;
```

Change to:

```ts
type OpenChip = 'legend' | 'scale' | 'gaps' | 'conflicts' | 'selection' | null;
```

- [ ] **Step 2: Import the new chip**

Add this import near the existing `import MapChip from './MapChip';`:

```ts
import SelectionChip, { SelectionChipPopover } from './SelectionChip';
```

- [ ] **Step 3: Mount the chip + popover**

Inside the `return (...)`'s outer `<div>` (the `absolute left-4 bottom-4` flex container), append a new `ChipWithPopover` block after the `conflicts` block, just before the closing `</div>`:

```tsx
<ChipWithPopover
  open={openChip === 'selection'}
  popover={<SelectionChipPopover />}
  theme={theme}
>
  <SelectionChip
    open={openChip === 'selection'}
    onToggle={() => toggle('selection')}
  />
</ChipWithPopover>
```

Note: `SelectionChip` returns `null` internally when `count === 0`, so the wrapper `ChipWithPopover` will render an empty positioned div. To avoid the empty wrapper taking flex gap space, we need to also gate the wrapper. The simpler fix: read `useSelectionCount()` at the top of `MapChipsDock` and only render the wrapper when `selectionCount > 0`.

Add at the top of the component (near other selector calls, e.g. after `const conflicts = ...`):

```ts
import { useSelectionCount } from '@/store/slices/selectionSelectors';
// ... and in the component body:
const selectionCount = useSelectionCount();
```

Then change the new block to:

```tsx
{selectionCount > 0 && (
  <ChipWithPopover
    open={openChip === 'selection'}
    popover={<SelectionChipPopover />}
    theme={theme}
  >
    <SelectionChip
      open={openChip === 'selection'}
      onToggle={() => toggle('selection')}
    />
  </ChipWithPopover>
)}
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 5: Verify lint**

Run: `npm run lint`
Expected: clean exit.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: clean exit, 14 static pages built.

- [ ] **Step 7: Commit**

```bash
git add components/territory/map/MapChipsDock.tsx
git commit -m "feat(territory): mount SelectionChip in MapChipsDock"
```

---

## Task 4: `SidebarSearchInput` accepts `id` prop

**Files:**
- Modify: `components/territory/sidebar/SidebarSearchInput.tsx`

- [ ] **Step 1: Add `id` to `Props` and forward to `<input>`**

Replace the entire file with:

```tsx
'use client';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
}

export default function SidebarSearchInput({ value, onChange, placeholder = 'Search…', id }: Props) {
  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-hairline bg-canvas px-2 py-1 pr-6 text-[12px] outline-none focus:ring-1 focus:ring-brand/40"
        aria-label={placeholder}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-ink-faint hover:bg-slate-200 hover:text-ink-body dark:hover:bg-slate-700"
          aria-label="Clear search"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pass `id` from `GeoSidebarPanel`**

In `components/territory/sidebar/GeoSidebarPanel.tsx`, find the line:

```tsx
<SidebarSearchInput value={query} onChange={setQuery} placeholder="Search geos…" />
```

Change to:

```tsx
<SidebarSearchInput id="geo-sidebar-search" value={query} onChange={setQuery} placeholder="Search geos…" />
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add components/territory/sidebar/SidebarSearchInput.tsx components/territory/sidebar/GeoSidebarPanel.tsx
git commit -m "feat(territory): SidebarSearchInput accepts optional id prop"
```

---

## Task 5: `GeoNodeRow` exposes a focus target

**Files:**
- Modify: `components/territory/sidebar/GeoNodeRow.tsx`

- [ ] **Step 1: Add `data-geo-node-row`, `tabIndex={-1}`, and a focus ring**

Find the row's `role="button"` div (around line 101 in the file at the time of writing; it's the `<div onClick={() => setActivePaintGeo(...)}>` directly inside the sortable wrapper). Its current attributes look like:

```tsx
<div
  onClick={() => setActivePaintGeo(isActive ? null : nodeId)}
  className={`group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm transition-colors ${
    isActive
      ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
      : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
  } ${isInvalidDropTarget ? 'opacity-30' : ''}`}
  style={{ paddingLeft: 6 + depth * 14, cursor: 'pointer' }}
  role="button"
  aria-pressed={isActive}
  title={isActive ? 'Click to stop painting' : 'Click to paint with this Geo'}
>
```

Change to:

```tsx
<div
  onClick={() => setActivePaintGeo(isActive ? null : nodeId)}
  data-geo-node-row=""
  tabIndex={-1}
  className={`group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
    isActive
      ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
      : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
  } ${isInvalidDropTarget ? 'opacity-30' : ''}`}
  style={{ paddingLeft: 6 + depth * 14, cursor: 'pointer' }}
  role="button"
  aria-pressed={isActive}
  title={isActive ? 'Click to stop painting' : 'Click to paint with this Geo'}
>
```

(Two additions: the `data-geo-node-row=""` attribute, the `tabIndex={-1}`, and the appended `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40` className tokens.)

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/sidebar/GeoNodeRow.tsx
git commit -m "feat(territory): mark GeoNodeRow with data-geo-node-row + focus ring"
```

---

## Task 6: Toolbar keydown handler — `/` and `g`

**Files:**
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Add the two cases**

The existing handler in the `useEffect` block (lines ~69–119) has a sequence: Esc cascade → `?` → arrow/+/-/0 → undo/redo. Add `/` and `g` cases between the `?` handler and the arrow block. Concretely, find:

```ts
      // ? toggles help (key === '?' on most layouts)
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Arrow / +/- / 0 — dispatch zoom commands (no modifier)
```

Insert between them:

```ts
      // / focuses the Geos sidebar search input
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('geo-sidebar-search')?.focus();
        return;
      }

      // g focuses the first row in the Geos sidebar tree
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        document.querySelector<HTMLElement>('[data-geo-node-row]')?.focus();
        return;
      }
```

The `isEditableTarget(e.target)` guard at the top of `onKey` already covers both keys, so users can still type `/` or `g` inside inputs.

- [ ] **Step 2: Verify type-check + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/toolbar/Toolbar.tsx
git commit -m "feat(territory): / focuses sidebar search, g focuses first geo node"
```

---

## Task 7: `MapHelpPopover` documents `/` and `g`

**Files:**
- Modify: `components/territory/map/MapHelpPopover.tsx`

- [ ] **Step 1: Append the rows**

In the `rows` array, append two entries before the closing `]`. Current end of the array:

```ts
    ['Esc', 'Close popover · clear selection · clear paint/eraser'],
    ['?', 'Toggle this popover'],
  ];
```

Change to:

```ts
    ['Esc', 'Close popover · clear selection · clear paint/eraser'],
    ['?', 'Toggle this popover'],
    ['/', 'Focus search'],
    ['g', 'Focus Geos sidebar'],
  ];
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/map/MapHelpPopover.tsx
git commit -m "docs(territory): document / and g shortcuts in MapHelpPopover"
```

---

## Task 8: Full verification + task-summary entry

**Files:**
- Modify: `.claude/docs/task-summary.md` (append a `Shipped 2026-05-13 — Polish-A` section)

- [ ] **Step 1: Run the full verification trio**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

All three must exit clean. If any fail, do not proceed — diagnose and fix before continuing.

- [ ] **Step 2: User manual smoke (request from user, do not perform yourself)**

Ask the user to run `npm run dev` and verify in the browser:

1. Map view, no selection → no `SelectionChip` visible in dock.
2. Select 2+ regions (click + shift-click while Select tool active) → chip appears with count.
3. Click chip → popover lists codes; for any drilled-down state codes, names appear before the code; country codes show codes only.
4. Click ✕ on a row → that code is removed; count decrements; popover stays open. Click the last ✕ → chip and popover unmount together.
5. Re-select, click `Clear` → set empties; popover closes.
6. From map view, press `/` → focus lands in Geos sidebar search box; typing filters the tree (existing behavior).
7. From map view, press `g` → focus lands on the first Geo node row (visible ring); subsequent `/` and `g` still work after focusing elsewhere via mouse.
8. Type `/` or `g` while in any input → no map action fires.
9. Open `MapHelpPopover` (`?`) → rows for `/` and `g` are listed.

- [ ] **Step 3: Append a section to `.claude/docs/task-summary.md`**

Append at the end of the file (after the existing MapInfoRail section):

```markdown

---

## Shipped 2026-05-13 — Polish-A (selection chip + `/` and `g` shortcuts)

Spec: `docs/superpowers/specs/2026-05-13-territory-polish-a-design.md`
Plan: `docs/superpowers/plans/2026-05-13-territory-polish-a.md`

### What shipped

- `components/territory/map/SelectionChip.tsx` — new chip + popover.
  Visible only when `useSelectionCount() > 0`. Popover lists selected
  codes with best-effort state names; per-row ✕ removes via
  `toggleSelection`; footer `Clear` calls `clearSelection`.
- `store/slices/mapUiSelectors.ts` — `useRegionNameByIso(iso)` resolves
  state codes (`"A:B"`) against `stateLoader`'s existing cache; returns
  `null` for country codes and stale lookups. Country-name capture is
  deferred to Polish-B.
- `components/territory/map/MapChipsDock.tsx` — `OpenChip` extended
  with `'selection'`; chip block gated on `selectionCount > 0` so the
  flex gap doesn't leak.
- `components/territory/toolbar/Toolbar.tsx` — keydown handler gains
  `/` (focuses `#geo-sidebar-search`) and `g` (focuses first
  `[data-geo-node-row]`); both go through the existing
  `isEditableTarget` guard.
- `components/territory/sidebar/SidebarSearchInput.tsx` — optional
  `id` prop forwarded to the `<input>`.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — passes
  `id="geo-sidebar-search"`.
- `components/territory/sidebar/GeoNodeRow.tsx` — row root div gains
  `data-geo-node-row`, `tabIndex={-1}`, and a `focus-visible:ring`
  treatment.
- `components/territory/map/MapHelpPopover.tsx` — adds rows for `/`
  and `g`.

### Deviations from spec

Spec proposed name resolution via a generic `useRegionNameByIso` that
would cover both countries and states. Implementation scopes it to
states only (the only source with a ready-made name cache); country
display names are deferred to Polish-B where the selection slice will
need to grow a name parameter for sidebar bulk-select anyway.

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean. Manual
UI smoke checklist above.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log polish-A shipped (selection chip + / and g shortcuts)"
```

---

## Self-Review Notes

- **Spec coverage**: chip + popover (T2, T3), `useRegionNameByIso` (T1), `/` shortcut (T6), `g` shortcut (T6), search-input `id` (T4), `data-geo-node-row` (T5), help-popover rows (T7). All covered.
- **Placeholder scan**: clean — every step has the exact code or command.
- **Type consistency**: `OpenChip` extended in T3 to match the `'selection'` literal used in T2's `onToggle` consumer; selectors imported in T2 (`useSelectedEntityCodes`, `useSelectionCount`) match existing exports in `store/slices/selectionSelectors.ts`; `useRegionNameByIso` signature `(iso: string) => string | null` is used identically in T1 (definition) and T2 (consumer).
