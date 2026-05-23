# Territory Sidebar Hierarchy Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Geos sidebar into a real tree editor: drag-and-drop reorder/reparent, search-within-tree with auto-expand, and a swatch+hex color picker popover.

**Architecture:** Add a `reorderGeoNode(id, newParentId, beforeId)` action to `geoSlice` that mutates `parentId` + splices `geoNodeOrder`, paired with a `reorderGeoNodes(orderedIds)` Directus write that sequentially PATCHes `sort`. Wrap `GeoSidebarPanel` in a single `<DndContext>` with one flat `<SortableContext>`; per-row pointer-Y zones distinguish sibling-insert vs nest. Replace the existing native `<input type="color">` with a `ColorPickerPopover` (10 swatches + Inherit + hex input).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Zustand store, `@dnd-kit/core` + `@dnd-kit/sortable` (new).

**Reference spec:** `docs/superpowers/specs/2026-05-09-territory-sidebar-editing-design.md`

**Repo context:** No automated test suite exists. Per-task verification is `npx tsc --noEmit` + `npm run lint`, with a final `npm run build` and manual UI smoke at the end. Commit after each task.

---

## File Structure

**New files:**
- `components/territory/sidebar/ColorPickerPopover.tsx` — swatch palette + Inherit + hex input.
- `components/territory/sidebar/SidebarSearchInput.tsx` — controlled search box with clear button.
- `lib/geoTreeFilter.ts` — pure function: given `geoNodes` + query, return the id set to render and the id set to force-expand.

**Modified files:**
- `store/slices/geoSlice.ts` — add `reorderGeoNode` action + corresponding type entry.
- `lib/directus-write.ts` — add `reorderGeoNodes(orderedIds)` mirroring `reorderLevels`.
- `components/territory/sidebar/GeoSidebarPanel.tsx` — search input, DndContext, SortableContext, drop-handler.
- `components/territory/sidebar/GeoNodeRow.tsx` — `useSortable`, drop-zone overlays, swap native color input for ColorPickerPopover, accept `forceExpanded` + `dragDisabled` + `descendantIds` props.
- `package.json` — add `@dnd-kit/core` and `@dnd-kit/sortable` deps.

---

## Task 1: Install DnD dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install packages**

Run from repo root:

```bash
npm install @dnd-kit/core @dnd-kit/sortable
```

- [ ] **Step 2: Verify install**

Run: `npx tsc --noEmit`
Expected: clean (no type errors).

Run: `npm ls @dnd-kit/core @dnd-kit/sortable`
Expected: both packages listed at recent versions (≥6.x for core, ≥8.x for sortable).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit/core and @dnd-kit/sortable"
```

---

## Task 2: Add `reorderGeoNodes` Directus write

**Files:**
- Modify: `lib/directus-write.ts` (append after the existing `reorderLevels` block, around line 314)

- [ ] **Step 1: Add the export**

Append this function after `reorderLevels` (mirror its shape exactly):

```ts
/** Persist sort positions matching the given id order for geo_nodes. */
export async function reorderGeoNodes(orderedIds: string[]): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  await Promise.all(
    orderedIds.map((id, idx) =>
      fetch(`${BASE_URL}/items/geo_nodes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort: idx }),
      }).then(async (res) => {
        if (!res.ok) throw await directusError(res);
      }),
    ),
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/directus-write.ts
git commit -m "feat(territory): add reorderGeoNodes directus write"
```

---

## Task 3: Add `reorderGeoNode` action to `geoSlice`

**Files:**
- Modify: `store/slices/geoSlice.ts`

This is the core state action. It must be cycle-safe and update both `parentId` and `geoNodeOrder` atomically.

- [ ] **Step 1: Add to the slice type**

Find the `GeoSlice` interface in `store/slices/geoSlice.ts` (search for `reparentGeoNode`). Add this method signature directly below `reparentGeoNode`:

```ts
reorderGeoNode(
  id: string,
  newParentId: string | null,
  beforeId: string | null,
): void;
```

- [ ] **Step 2: Add the implementation**

In the `createGeoSlice` factory, add this method directly after the existing `reparentGeoNode` implementation (the file already imports `isAncestor` and `fireWrite`, and uses `directusWrite.updateGeoNodeRemote` — extend that import to include `reorderGeoNodes`):

```ts
reorderGeoNode(id, newParentId, beforeId) {
  let didApply = false;
  let nextOrder: string[] | null = null;
  let parentChanged = false;
  set((s) => {
    if (!s.geoNodes[id]) return s;
    if (newParentId !== null) {
      if (newParentId === id) return s;
      if (!s.geoNodes[newParentId]) return s;
      if (isAncestor(s.geoNodes, id, newParentId)) return s;
    }
    if (beforeId !== null && !s.geoNodes[beforeId]) return s;
    if (beforeId === id) return s;

    const currentParent = s.geoNodes[id].parentId;
    parentChanged = currentParent !== newParentId;

    const without = s.geoNodeOrder.filter((nid) => nid !== id);
    const insertAt = beforeId === null
      ? without.length
      : without.indexOf(beforeId);
    const order = [...without];
    order.splice(insertAt < 0 ? order.length : insertAt, 0, id);

    didApply = true;
    nextOrder = order;
    return {
      geoNodes: parentChanged
        ? { ...s.geoNodes, [id]: { ...s.geoNodes[id], parentId: newParentId } }
        : s.geoNodes,
      geoNodeOrder: order,
    };
  });
  if (!didApply || !nextOrder) return;
  if (parentChanged) {
    fireWrite(
      `reorderGeoNode-parent(${id})`,
      directusWrite.updateGeoNodeRemote(id, { parentId: newParentId }),
    );
  }
  fireWrite(
    `reorderGeoNode-sort(${id})`,
    directusWrite.reorderGeoNodes(nextOrder),
  );
},
```

Also extend the existing `import * as directusWrite from '@/lib/directus-write'` (or named-import equivalent already in the file) — `reorderGeoNodes` is now used. If imports are named, add `reorderGeoNodes` to the list.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): add reorderGeoNode slice action"
```

---

## Task 4: Build `ColorPickerPopover`

**Files:**
- Create: `components/territory/sidebar/ColorPickerPopover.tsx`

Self-contained popover. Caller passes current color + onChange. Does NOT call the slice directly — keeps it reusable.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

interface Props {
  value: string | null;
  onChange: (next: string | null) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

export default function ColorPickerPopover({ value, onChange, onClose, anchorRect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState(value ?? '');

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  function commitHex() {
    const trimmed = hex.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
      onChange(trimmed.toLowerCase());
      onClose();
    }
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 w-48 rounded-md border border-hairline bg-panel p-2 shadow-lg"
      style={{
        top: anchorRect.bottom + 4,
        left: Math.min(anchorRect.left, window.innerWidth - 200),
      }}
      role="dialog"
      aria-label="Pick color"
    >
      <div className="grid grid-cols-5 gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => { onChange(c); onClose(); }}
            style={{ background: c }}
            className={`h-6 w-6 rounded ${value === c ? 'ring-2 ring-offset-1 ring-brand' : 'ring-1 ring-black/10'}`}
            aria-label={`Use ${c}`}
          />
        ))}
      </div>
      <button
        onClick={() => { onChange(null); onClose(); }}
        className="mt-2 w-full rounded bg-sunken py-1 text-[11px] font-medium text-ink-muted hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        Inherit from parent
      </button>
      <div className="mt-2 flex gap-1">
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitHex(); }}
          placeholder="#3b82f6"
          className="flex-1 rounded border border-hairline bg-canvas px-1.5 py-0.5 text-[11px] font-mono outline-none focus:ring-1 focus:ring-brand/40"
          maxLength={7}
        />
        <button
          onClick={commitHex}
          className="rounded bg-brand px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-hover"
        >
          Set
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/sidebar/ColorPickerPopover.tsx
git commit -m "feat(territory): add ColorPickerPopover component"
```

---

## Task 5: Build `lib/geoTreeFilter`

**Files:**
- Create: `lib/geoTreeFilter.ts`

Pure helper for search-within-tree.

- [ ] **Step 1: Create the file**

```ts
import type { GeoNode } from '@/types/territory';

interface FilterResult {
  /** Ids that should render (matches + their ancestors). */
  visibleIds: Set<string>;
  /** Ids that should be force-expanded (ancestors of matches). */
  expandIds: Set<string>;
}

/**
 * Returns the set of node ids to render and the set to force-expand.
 * When `query` is empty, returns null — caller should render the full tree
 * with its normal expanded state.
 */
export function filterGeoTree(
  nodes: Record<string, GeoNode>,
  query: string,
): FilterResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const visible = new Set<string>();
  const expand = new Set<string>();

  for (const node of Object.values(nodes)) {
    if (!node.name.toLowerCase().includes(q)) continue;
    visible.add(node.id);
    let parentId = node.parentId;
    while (parentId !== null) {
      const parent = nodes[parentId];
      if (!parent) break;
      visible.add(parent.id);
      expand.add(parent.id);
      parentId = parent.parentId;
    }
  }

  return { visibleIds: visible, expandIds: expand };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/geoTreeFilter.ts
git commit -m "feat(territory): add filterGeoTree helper"
```

---

## Task 6: Build `SidebarSearchInput`

**Files:**
- Create: `components/territory/sidebar/SidebarSearchInput.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

export default function SidebarSearchInput({ value, onChange, placeholder = 'Search…' }: Props) {
  return (
    <div className="relative">
      <input
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

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/sidebar/SidebarSearchInput.tsx
git commit -m "feat(territory): add SidebarSearchInput"
```

---

## Task 7: Wire DnD context, search, and filtered render in `GeoSidebarPanel`

**Files:**
- Modify: `components/territory/sidebar/GeoSidebarPanel.tsx`

This task replaces the panel render with the DnD-aware version. `GeoNodeRow` will be updated in Task 8 to consume the new props (`forceExpanded`, `dragDisabled`, `descendantIds`).

- [ ] **Step 1: Replace the file contents**

```tsx
'use client';

import { useMemo, useState } from 'react';
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
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useGeoChildren, useGeoNodes, useGeoNodeOrder, useActions } from '@/hooks/useTerritoryStore';
import { filterGeoTree } from '@/lib/geoTreeFilter';
import GeoNodeRow from './GeoNodeRow';
import SidebarSearchInput from './SidebarSearchInput';

function descendantsOfLocal(nodes: ReturnType<typeof useGeoNodes>, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of Object.values(nodes)) {
      if (n.parentId === cur) {
        out.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return out;
}

export default function GeoSidebarPanel() {
  const roots = useGeoChildren(null);
  const nodes = useGeoNodes();
  const order = useGeoNodeOrder();
  const { addGeoNode, setActivePaintGeo, reorderGeoNode } = useActions();

  const [query, setQuery] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const filter = useMemo(() => filterGeoTree(nodes, query), [nodes, query]);

  const descendantIds = useMemo(
    () => (activeDragId ? descendantsOfLocal(nodes, activeDragId) : new Set<string>()),
    [activeDragId, nodes],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragDisabled = filter !== null;

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const overNode = nodes[overId];
    if (!overNode) return;

    // The drop-zone (top/middle/bottom) is communicated via over.data.current.zone
    // set by GeoNodeRow's useDroppable in Task 8. Default to 'after' if absent.
    const zone = (over.data.current as { zone?: 'before' | 'nest' | 'after' } | undefined)?.zone ?? 'after';

    if (zone === 'nest') {
      // Nest as last child of overNode.
      reorderGeoNode(activeId, overId, null);
      return;
    }

    const newParentId = overNode.parentId;
    if (zone === 'before') {
      reorderGeoNode(activeId, newParentId, overId);
      return;
    }
    // 'after' — find the id immediately after overId in `order` that shares parent.
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

  const sortableIds = filter
    ? order.filter((id) => filter.visibleIds.has(id))
    : order;

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-hairline px-3 py-2">
        <button
          onClick={() => {
            const id = addGeoNode('New Geo', null);
            setActivePaintGeo(id);
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand py-1.5 text-[11px] font-semibold tracking-tight text-white shadow-brand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a.75.75 0 01.75.75V7.25h5a.75.75 0 010 1.5h-5v5a.75.75 0 01-1.5 0v-5h-5a.75.75 0 010-1.5h5V2.25A.75.75 0 018 1.5z" />
          </svg>
          New geo
        </button>
        <SidebarSearchInput value={query} onChange={setQuery} placeholder="Search geos…" />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
            <p className="text-sm font-medium text-ink-muted">No geos yet.</p>
            <p className="text-xs text-ink-faint">
              Click <span className="font-medium text-ink-body">&ldquo;New geo&rdquo;</span> to start a hierarchy.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
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
                  />
                ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="border-t border-hairline bg-sunken/50 px-3 py-2 text-[11px] text-ink-muted">
        <p className="leading-snug">
          {dragDisabled ? (
            <><span className="font-semibold text-ink-body">Tip:</span> clear search to drag-reorder.</>
          ) : (
            <><span className="font-semibold text-ink-body">Tip:</span> drag rows to reorder. Drop on the middle of a row to nest.</>
          )}
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Confirm hook exports**

This file imports `useGeoNodes` and `useGeoNodeOrder` from `@/hooks/useTerritoryStore`. Run:

```bash
grep -n "useGeoNodes\|useGeoNodeOrder" hooks/useTerritoryStore.ts
```

Expected: both names present. If missing, add them now as one-line selector hooks following the pattern of the other selectors in that file:

```ts
export const useGeoNodes = () => useTerritoryStore((s) => s.geoNodes);
export const useGeoNodeOrder = () => useTerritoryStore((s) => s.geoNodeOrder);
```

Also confirm `reorderGeoNode` is reachable through the `useActions` hook. Open `hooks/useTerritoryStore.ts`, find `useActions`, and ensure the returned object includes `reorderGeoNode` (Zustand actions are typically returned via a single `useActions` selector that picks all `*` methods). If actions are picked one-by-one, add `reorderGeoNode` to the picked list.

- [ ] **Step 3: Verify**

The file references `GeoNodeRow` props that don't exist yet (`visibleIds`, `forceExpandIds`, `dragDisabled`, `descendantIds`). `tsc` will fail until Task 8 lands. That's expected — do **not** commit yet. Continue to Task 8.

---

## Task 8: Make `GeoNodeRow` draggable + sortable + popover-driven

**Files:**
- Modify: `components/territory/sidebar/GeoNodeRow.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
'use client';

import { useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useGeoNode, useGeoChildren, useActivePaintGeoId, useActions,
} from '@/hooks/useTerritoryStore';
import ColorPickerPopover from './ColorPickerPopover';

interface GeoNodeRowProps {
  nodeId: string;
  depth: number;
  visibleIds: Set<string> | null;
  forceExpandIds: Set<string> | null;
  dragDisabled: boolean;
  descendantIds: Set<string>;
}

export default function GeoNodeRow({
  nodeId, depth, visibleIds, forceExpandIds, dragDisabled, descendantIds,
}: GeoNodeRowProps) {
  const node = useGeoNode(nodeId);
  const children = useGeoChildren(nodeId);
  const activeId = useActivePaintGeoId();
  const { addGeoNode, updateGeoNode, removeGeoNode, setActivePaintGeo } = useActions();
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);

  const sortable = useSortable({ id: nodeId, disabled: dragDisabled });

  // Three droppable sub-zones (top/middle/bottom) sharing the same row visually.
  const beforeDrop = useDroppable({ id: `${nodeId}::before`, data: { zone: 'before', rowId: nodeId } });
  const nestDrop = useDroppable({ id: `${nodeId}::nest`, data: { zone: 'nest', rowId: nodeId } });
  const afterDrop = useDroppable({ id: `${nodeId}::after`, data: { zone: 'after', rowId: nodeId } });

  if (!node) return null;
  if (visibleIds && !visibleIds.has(nodeId)) return null;

  const isActive = activeId === nodeId;
  const territoryCount = node.countryCodes.length + node.stateCodes.length;
  const isInvalidDropTarget = descendantIds.has(nodeId);
  const showExpanded = forceExpandIds?.has(nodeId) ? true : expanded;

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  function commitName() {
    const next = draftName.trim();
    if (next && next !== node!.name) updateGeoNode(nodeId, { name: next });
    setEditingName(false);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const hasChildren = children.length > 0;
    const msg = hasChildren
      ? `Delete "${node!.name}" and its ${children.length} child${children.length > 1 ? 'ren' : ''}? Country/state assignments inside will be cleared.`
      : `Delete "${node!.name}"? Its country/state assignments will be cleared.`;
    if (window.confirm(msg)) removeGeoNode(nodeId, 'cascade');
  }

  return (
    <div ref={sortable.setNodeRef} style={style} className="select-none">
      <div className="relative">
        {/* Drop-zone overlays — full row, split into thirds. Pointer events only when a drag is active. */}
        {!isInvalidDropTarget && (
          <>
            <div
              ref={beforeDrop.setNodeRef}
              className={`pointer-events-auto absolute inset-x-0 top-0 h-1/3 ${beforeDrop.isOver ? 'border-t-2 border-brand' : ''}`}
            />
            <div
              ref={nestDrop.setNodeRef}
              className={`pointer-events-auto absolute inset-x-0 top-1/3 h-1/3 ${nestDrop.isOver ? 'bg-brand-soft' : ''}`}
            />
            <div
              ref={afterDrop.setNodeRef}
              className={`pointer-events-auto absolute inset-x-0 bottom-0 h-1/3 ${afterDrop.isOver ? 'border-b-2 border-brand' : ''}`}
            />
          </>
        )}

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
          {/* Drag handle */}
          <button
            {...sortable.attributes}
            {...sortable.listeners}
            onClick={(e) => e.stopPropagation()}
            className={`flex h-4 w-3 cursor-grab items-center justify-center text-slate-300 hover:text-slate-600 ${dragDisabled ? 'invisible' : ''}`}
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            <svg viewBox="0 0 8 16" className="h-3 w-2" fill="currentColor">
              <circle cx="2" cy="3" r="1" /><circle cx="6" cy="3" r="1" />
              <circle cx="2" cy="8" r="1" /><circle cx="6" cy="8" r="1" />
              <circle cx="2" cy="13" r="1" /><circle cx="6" cy="13" r="1" />
            </svg>
          </button>

          {children.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="flex h-4 w-4 items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label={showExpanded ? 'Collapse' : 'Expand'}
            >
              <svg className={`h-3 w-3 transition-transform ${showExpanded ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.22 3.22a.75.75 0 011.06 0l4 4a.75.75 0 010 1.06l-4 4a.75.75 0 11-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
              </svg>
            </button>
          ) : (
            <span className="w-4" />
          )}

          <button
            ref={swatchRef}
            onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
            className="relative h-4 w-4 flex-shrink-0 rounded border border-slate-300 dark:border-slate-600"
            style={
              node.color
                ? { background: node.color }
                : {
                    backgroundImage:
                      'repeating-linear-gradient(45deg, #d4d4d8 0 2px, transparent 2px 4px)',
                  }
            }
            title={node.color ?? 'Inherits parent color — click to set'}
            aria-label="Pick color"
          />

          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                else if (e.key === 'Escape') setEditingName(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 rounded bg-white px-1 py-0.5 text-sm outline-none ring-1 ring-indigo-400 dark:bg-slate-900"
            />
          ) : (
            <span
              className="flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDraftName(node.name);
                setEditingName(true);
              }}
            >
              {node.name}
            </span>
          )}

          <span
            className="text-[10px] tabular-nums text-slate-400"
            title={`${node.countryCodes.length} countries, ${node.stateCodes.length} states`}
          >
            {territoryCount}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const id = addGeoNode('New', nodeId);
              setActivePaintGeo(id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-slate-300 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="Add child"
            aria-label="Add child"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a.75.75 0 01.75.75v5.5h5.5a.75.75 0 010 1.5h-5.5v5.5a.75.75 0 01-1.5 0v-5.5h-5.5a.75.75 0 010-1.5h5.5v-5.5A.75.75 0 018 1z" />
            </svg>
          </button>

          <button
            onClick={handleDelete}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950"
            title="Delete"
            aria-label="Delete"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      </div>

      {pickerOpen && swatchRef.current && (
        <ColorPickerPopover
          value={node.color}
          onChange={(next) => updateGeoNode(nodeId, { color: next })}
          onClose={() => setPickerOpen(false)}
          anchorRect={swatchRef.current.getBoundingClientRect()}
        />
      )}

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
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean (Task 7's references now resolve).

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit (covers Task 7 + Task 8 together)**

```bash
git add components/territory/sidebar/GeoSidebarPanel.tsx components/territory/sidebar/GeoNodeRow.tsx hooks/useTerritoryStore.ts
git commit -m "feat(territory): drag-and-drop reorder, search, color popover for geo sidebar"
```

---

## Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Static checks**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three clean.

- [ ] **Step 2: Manual UI smoke**

Run `npm run dev` and visit `/territory`. Verify:

1. **Reorder same-parent**: drag a root geo above another root geo — order persists after page reload.
2. **Nest**: drag a root geo onto the middle of another root geo — it becomes a child; parent shows expand chevron.
3. **Un-nest**: drag a child geo onto the top/bottom of a root-level row — it becomes a sibling at root.
4. **Cycle prevention**: try to drag a parent into one of its descendants — descendants are dimmed, drop is rejected silently.
5. **Inline rename**: dblclick a geo name → input appears → type → Enter commits → Esc cancels → empty trim leaves original.
6. **Search**: type in the search box → tree filters to matches with ancestors auto-expanded → drag handles disappear with "clear search to drag-reorder" hint → clear search restores full tree.
7. **Color picker**: click swatch → popover opens → click swatch chip → color applies → click "Inherit from parent" → diagonal-stripe pattern returns → enter `#aabbcc` in hex + Set → custom color applies → click outside or Esc → popover closes.
8. **Keyboard DnD**: tab to a drag handle, Space to pick up, Arrow Up/Down to move, Space again to drop. Order persists.

- [ ] **Step 3: Update task summary**

Append a "Sub-project 4 (shipped 2026-05-09)" section under Part 8 of `vegeta/.claude/docs/task-summary.md` describing what shipped, deviations, and verification.

- [ ] **Step 4: Commit and announce completion**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log sub-project 4 (sidebar hierarchy editing) shipping"
```

Report back: what shipped, any deviations from the plan, and the next deferred items (multi-select, MapInfoRail placement).
