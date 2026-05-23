# Territory Polish-B — Geos sidebar multi-select

Date: 2026-05-13
Status: design

## Background

Second of four follow-up polish passes on territory sub-projects 3 & 4.

- Polish-A (shipped 2026-05-13) — map selection chip + `/` / `g`
  shortcuts.
- **Polish-B (this spec)** — multi-select in the Geos sidebar:
  shift/cmd-click selection, bulk drag, bulk delete.
- Polish-C — undo/redo across sidebar mutations + animated tree
  open/close.
- Polish-D — SP3 motion: animated drill transition + pan momentum.

Today the sidebar only supports single-node operations: click toggles
paint mode, drag reorders one node, delete via a row's ✕ button. The
shipped sub-project 4 plan explicitly deferred multi-select to a
follow-up. Polish-B closes that gap.

## Goals

1. **Range + toggle selection** in the Geos sidebar via shift-click
   and cmd/ctrl-click. Selection is session-only.
2. **Bulk drag** any selected set to a new parent / position as one
   gesture. Single-node drag is unchanged.
3. **Bulk delete** via Backspace or Delete when the sidebar has focus,
   gated by a confirm dialog.
4. **Preserve existing muscle memory**: plain click still toggles
   paint mode. New behavior only activates under modifier keys or with
   non-empty selection.

Non-goals: drag-and-drop selection from the map → sidebar; persisting
selection across reloads; multi-select range across collapsed/hidden
nodes (visible order only); marquee/lasso selection in the sidebar
tree (the map already has that for regions; tree lasso is uncommon).

## Design

### 1. New `geoSelectionSlice`

Add `store/slices/geoSelectionSlice.ts` mirroring the map's
`selectionSlice.ts`. Kept separate from `geoSlice` because selection
is ephemeral and the geoSlice already carries node graph + paint state
+ undo/redo.

```ts
export interface GeoSelectionSlice {
  selectedGeoNodeIds: string[];
  selectionAnchorId: string | null;

  setGeoSelection: (ids: string[], anchor?: string | null) => void;
  toggleGeoSelection: (id: string) => void;
  extendGeoSelection: (toId: string, visibleOrder: string[]) => void;
  clearGeoSelection: () => void;
}
```

Selector module `store/slices/geoSelectionSelectors.ts`:
- `useSelectedGeoNodeIds()` → `string[]`
- `useGeoSelectionCount()` → `number`
- `useIsGeoSelected(id: string)` → `boolean`

Selection-modifying semantics:
- `setGeoSelection(ids, anchor)` — replaces. `anchor` defaults to the
  last id in `ids`, or `null` if empty.
- `toggleGeoSelection(id)` — adds or removes `id`. **Anchor moves to
  `id`** (Finder/Linear behavior — subsequent shift-click anchors here).
- `extendGeoSelection(toId, visibleOrder)` — replaces selection with
  the inclusive range from `selectionAnchorId` to `toId` walked
  through `visibleOrder`. If no anchor exists, treat anchor as `toId`
  (single-node selection). Anchor stays put after extend.
- `clearGeoSelection()` — empties set; anchor stays at its last value
  (so re-selecting one node and shift-clicking still works as
  expected after a clear).

Slice is **not** included in `geoPersistKeys` — session-only, matches
the map `selectionSlice`. Add it to `TerritoryStore` union and create
it in `store/territoryStore.ts`.

### 2. Bulk node-graph actions on `geoSlice`

Two new methods alongside the existing single-node siblings:

```ts
reorderGeoNodes(
  ids: string[],            // dragged batch; preserves their relative order
  newParentId: string | null,
  beforeId: string | null,  // sibling to insert before, or null = append
): void;

removeGeoNodes(
  ids: string[],
  mode?: 'cascade' | 'reparent-children',
): void;
```

`reorderGeoNodes` implementation:
1. Reject the whole batch if ANY id is missing, equals `newParentId`,
   or is an ancestor of `newParentId` (cycle check on the union).
2. Reject if `beforeId` is in `ids` (can't insert before yourself).
3. Splice `ids` out of `geoNodeOrder`, then re-insert them as a
   contiguous run at the resolved index, preserving their existing
   relative order.
4. For each id whose `parentId` changed, write
   `directusWrite.updateGeoNodeRemote(id, { parentId })` (loop, same
   as the single-node pattern).
5. Fire one `directusWrite.reorderGeoNodes(nextOrder)` for the new
   global sort order.

`removeGeoNodes` implementation:
- `cascade`: compute the union of descendants across all `ids`, drop
  in one `set()` call, fire one `directusWrite.deleteGeoNodes(allDropIds)`.
- `reparent-children`: rare for bulk; supported with a per-id loop
  that mirrors the single-node `reparent-children` path. Polish-B's UI
  only calls cascade; the reparent variant is included for parity but
  not exercised yet.

Both update the geoSlice's existing `activePaintGeoId` invalidation
logic (clear if the active paint id was deleted).

### 3. Click semantics in `GeoNodeRow`

Replace the row root `<div>`'s `onClick` with a dispatcher:

```ts
function handleRowClick(e: React.MouseEvent) {
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
}
```

`visibleOrder` is passed in as a new prop from `GeoSidebarPanel`,
sourced from the same `sortableIds` array already computed there
(respects search filter + collapse state).

The grip handle's drag listeners stay on the leading drag-handle
button — `e.stopPropagation()` already prevents row-click handling
from firing during drag-start.

### 4. Visual treatment

Add `const isSelected = useIsGeoSelected(nodeId)` to the row. Append
`ring-1 ring-brand/40 bg-brand-soft/60` to the row div's className when
`isSelected && !isActive`. `isActive` (paint mode) keeps its existing
indigo styling and wins visually if both are true (paint mode is
single-select by nature).

During an active bulk drag, non-active selected rows render at
`opacity-40` (matches the existing `sortableIsDragging` opacity
treatment on the active row — gives the whole batch a "lifted" look).

### 5. Bulk drag in `GeoSidebarPanel`

State + handler changes:

- New local state: `bulkDragIds: string[] | null` set in
  `handleDragStart` when the active id is in `selectedGeoNodeIds`,
  reset to `null` on drag-end / cancel.
- `handleDragEnd`:
  - If `bulkDragIds !== null` and the drop target's id is in
    `unionOfDescendants(bulkDragIds)`, abort (no-op).
  - If bulk: call `reorderGeoNodes(bulkDragIds, newParentId, beforeId)`.
  - Else: existing single-node `reorderGeoNode(...)` call (unchanged).
- New `<DragOverlay>` mounted inside `<DndContext>`. When `bulkDragIds`
  is set, the overlay renders a `GeoSelectionDragOverlay` component
  showing `"{count} geos"` (or `"{name} + {count-1} more"` if count >
  1). When singleton, no overlay is needed (existing transform on the
  row suffices).
- `GeoNodeRow` receives a new `bulkDragActive: boolean` prop
  (true when this row is in the active bulk-drag set but is not the
  cursor-following one). Uses it to apply `opacity-40` to non-active
  selected rows during bulk drag.

`GeoSelectionDragOverlay` (new file in
`components/territory/sidebar/`): a small floating pill with the
brand background + count + (optional) lead name. ~30 lines.

### 6. Bulk delete + Esc + background click

`GeoSidebarPanel` installs a local keydown handler on its outer
container `<div>` (not `window`):

`isEditableTarget` is currently defined inline in `Toolbar.tsx`. As
part of Polish-B, lift it to a small shared helper at
`lib/isEditableTarget.ts` and import from both the sidebar handler
and the toolbar handler. One-line function, zero behavior change.

```ts
function handleSidebarKeyDown(e: React.KeyboardEvent) {
  if (isEditableTarget(e.target)) return;
  if (selectedCount === 0) return;
  if (e.key === 'Escape') {
    e.stopPropagation();   // don't let Toolbar Esc cascade fire
    clearGeoSelection();
    return;
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    const n = selectedCount;
    const msg = `Delete ${n} geo${n > 1 ? 's' : ''} and their descendants? Country/state assignments inside will be cleared.`;
    if (window.confirm(msg)) {
      removeGeoNodes(selectedIds, 'cascade');
      clearGeoSelection();
    }
  }
}
```

Wire the outer container with `tabIndex={-1}` so it accepts focus and
the handler attaches via `onKeyDown={handleSidebarKeyDown}`. The
selectorpicks up `[data-geo-node-row]:focus` via event bubbling. The
existing `g` shortcut from Polish-A already focuses the first row;
once a row has focus, Backspace/Esc bubble up to the container.

Background click: the outer scroll container `<div className="flex-1
overflow-y-auto px-2 py-2">` gets an `onClick` that calls
`clearGeoSelection()` only when `e.target === e.currentTarget` (clicked
empty space, not bubbled from a row).

### 7. Esc interaction with the Toolbar's cascade

The Toolbar's window-level Esc handler runs at the window level; the
sidebar's local handler runs at the container level. Once Backspace
or Esc fires in the sidebar and we call `e.stopPropagation()`, the
window-level handler still sees it (stopPropagation in React's
synthetic system doesn't block the native window listener). To
guarantee the Toolbar's Esc doesn't also fire when sidebar selection
is being cleared, the Toolbar's Esc cascade prepends one check:

```ts
if (e.key === 'Escape') {
  if (document.activeElement?.closest('[data-geo-sidebar-root]')) return;
  // ... existing cascade ...
}
```

Add `data-geo-sidebar-root=""` to the `<>...</>` fragment's first
container in `GeoSidebarPanel`. This is the minimal cross-cutting
change to the Toolbar.

### 8. visibleOrder source

`GeoSidebarPanel` already computes `sortableIds` for the
`SortableContext`. This is exactly the visible flat order we need for
range selection. Pass it as a prop down to each `GeoNodeRow` (memo'd
to avoid re-renders).

## File touches

**New:**
- `store/slices/geoSelectionSlice.ts` (~40 lines)
- `store/slices/geoSelectionSelectors.ts` (~15 lines)
- `components/territory/sidebar/GeoSelectionDragOverlay.tsx` (~30 lines)
- `lib/isEditableTarget.ts` (~5 lines) — extracted from Toolbar for
  reuse in the sidebar's local keydown handler.

**Modified:**
- `store/types.ts` — add `GeoSelectionSlice` to the `TerritoryStore` union.
- `store/territoryStore.ts` — create the slice (not persisted).
- `store/slices/geoSlice.ts` — `reorderGeoNodes`, `removeGeoNodes`
  bulk actions added (~80 lines additional).
- `components/territory/sidebar/GeoSidebarPanel.tsx` — bulk drag
  start/end, DragOverlay mount, keydown + background-click handlers,
  visibleOrder prop, `data-geo-sidebar-root` attribute, `tabIndex={-1}`.
- `components/territory/sidebar/GeoNodeRow.tsx` — click dispatcher,
  isSelected ring/bg, `bulkDragActive` prop + dim styling,
  `visibleOrder` prop forwarded.
- `components/territory/toolbar/Toolbar.tsx` — single early-return on
  the Esc case when focus is inside the sidebar; switches from local
  `isEditableTarget` to the lifted `lib/isEditableTarget` helper.

## Edge cases

- **Shift-click with no anchor**: `extendGeoSelection` treats `toId`
  as the anchor (selects only that node, sets anchor).
- **Cmd-click on the only selected node**: toggle removes it,
  selection becomes empty, anchor still points at the now-removed id
  (harmless; next shift-click sets a new anchor).
- **Bulk drag where one selected node is a descendant of another in
  the same batch**: e.g. selecting a parent and its child, then
  dragging. `reorderGeoNodes` reparents both; the child's parentId
  doesn't change (still pointing at the parent), so only the parent's
  parentId update is written. `geoNodeOrder` puts them in their
  selection-order at the new location.
- **Bulk delete on a node that's currently the active paint target**:
  the slice's existing `activePaintGeoId` invalidation logic clears
  it. The cascade dropIds union catches descendants.
- **Search active while a selection exists**: drag is disabled (per
  existing `dragDisabled = filter !== null` logic). Selection state
  persists; clearing search re-enables drag with the selection intact.
- **`g` shortcut focuses first row while a multi-selection exists**:
  focus moves to the first row but selection is unaffected. Esc from
  the focused row clears selection (local handler) without bubbling
  to the Toolbar.
- **Plain click while selection exists**: clears selection AND
  toggles paint mode on the clicked node. This is the documented
  "back to single-node mode" gesture.

## Verification

- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `npm run build` clean.
- Manual smoke (user):
  1. Click row A → paint mode activates on A, no selection visible.
  2. Cmd-click rows B, C, D → selection ring on each; paint mode
     unaffected.
  3. Shift-click row F → range from anchor (D, because cmd-click
     moves the anchor) to F is selected, replacing the previous set.
  4. Drag any selected row → all selected rows dim, DragOverlay shows
     count, drop reparents the whole batch.
  5. Drag an unselected row → singleton drag, selection unchanged.
  6. Press Backspace while selection exists → confirm dialog; OK
     deletes all + descendants, Cancel preserves.
  7. Press Esc → clears selection, doesn't trigger Toolbar Esc cascade.
  8. Plain click any row → selection clears, paint mode toggles on
     that row.
  9. Click empty sidebar area → selection clears, paint mode
     unaffected.
