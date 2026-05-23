# Territory Polish-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Geos-sidebar multi-select with shift/cmd-click selection, bulk drag (whole selection moved as one via dnd-kit DragOverlay), and bulk Backspace/Delete with confirm.

**Architecture:** New session-only `geoSelectionSlice` parallel to the map's `selectionSlice`. Two new bulk actions on `geoSlice` (`reorderGeoNodes`, `removeGeoNodes`) sit beside their single-node siblings. `GeoNodeRow` gets a click dispatcher that routes modifier-clicks to selection and plain clicks to the existing paint-toggle. `GeoSidebarPanel` mounts a DragOverlay, installs a local keydown handler for Esc/Backspace/Delete, and clears selection on background click. The Toolbar's window-level Esc cascade gets one focus-scope early-return so it doesn't fight the sidebar's local handler.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand, Tailwind v4, @dnd-kit/core + @dnd-kit/sortable. No test framework — verification is `npx tsc --noEmit && npm run lint && npm run build`.

**Spec:** `docs/superpowers/specs/2026-05-13-territory-polish-b-design.md`.

---

## File Structure

**New:**
- `lib/isEditableTarget.ts` — small shared helper lifted from `Toolbar.tsx`.
- `store/slices/geoSelectionSlice.ts` — selection state + 4 actions.
- `store/slices/geoSelectionSelectors.ts` — `useSelectedGeoNodeIds`, `useGeoSelectionCount`, `useIsGeoSelected`.
- `components/territory/sidebar/GeoSelectionDragOverlay.tsx` — count chip rendered inside dnd-kit's `<DragOverlay>` during bulk drag.

**Modified:**
- `store/types.ts` — add `GeoSelectionSlice` to the `TerritoryStore` union.
- `store/territoryStore.ts` — call `createGeoSelectionSlice(...a)`.
- `hooks/useTerritoryStore.ts` — `export * from '@/store/slices/geoSelectionSelectors'`.
- `store/slices/geoSlice.ts` — add `reorderGeoNodes` + `removeGeoNodes` actions to the slice interface and implementation.
- `components/territory/sidebar/GeoNodeRow.tsx` — click dispatcher; `isSelected` ring/bg; `bulkDragActive` prop + opacity; `visibleOrder` prop forwarded into the click dispatcher.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — pass `visibleOrder`, mount `<DragOverlay>`, bulk drag start/end logic, local Esc + Backspace/Delete handler, background-click clears, `data-geo-sidebar-root` attribute, `tabIndex={-1}` on outer container.
- `components/territory/toolbar/Toolbar.tsx` — switch to lifted `isEditableTarget`; Esc cascade early-returns when focus is inside `[data-geo-sidebar-root]`.

No new dependencies.

---

## Task 1: Lift `isEditableTarget` to a shared lib

**Files:**
- Create: `lib/isEditableTarget.ts`
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Create the shared helper**

Write `lib/isEditableTarget.ts`:

```ts
/**
 * Returns true if the event target is an editable element (input, textarea,
 * select, or contenteditable). Used by global keydown handlers to avoid
 * intercepting keys while the user is typing.
 */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
```

- [ ] **Step 2: Replace the inline copy in `Toolbar.tsx`**

In `components/territory/toolbar/Toolbar.tsx`, find the local declaration inside the `useEffect`:

```ts
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
```

Delete that local function (it's right at the top of the `useEffect`).

Add a new import at the top of the file alongside the other imports:

```ts
import { isEditableTarget } from '@/lib/isEditableTarget';
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add lib/isEditableTarget.ts components/territory/toolbar/Toolbar.tsx
git commit -m "refactor(territory): lift isEditableTarget to lib for reuse"
```

---

## Task 2: `geoSelectionSlice` + store registration

**Files:**
- Create: `store/slices/geoSelectionSlice.ts`
- Modify: `store/types.ts`
- Modify: `store/territoryStore.ts`

- [ ] **Step 1: Create the slice**

Write `store/slices/geoSelectionSlice.ts`:

```ts
// store/slices/geoSelectionSlice.ts
import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';

export interface GeoSelectionSlice {
  selectedGeoNodeIds: string[];
  selectionAnchorId: string | null;

  setGeoSelection: (ids: string[], anchor?: string | null) => void;
  toggleGeoSelection: (id: string) => void;
  extendGeoSelection: (toId: string, visibleOrder: string[]) => void;
  clearGeoSelection: () => void;
}

export const createGeoSelectionSlice: StateCreator<TerritoryStore, [], [], GeoSelectionSlice> = (set) => ({
  selectedGeoNodeIds: [],
  selectionAnchorId: null,

  setGeoSelection: (ids, anchor) =>
    set(() => {
      const uniq = Array.from(new Set(ids));
      const nextAnchor = anchor === undefined ? (uniq.length > 0 ? uniq[uniq.length - 1] : null) : anchor;
      return { selectedGeoNodeIds: uniq, selectionAnchorId: nextAnchor };
    }),

  toggleGeoSelection: (id) =>
    set((s) => {
      const has = s.selectedGeoNodeIds.includes(id);
      const next = has
        ? s.selectedGeoNodeIds.filter((nid) => nid !== id)
        : [...s.selectedGeoNodeIds, id];
      return { selectedGeoNodeIds: next, selectionAnchorId: id };
    }),

  extendGeoSelection: (toId, visibleOrder) =>
    set((s) => {
      const anchor = s.selectionAnchorId ?? toId;
      const aIdx = visibleOrder.indexOf(anchor);
      const bIdx = visibleOrder.indexOf(toId);
      if (aIdx === -1 || bIdx === -1) {
        return { selectedGeoNodeIds: [toId], selectionAnchorId: toId };
      }
      const [lo, hi] = aIdx <= bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
      const range = visibleOrder.slice(lo, hi + 1);
      return { selectedGeoNodeIds: range, selectionAnchorId: anchor };
    }),

  clearGeoSelection: () => set({ selectedGeoNodeIds: [] }),
});
```

- [ ] **Step 2: Extend `TerritoryStore` type**

In `store/types.ts`, add the import and union member.

Find:
```ts
import type { SelectionSlice } from './slices/selectionSlice';
```

Add immediately after it:
```ts
import type { GeoSelectionSlice } from './slices/geoSelectionSlice';
```

Find:
```ts
  & SelectionSlice
  & RootActions;
```

Change to:
```ts
  & SelectionSlice
  & GeoSelectionSlice
  & RootActions;
```

- [ ] **Step 3: Register slice creator in the store**

In `store/territoryStore.ts`, add an import near the existing slice imports:

```ts
import { createGeoSelectionSlice } from './slices/geoSelectionSlice';
```

In the `create<TerritoryStore>()((...a) => { ... return { ... } })` block, add `...createGeoSelectionSlice(...a),` immediately after the existing `...createSelectionSlice(...a),` line:

```ts
    ...createSelectionSlice(...a),
    ...createGeoSelectionSlice(...a),
```

The slice is **not** added to `PERSIST_KEYS` (session-only). No persist export from the slice file.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add store/slices/geoSelectionSlice.ts store/types.ts store/territoryStore.ts
git commit -m "feat(territory): geoSelectionSlice for sidebar multi-select state"
```

---

## Task 3: `geoSelectionSelectors` + barrel re-export

**Files:**
- Create: `store/slices/geoSelectionSelectors.ts`
- Modify: `hooks/useTerritoryStore.ts`

- [ ] **Step 1: Create the selectors**

Write `store/slices/geoSelectionSelectors.ts`:

```ts
// store/slices/geoSelectionSelectors.ts
import { useTerritoryStore } from '../territoryStore';

export const useSelectedGeoNodeIds = () =>
  useTerritoryStore((s) => s.selectedGeoNodeIds);

export const useIsGeoSelected = (id: string) =>
  useTerritoryStore((s) => s.selectedGeoNodeIds.includes(id));

export const useGeoSelectionCount = () =>
  useTerritoryStore((s) => s.selectedGeoNodeIds.length);

export const useGeoSelectionAnchor = () =>
  useTerritoryStore((s) => s.selectionAnchorId);
```

- [ ] **Step 2: Re-export through the barrel**

In `hooks/useTerritoryStore.ts`, after the line:
```ts
export * from '@/store/slices/selectionSelectors';
```

Add:
```ts
export * from '@/store/slices/geoSelectionSelectors';
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add store/slices/geoSelectionSelectors.ts hooks/useTerritoryStore.ts
git commit -m "feat(territory): geoSelection selectors"
```

---

## Task 4: `reorderGeoNodes` bulk action on `geoSlice`

**Files:**
- Modify: `store/slices/geoSlice.ts`

- [ ] **Step 1: Add to the `GeoSlice` interface**

In `store/slices/geoSlice.ts`, find the existing single-node declaration:

```ts
  reorderGeoNode(
    id: string,
    newParentId: string | null,
    beforeId: string | null,
  ): void;
```

Immediately after it, add:

```ts
  reorderGeoNodes(
    ids: string[],
    newParentId: string | null,
    beforeId: string | null,
  ): void;
```

- [ ] **Step 2: Implement the action**

In the same file, find the implementation of `reorderGeoNode(id, newParentId, beforeId)` (around line 215). Immediately after its closing brace, add the bulk implementation:

```ts
  reorderGeoNodes(ids, newParentId, beforeId) {
    if (ids.length === 0) return;
    let didApply = false;
    let nextOrder: string[] | null = null;
    const parentChanges: string[] = [];
    set((s) => {
      // Validate: all ids exist
      if (ids.some((id) => !s.geoNodes[id])) return s;
      // Validate: newParentId exists if not null and is not in batch
      if (newParentId !== null) {
        if (!s.geoNodes[newParentId]) return s;
        if (ids.includes(newParentId)) return s;
        // Cycle: any selected id ancestor of newParentId?
        if (ids.some((id) => isAncestor(s.geoNodes, id, newParentId))) return s;
      }
      // beforeId can't be in batch
      if (beforeId !== null) {
        if (!s.geoNodes[beforeId]) return s;
        if (ids.includes(beforeId)) return s;
      }

      // Reparent each id whose parentId differs
      const geoNodes: Record<string, typeof s.geoNodes[string]> = { ...s.geoNodes };
      for (const id of ids) {
        if (geoNodes[id].parentId !== newParentId) {
          geoNodes[id] = { ...geoNodes[id], parentId: newParentId };
          parentChanges.push(id);
        }
      }

      // Splice the batch out of geoNodeOrder and insert as a contiguous run
      const batchSet = new Set(ids);
      const without = s.geoNodeOrder.filter((nid) => !batchSet.has(nid));
      const insertAt = beforeId === null ? without.length : without.indexOf(beforeId);
      const order = [...without];
      order.splice(insertAt < 0 ? order.length : insertAt, 0, ...ids);

      didApply = true;
      nextOrder = order;
      return { geoNodes, geoNodeOrder: order };
    });
    if (!didApply || !nextOrder) return;
    for (const id of parentChanges) {
      fireWrite(
        `reorderGeoNodes-parent(${id})`,
        directusWrite.updateGeoNodeRemote(id, { parentId: newParentId }),
      );
    }
    fireWrite(
      `reorderGeoNodes-sort(batch=${ids.length})`,
      directusWrite.reorderGeoNodes(nextOrder),
    );
  },
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): reorderGeoNodes bulk action on geoSlice"
```

---

## Task 5: `removeGeoNodes` bulk action on `geoSlice`

**Files:**
- Modify: `store/slices/geoSlice.ts`

- [ ] **Step 1: Add to the `GeoSlice` interface**

Find the existing single-node `removeGeoNode` declaration:

```ts
  removeGeoNode: (id: string, mode?: 'cascade' | 'reparent-children') => void;
```

Immediately after it, add:

```ts
  removeGeoNodes: (ids: string[], mode?: 'cascade' | 'reparent-children') => void;
```

- [ ] **Step 2: Implement the action**

Find the implementation of `removeGeoNode(id, mode = 'cascade')` (around line 261). Immediately after its closing brace, add:

```ts
  removeGeoNodes(ids, mode = 'cascade') {
    if (ids.length === 0) return;
    let dropIds: string[] = [];
    const reparentPatches: Array<{ id: string; parentId: string | null }> = [];
    set((s) => {
      // Filter to ids that actually exist
      const valid = ids.filter((id) => s.geoNodes[id]);
      if (valid.length === 0) return s;

      if (mode === 'cascade') {
        const drop = new Set<string>();
        for (const id of valid) {
          for (const did of descendantsOf(s.geoNodes, id)) drop.add(did);
        }
        dropIds = Array.from(drop);
        const geoNodes = { ...s.geoNodes };
        drop.forEach((nid) => { delete geoNodes[nid]; });
        const activeStillExists = s.activePaintGeoId !== null && !drop.has(s.activePaintGeoId);
        return {
          geoNodes,
          geoNodeOrder: s.geoNodeOrder.filter((nid) => !drop.has(nid)),
          activePaintGeoId: activeStillExists ? s.activePaintGeoId : null,
        };
      }

      // reparent-children: per-id, mirror single-node behavior
      const removed = new Set(valid);
      const geoNodes: Record<string, typeof s.geoNodes[string]> = {};
      for (const [nid, n] of Object.entries(s.geoNodes)) {
        if (removed.has(nid)) continue;
        // If the node's parent is being removed, lift to that parent's parent
        if (n.parentId && removed.has(n.parentId)) {
          const newParent = s.geoNodes[n.parentId].parentId;
          geoNodes[nid] = { ...n, parentId: newParent };
          reparentPatches.push({ id: nid, parentId: newParent });
        } else {
          geoNodes[nid] = n;
        }
      }
      dropIds = Array.from(removed);
      const activeStillExists = s.activePaintGeoId !== null && !removed.has(s.activePaintGeoId);
      return {
        geoNodes,
        geoNodeOrder: s.geoNodeOrder.filter((nid) => !removed.has(nid)),
        activePaintGeoId: activeStillExists ? s.activePaintGeoId : null,
      };
    });
    for (const p of reparentPatches) {
      fireWrite(
        `reparentGeoNode(${p.id})`,
        directusWrite.updateGeoNodeRemote(p.id, { parentId: p.parentId }),
      );
    }
    if (dropIds.length > 0) fireWrite('deleteGeoNodes', directusWrite.deleteGeoNodes(dropIds));
  },
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): removeGeoNodes bulk action on geoSlice"
```

---

## Task 6: `GeoNodeRow` — click dispatcher + selected visual + bulkDragActive

**Files:**
- Modify: `components/territory/sidebar/GeoNodeRow.tsx`

- [ ] **Step 1: Extend `GeoNodeRowProps`**

Find the existing interface and replace with:

```ts
interface GeoNodeRowProps {
  nodeId: string;
  depth: number;
  visibleIds: Set<string> | null;
  forceExpandIds: Set<string> | null;
  dragDisabled: boolean;
  descendantIds: Set<string>;
  visibleOrder: string[];
  bulkDragActive: boolean;
}
```

- [ ] **Step 2: Update the function signature + destructure**

Find:
```ts
export default function GeoNodeRow({
  nodeId, depth, visibleIds, forceExpandIds, dragDisabled, descendantIds,
}: GeoNodeRowProps) {
```

Change to:
```ts
export default function GeoNodeRow({
  nodeId, depth, visibleIds, forceExpandIds, dragDisabled, descendantIds,
  visibleOrder, bulkDragActive,
}: GeoNodeRowProps) {
```

- [ ] **Step 3: Add selection hooks + actions**

Just after the existing `useGeoNode` / `useActions` block, add:

```ts
  const isSelected = useIsGeoSelected(nodeId);
  const { toggleGeoSelection, extendGeoSelection, clearGeoSelection } = useActions();
```

Update the existing top-of-file import to add the new selector hook:

Find:
```ts
import {
  useGeoNode, useGeoChildren, useActivePaintGeoId, useActions,
} from '@/hooks/useTerritoryStore';
```

Change to:
```ts
import {
  useGeoNode, useGeoChildren, useActivePaintGeoId, useActions,
  useIsGeoSelected,
} from '@/hooks/useTerritoryStore';
```

- [ ] **Step 4: Replace the row's `onClick` with a dispatcher**

Find the row root `<div>` whose attributes start with `onClick={() => setActivePaintGeo(...)}` (around line 101). Currently:

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

Change to:

```tsx
        <div
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              toggleGeoSelection(nodeId);
              return;
            }
            if (e.shiftKey) {
              e.preventDefault();
              extendGeoSelection(nodeId, visibleOrder);
              return;
            }
            clearGeoSelection();
            setActivePaintGeo(isActive ? null : nodeId);
          }}
          data-geo-node-row=""
          tabIndex={-1}
          className={`group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
            isActive
              ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
              : isSelected
                ? 'bg-brand-soft/60 ring-1 ring-brand/40'
                : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
          } ${isInvalidDropTarget ? 'opacity-30' : ''} ${bulkDragActive ? 'opacity-40' : ''}`}
          style={{ paddingLeft: 6 + depth * 14, cursor: 'pointer' }}
          role="button"
          aria-pressed={isActive}
          title={isActive ? 'Click to stop painting' : 'Click to paint with this Geo'}
        >
```

- [ ] **Step 5: Forward props to recursive children**

At the bottom of the file, find the recursive render block (around line 232):

```tsx
      {showExpanded && children.map((c) => (
        <GeoNodeRow
          key={c.id}
          nodeId={c.id}
          depth={depth + 1}
          visibleIds={visibleIds}
          forceExpandIds={forceExpandIds}
          dragDisabled={dragDisabled}
          descendantIds={descendantIds}
        />
      ))}
```

Change to:

```tsx
      {showExpanded && children.map((c) => (
        <GeoNodeRow
          key={c.id}
          nodeId={c.id}
          depth={depth + 1}
          visibleIds={visibleIds}
          forceExpandIds={forceExpandIds}
          dragDisabled={dragDisabled}
          descendantIds={descendantIds}
          visibleOrder={visibleOrder}
          bulkDragActive={false}
        />
      ))}
```

(Child rows compute their own `bulkDragActive` via the parent flag in Task 9. For now, the recursive descent passes `false`; the top-level `roots.map(...)` in `GeoSidebarPanel` will set the correct value per-row when Task 9 wires bulk drag. Setting `false` here is safe because each `<GeoNodeRow>` mount-point is independent.)

> **Note:** Step 5 is a temporary structure. Task 9 will replace the recursive `bulkDragActive={false}` with a hook-based read of `selectedGeoNodeIds` so descendants of a selected root also dim correctly during bulk drag. For now we just need the prop to exist with a default so TypeScript is happy.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`

Expected: tsc will complain that `GeoSidebarPanel` doesn't pass the new required props (`visibleOrder`, `bulkDragActive`). That's expected — Task 7 fixes it. **Do not commit yet.**

- [ ] **Step 7: Make the new props optional with defaults to keep the build green**

To allow Task 6 to commit independently, change the interface in Step 1 to mark the two new props optional:

```ts
interface GeoNodeRowProps {
  nodeId: string;
  depth: number;
  visibleIds: Set<string> | null;
  forceExpandIds: Set<string> | null;
  dragDisabled: boolean;
  descendantIds: Set<string>;
  visibleOrder?: string[];
  bulkDragActive?: boolean;
}
```

And update the function destructure to provide defaults:

```ts
export default function GeoNodeRow({
  nodeId, depth, visibleIds, forceExpandIds, dragDisabled, descendantIds,
  visibleOrder = [], bulkDragActive = false,
}: GeoNodeRowProps) {
```

(Task 7 will pass the real `visibleOrder`. Until then the empty array means shift-click is a no-op — acceptable interim state.)

- [ ] **Step 8: Re-verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add components/territory/sidebar/GeoNodeRow.tsx
git commit -m "feat(territory): GeoNodeRow click dispatcher + selected visual + bulkDragActive prop"
```

---

## Task 7: `GeoSidebarPanel` — pass `visibleOrder`, background-click clear

**Files:**
- Modify: `components/territory/sidebar/GeoSidebarPanel.tsx`

- [ ] **Step 1: Import the clear action**

In `components/territory/sidebar/GeoSidebarPanel.tsx`, find:

```ts
import { useGeoChildren, useGeoNodes, useGeoNodeOrder, useActions } from '@/hooks/useTerritoryStore';
```

Change to:

```ts
import { useGeoChildren, useGeoNodes, useGeoNodeOrder, useActions } from '@/hooks/useTerritoryStore';
import { useSelectedGeoNodeIds } from '@/store/slices/geoSelectionSelectors';
```

- [ ] **Step 2: Read the clear action**

Find:
```ts
  const { addGeoNode, setActivePaintGeo, reorderGeoNode } = useActions();
```

Change to:
```ts
  const { addGeoNode, setActivePaintGeo, reorderGeoNode, clearGeoSelection } = useActions();
  const selectedGeoNodeIds = useSelectedGeoNodeIds();
```

- [ ] **Step 3: Pass `visibleOrder` to roots**

Find the root render block at the bottom:

```tsx
              {roots
                .filter((n) => !filter || filter.visibleIds.has(n.id))
                .map((node) => (
                  <GeoNodeRow
                    key={node.id}
                    nodeId={node.id}
                    depth={0}
                    visibleIds={filter?.visibleIds ?? null}
                    forceExpandIds={filter?.expandIds ?? null}
                    dragDisabled={dragDisabled}
                    descendantIds={descendantIds}
                  />
                ))}
```

Change to:

```tsx
              {roots
                .filter((n) => !filter || filter.visibleIds.has(n.id))
                .map((node) => (
                  <GeoNodeRow
                    key={node.id}
                    nodeId={node.id}
                    depth={0}
                    visibleIds={filter?.visibleIds ?? null}
                    forceExpandIds={filter?.expandIds ?? null}
                    dragDisabled={dragDisabled}
                    descendantIds={descendantIds}
                    visibleOrder={sortableIds}
                    bulkDragActive={false}
                  />
                ))}
```

(`bulkDragActive={false}` is a default that Task 9 will replace with per-row logic. Keeping it explicit here documents the prop without breaking Task 9's plans.)

- [ ] **Step 4: Background-click clears selection**

Find the scroll container `<div>` (around line 117):

```tsx
      <div className="flex-1 overflow-y-auto px-2 py-2">
```

Change to:

```tsx
      <div
        className="flex-1 overflow-y-auto px-2 py-2"
        onClick={(e) => { if (e.target === e.currentTarget) clearGeoSelection(); }}
      >
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add components/territory/sidebar/GeoSidebarPanel.tsx
git commit -m "feat(territory): pass visibleOrder + clear selection on background click"
```

---

## Task 8: `GeoSelectionDragOverlay` component

**Files:**
- Create: `components/territory/sidebar/GeoSelectionDragOverlay.tsx`

- [ ] **Step 1: Create the component**

Write `components/territory/sidebar/GeoSelectionDragOverlay.tsx`:

```tsx
'use client';

import { useGeoNode } from '@/hooks/useTerritoryStore';

interface Props {
  activeId: string;
  count: number;
}

export default function GeoSelectionDragOverlay({ activeId, count }: Props) {
  const active = useGeoNode(activeId);
  if (!active) return null;

  const extra = count - 1;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[12px] font-medium text-brand-ink shadow-md">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
        style={{ background: active.color ?? 'transparent' }}
      />
      <span className="truncate max-w-[180px]">{active.name}</span>
      {extra > 0 && (
        <span className="rounded-full bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
          +{extra}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean (the component is unused yet — TypeScript and ESLint do not flag unused exports).

- [ ] **Step 3: Commit**

```bash
git add components/territory/sidebar/GeoSelectionDragOverlay.tsx
git commit -m "feat(territory): GeoSelectionDragOverlay count chip"
```

---

## Task 9: Wire bulk drag in `GeoSidebarPanel` + DragOverlay

**Files:**
- Modify: `components/territory/sidebar/GeoSidebarPanel.tsx`

- [ ] **Step 1: Add the DragOverlay import**

In `components/territory/sidebar/GeoSidebarPanel.tsx`, find the existing dnd-kit import block:

```ts
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
```

Change to:

```ts
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
```

Add the overlay component import alongside the other component imports:

```ts
import GeoSelectionDragOverlay from './GeoSelectionDragOverlay';
```

- [ ] **Step 2: Track `bulkDragIds` and pull bulk slice actions**

Add state alongside the existing `activeDragId` state:

Find:
```ts
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
```

Change to:
```ts
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [bulkDragIds, setBulkDragIds] = useState<string[] | null>(null);
```

Update the actions destructure to include `reorderGeoNodes`:

Find:
```ts
  const { addGeoNode, setActivePaintGeo, reorderGeoNode, clearGeoSelection } = useActions();
```

Change to:
```ts
  const { addGeoNode, setActivePaintGeo, reorderGeoNode, reorderGeoNodes, clearGeoSelection } = useActions();
```

- [ ] **Step 3: Detect bulk in `handleDragStart`**

Find:
```ts
  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }
```

Change to:

```ts
  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveDragId(id);
    if (selectedGeoNodeIds.includes(id) && selectedGeoNodeIds.length > 1) {
      // Preserve user-visible selection order for the batch
      const batch = sortableIds.filter((nid) => selectedGeoNodeIds.includes(nid));
      setBulkDragIds(batch);
    } else {
      setBulkDragIds(null);
    }
  }
```

- [ ] **Step 4: Branch `handleDragEnd` for bulk**

Find:
```ts
  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const overNode = nodes[overId];
    if (!overNode) return;

    const zone = (over.data.current as { zone?: 'before' | 'nest' | 'after' } | undefined)?.zone ?? 'after';

    if (zone === 'nest') {
      reorderGeoNode(activeId, overId, null);
      return;
    }

    const newParentId = overNode.parentId;
    if (zone === 'before') {
      reorderGeoNode(activeId, newParentId, overId);
      return;
    }
    const overIndex = order.indexOf(overId);
    let beforeId: string | null = null;
    for (let i = overIndex + 1; i < order.length; i += 1) {
      const nid = order[i];
      if (nodes[nid]?.parentId === newParentId) {
        beforeId = nid;
        break;
      }
    }
    reorderGeoNode(activeId, newParentId, beforeId);
  }
```

Change to:

```ts
  function handleDragEnd(e: DragEndEvent) {
    const batch = bulkDragIds;
    setActiveDragId(null);
    setBulkDragIds(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const overNode = nodes[overId];
    if (!overNode) return;

    const zone = (over.data.current as { zone?: 'before' | 'nest' | 'after' } | undefined)?.zone ?? 'after';

    const computeBeforeId = (newParentId: string | null): string | null => {
      const overIndex = order.indexOf(overId);
      for (let i = overIndex + 1; i < order.length; i += 1) {
        const nid = order[i];
        if (nodes[nid]?.parentId === newParentId) return nid;
      }
      return null;
    };

    if (batch && batch.length > 1) {
      // Bulk drag: reorderGeoNodes handles cycle / membership rejection internally.
      if (zone === 'nest') {
        reorderGeoNodes(batch, overId, null);
        return;
      }
      const newParentId = overNode.parentId;
      if (zone === 'before') {
        reorderGeoNodes(batch, newParentId, overId);
        return;
      }
      reorderGeoNodes(batch, newParentId, computeBeforeId(newParentId));
      return;
    }

    // Singleton drag (unchanged behavior)
    if (zone === 'nest') {
      reorderGeoNode(activeId, overId, null);
      return;
    }
    const newParentId = overNode.parentId;
    if (zone === 'before') {
      reorderGeoNode(activeId, newParentId, overId);
      return;
    }
    reorderGeoNode(activeId, newParentId, computeBeforeId(newParentId));
  }
```

- [ ] **Step 5: Mount the DragOverlay**

Find the `<DndContext>` block (around line 126). The structure is:

```tsx
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {roots
                ...
            </SortableContext>
          </DndContext>
```

Update `onDragCancel` to also clear bulk, and insert `<DragOverlay>` as the LAST child of `<DndContext>`, after the `</SortableContext>`:

```tsx
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => { setActiveDragId(null); setBulkDragIds(null); }}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {roots
                .filter((n) => !filter || filter.visibleIds.has(n.id))
                .map((node) => (
                  <GeoNodeRow
                    key={node.id}
                    nodeId={node.id}
                    depth={0}
                    visibleIds={filter?.visibleIds ?? null}
                    forceExpandIds={filter?.expandIds ?? null}
                    dragDisabled={dragDisabled}
                    descendantIds={descendantIds}
                    visibleOrder={sortableIds}
                    bulkDragActive={
                      bulkDragIds !== null
                      && bulkDragIds.includes(node.id)
                      && node.id !== activeDragId
                    }
                  />
                ))}
            </SortableContext>
            <DragOverlay>
              {activeDragId && bulkDragIds && bulkDragIds.length > 1 ? (
                <GeoSelectionDragOverlay activeId={activeDragId} count={bulkDragIds.length} />
              ) : null}
            </DragOverlay>
          </DndContext>
```

(This replaces the entire `<DndContext>` block. The change vs. Task 7 is the per-root `bulkDragActive` expression and the new `<DragOverlay>` mount; `onDragCancel` also clears `bulkDragIds`.)

> **Limitation:** non-root rows recursively descended from `<GeoNodeRow>` will receive `bulkDragActive={false}` from the Task 6 recursion. The visible dim treatment applies only to selected root-level rows during bulk drag. Descendant rows' dim during bulk drag is acceptable to omit (most user selections are sibling-grouped). If we need descendant dim later, replace the recursive `bulkDragActive={false}` in `GeoNodeRow.tsx` with `bulkDragActive={useIsBulkDragActive(c.id)}` (a new selector). Out of scope for Polish-B.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add components/territory/sidebar/GeoSidebarPanel.tsx
git commit -m "feat(territory): bulk drag in Geos sidebar with DragOverlay"
```

---

## Task 10: Local Esc + Backspace/Delete + `data-geo-sidebar-root`

**Files:**
- Modify: `components/territory/sidebar/GeoSidebarPanel.tsx`

- [ ] **Step 1: Add imports for the helper + bulk action**

In `components/territory/sidebar/GeoSidebarPanel.tsx`, add to the existing imports:

```ts
import { isEditableTarget } from '@/lib/isEditableTarget';
```

Pull `removeGeoNodes` into the `useActions` destructure. Find:

```ts
  const { addGeoNode, setActivePaintGeo, reorderGeoNode, reorderGeoNodes, clearGeoSelection } = useActions();
```

Change to:

```ts
  const { addGeoNode, setActivePaintGeo, reorderGeoNode, reorderGeoNodes, removeGeoNodes, clearGeoSelection } = useActions();
```

- [ ] **Step 2: Add the keydown handler**

Inside the function body, after the existing `function handleDragEnd(...)`, add:

```ts
  function handleSidebarKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) return;
    if (selectedGeoNodeIds.length === 0) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      clearGeoSelection();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const n = selectedGeoNodeIds.length;
      const msg = `Delete ${n} geo${n > 1 ? 's' : ''} and their descendants? Country/state assignments inside will be cleared.`;
      if (window.confirm(msg)) {
        removeGeoNodes(selectedGeoNodeIds, 'cascade');
        clearGeoSelection();
      }
    }
  }
```

- [ ] **Step 3: Wire `data-geo-sidebar-root`, `tabIndex={-1}`, and the keydown to the outer fragment**

The component currently returns a `<>...</>` fragment. We need a single outer element to attach `data-*`, `tabIndex`, and `onKeyDown`. Replace the fragment with a `<div>` wrapper.

Find:
```tsx
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-hairline px-3 py-2">
```

Change to:
```tsx
  return (
    <div
      data-geo-sidebar-root=""
      tabIndex={-1}
      onKeyDown={handleSidebarKeyDown}
      className="flex h-full flex-col"
    >
      <div className="flex flex-col gap-2 border-b border-hairline px-3 py-2">
```

And at the very end of the JSX, find the closing fragment:
```tsx
      <div className="border-t border-hairline bg-sunken/50 px-3 py-2 text-[11px] text-ink-muted">
        ...
      </div>
    </>
  );
```

Change to:
```tsx
      <div className="border-t border-hairline bg-sunken/50 px-3 py-2 text-[11px] text-ink-muted">
        ...
      </div>
    </div>
  );
```

(The wrapper `<div>` uses `flex h-full flex-col` to preserve the existing top→middle→bottom layout that the fragment relied on — its parent's `flex flex-col h-full` container previously placed the three sections directly; we maintain the same axis with the wrapper now between them.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add components/territory/sidebar/GeoSidebarPanel.tsx
git commit -m "feat(territory): sidebar Esc + Backspace/Delete handler + tree-root marker"
```

---

## Task 11: Toolbar Esc early-return when focus inside sidebar

**Files:**
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Add the focus-scope check at the top of the Esc cascade**

In `components/territory/toolbar/Toolbar.tsx`, find the Esc cascade inside the keydown handler:

```ts
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
```

Change to:

```ts
      // Esc cascade: popover → selection → paint/eraser
      // The sidebar's local handler runs first when focus is inside the sidebar.
      if (e.key === 'Escape') {
        if (document.activeElement?.closest('[data-geo-sidebar-root]')) return;
        if (helpOpen) { setHelpOpen(false); return; }
        if (selectionCount > 0) { clearSelection(); return; }
        if (paintGeo || eraserActive) {
          setActivePaintGeo(null);
          setActiveEraser(false);
          return;
        }
        return;
      }
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/toolbar/Toolbar.tsx
git commit -m "feat(territory): Toolbar Esc yields when focus is inside the sidebar"
```

---

## Task 12: Full verification + task-summary entry

**Files:**
- Modify: `.claude/docs/task-summary.md`

- [ ] **Step 1: Run the full verification trio**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

All three must exit clean. If any fail, diagnose and fix before continuing.

- [ ] **Step 2: User manual smoke (ask the user; do not perform yourself)**

Request the user run `npm run dev` and verify:

1. Plain click on a row → paint mode toggles on that row; no selection styling on any row.
2. Cmd-click rows B, C, D → each gains the brand-soft ring/fill; paint mode unchanged.
3. Shift-click row F → range from current anchor (D) through F replaces the selection.
4. Plain click any row → selection clears; paint mode toggles on the clicked row.
5. Click empty sidebar background → selection clears.
6. Multi-select 2+ rows → drag any selected row. DragOverlay shows `{name} +N`. Non-active selected rows dim. Drop reparents the whole batch.
7. Drag an unselected row → singleton drag works exactly as before.
8. Try to drop a batch onto one of its own descendants → no-op (whole batch rejected).
9. With selection active, press Backspace or Delete → confirm dialog; OK cascades delete; Cancel preserves.
10. With selection active, press Esc → selection clears; map state (paint/eraser/regions selection) unchanged.
11. With no selection active, press Esc → Toolbar Esc cascade still fires (popover dismiss, etc.).
12. Press `g` (from Polish-A) → focus lands on first node; subsequent Esc/Backspace operate against the sidebar.

- [ ] **Step 3: Append a section to `.claude/docs/task-summary.md`**

Append at the end of the file (after the Polish-A section):

```markdown

---

## Shipped 2026-05-13 — Polish-B (Geos sidebar multi-select)

Spec: `docs/superpowers/specs/2026-05-13-territory-polish-b-design.md`
Plan: `docs/superpowers/plans/2026-05-13-territory-polish-b.md`

Second of four follow-up polish passes. Polish-C (undo/redo across
sidebar mutations + animated tree open/close) and Polish-D (SP3
motion) remain.

### What shipped

- `lib/isEditableTarget.ts` — extracted from `Toolbar.tsx` so the
  sidebar's local keydown handler can reuse it.
- `store/slices/geoSelectionSlice.ts` — session-only multi-select
  state (`selectedGeoNodeIds`, `selectionAnchorId`) + four actions
  (`setGeoSelection`, `toggleGeoSelection` (moves anchor),
  `extendGeoSelection` (range over a `visibleOrder`),
  `clearGeoSelection`). Not added to `geoPersistKeys` — parallels the
  map's `selectionSlice`.
- `store/slices/geoSelectionSelectors.ts` —
  `useSelectedGeoNodeIds`, `useGeoSelectionCount`, `useIsGeoSelected`,
  `useGeoSelectionAnchor`. Re-exported through `hooks/useTerritoryStore`.
- `store/slices/geoSlice.ts` — adds `reorderGeoNodes(ids, newParentId,
  beforeId)` and `removeGeoNodes(ids, mode)` bulk actions next to
  their single-node siblings. Cycle/membership checks reject the
  whole batch (matches the single-node policy). Bulk delete fires one
  `directusWrite.deleteGeoNodes` for the union of dropped ids.
- `components/territory/sidebar/GeoNodeRow.tsx` — click dispatcher:
  cmd/ctrl-click → toggle; shift-click → extend; plain → clear
  selection + paint toggle (preserves existing muscle memory).
  `isSelected` adds `bg-brand-soft/60 ring-1 ring-brand/40` (paint
  mode wins visually). `bulkDragActive` prop dims non-active selected
  rows during bulk drag.
- `components/territory/sidebar/GeoSelectionDragOverlay.tsx` — count
  chip rendered inside dnd-kit's `<DragOverlay>` during bulk drag.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — wraps the
  return in a `<div data-geo-sidebar-root tabIndex={-1}>` with a
  local `onKeyDown` for Esc (clears selection,
  `e.stopPropagation()`) and Backspace/Delete (confirm + bulk
  delete). Background-click on the scroll container clears
  selection. `handleDragStart` detects bulk and stores
  `bulkDragIds`; `handleDragEnd` routes to `reorderGeoNodes` when
  bulk. `<DragOverlay>` mounts inside `<DndContext>`.
- `components/territory/toolbar/Toolbar.tsx` — Esc cascade gets a
  single early-return when `document.activeElement` is inside
  `[data-geo-sidebar-root]`. Switched to the lifted
  `isEditableTarget`.

### Deviations from spec

- The recursive descent in `GeoNodeRow.tsx` passes
  `bulkDragActive={false}` to descendant rows. Only root-level rows
  in `GeoSidebarPanel`'s render compute the real per-row value. In
  practice, descendant dim during bulk drag is acceptable to omit
  (multi-select is typically sibling-grouped). If we need descendant
  dim later it's a small addition (replace the recursive `false`
  with a hook-based selector).
- Spec mentioned an optional `reparent-children` mode for
  `removeGeoNodes`; the implementation includes it for parity but
  Polish-B's UI only calls `cascade`. The mode is exercised only by
  unit tests that don't exist yet (no test framework).

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
Manual UI smoke is the user's responsibility — checklist in plan
Task 12 Step 2.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log polish-B shipped (Geos sidebar multi-select)"
```

---

## Self-Review Notes

**Spec coverage:**
- §1 geoSelectionSlice → T2 (slice + register)
- §1 selectors → T3
- §2 reorderGeoNodes → T4
- §2 removeGeoNodes → T5
- §3 click dispatcher → T6
- §3 visibleOrder source → T7
- §4 isSelected visual + bulkDragActive dim → T6 (visual), T9 (per-row computation)
- §5 bulk drag wiring + DragOverlay → T8 (component), T9 (mount)
- §6 bulk delete + Esc + background click → T7 (background), T10 (keydown + tree-root marker)
- §7 Toolbar Esc cross-cut → T11
- §8 visibleOrder = sortableIds → T7
- isEditableTarget lift → T1

**Placeholder scan:** clean — every step contains the exact code or command.

**Type consistency:**
- `selectedGeoNodeIds`, `selectionAnchorId` defined in T2's slice, consumed by selectors in T3, by `GeoNodeRow`'s `useIsGeoSelected` in T6, and by `GeoSidebarPanel`'s `useSelectedGeoNodeIds` in T7.
- `setGeoSelection`, `toggleGeoSelection`, `extendGeoSelection`, `clearGeoSelection` — defined in T2, consumed in T6 (`toggle`, `extend`, `clear`) and T7/T10 (`clear`).
- `reorderGeoNodes` — defined in T4, consumed in T9.
- `removeGeoNodes` — defined in T5, consumed in T10.
- `visibleOrder: string[]`, `bulkDragActive: boolean` — added to `GeoNodeRowProps` in T6 (optional with defaults so T6 ships green), passed for real in T7/T9.
- `data-geo-sidebar-root` — emitted in T10, queried in T11 via `closest()`.

**Caveat re. Task 6 / Task 9 prop coordination:** Task 6 marks `visibleOrder` and `bulkDragActive` as optional with defaults so the file type-checks before `GeoSidebarPanel` passes them. Tasks 7 and 9 pass real values. The recursive descent inside `GeoNodeRow` passes `bulkDragActive={false}` — this is the documented limitation noted in the spec deviations section.
