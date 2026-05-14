# Territory Polish-C — undo/redo across geo ops + animated tree expand/collapse

Date: 2026-05-13
Status: design

## Background

Third of four follow-up polish passes on territory sub-projects 3 & 4.

- Polish-A (shipped) — map selection chip + `/` / `g` shortcuts.
- Polish-B (shipped) — Geos sidebar multi-select.
- **Polish-C (this spec)** — undo/redo for all geo data ops plus
  smooth tree expand/collapse animation.
- Polish-D — SP3 motion: animated drill transition + pan momentum.

Today the slice has `geoUndoStack: NodeCodesPatch[][]` which captures
ONLY the four paint/eraser ops. Structural mutations — rename, color,
add, reorder (single + bulk from Polish-B), remove (single + bulk
from Polish-B) — bypass the undo stack entirely. Cmd-Z is bound to
`undoGeoAssignment` in the Toolbar but only paint operations are
reversible.

The tree's expand/collapse is also instantaneous: `{showExpanded &&
children.map(...)}` causes children to pop in and out with only the
chevron rotating.

## Goals

1. **Universal geo-op undo/redo**: a single ⌘Z / ⇧⌘Z (or ⌘Y) reverses
   any of: paint, rename, color, add, remove, reorder. Including
   Polish-B's bulk reorder and bulk delete.
2. **Smooth tree animation**: expand/collapse animates the height of
   the subtree with a 200ms ease-out. Reduced-motion users get the
   instant toggle.

Non-goals: tab-style multi-document undo; redo of operations after
the page reloads (the stack is session-only, matching the current
behavior); animating drag/drop reorders inside the tree (separate
concern); persisting the undo stack.

## Part 1 — Undo/redo

### 1.1 Op shape

Define a discriminated union `GeoOp` at the top of
`store/slices/geoSlice.ts`. The existing `NodeCodesPatch` type stays
as-is and becomes the inner payload of the `paint` variant.

```ts
type GeoOp =
  | { kind: 'paint'; patches: NodeCodesPatch[] }
  | { kind: 'rename'; id: string; before: string; after: string }
  | { kind: 'color'; id: string; before: string | null; after: string | null }
  | { kind: 'add'; node: GeoNode; sortIndex: number }
  | {
      kind: 'remove';
      mode: 'cascade' | 'reparent-children';
      removedNodes: GeoNode[];
      orderIndices: Record<string, number>;
      liftedChildren?: Array<{ id: string; beforeParentId: string }>;
    }
  | {
      kind: 'reorder';
      parentChanges: Array<{ id: string; beforeParentId: string | null }>;
      beforeOrder: string[];
      afterOrder: string[];
    };
```

### 1.2 Renames

The existing paint-flavored identifiers expand to cover the broader
scope:

| Before | After |
|---|---|
| `geoUndoStack: NodeCodesPatch[][]` | `geoOpUndoStack: GeoOp[]` |
| `geoRedoStack: NodeCodesPatch[][]` | `geoOpRedoStack: GeoOp[]` |
| `undoGeoAssignment()` | `undoGeoOp()` |
| `redoGeoAssignment()` | `redoGeoOp()` |
| `useCanUndoGeo`, `useCanRedoGeo` | unchanged (already generic) |
| Toolbar tooltip "Undo Geo assignment" | "Undo" (with the `⌘Z` hint preserved) |
| Toolbar tooltip "Redo Geo assignment" | "Redo" (with the `⇧⌘Z` hint preserved) |

`MAX_UNDO = 50` is preserved. Stack semantics (push on mutate, clear
redo on push, replay on undo, swap stacks on undo/redo) are
preserved.

### 1.3 Push sites — what each action records

Every push is one user gesture = one stack entry, even for bulk ops
that touch many nodes. The push happens INSIDE the `set()` callback
so the captured "before" state matches what the action then replaces.

| Action | Op pushed |
|---|---|
| `assignCountryToGeo`, `assignStateToGeo`, `clearCountryAssignment`, `clearStateAssignment` | `{kind:'paint', patches}` (no change in patch shape) |
| `updateGeoNode(id, {name})` | `{kind:'rename', id, before, after}` |
| `updateGeoNode(id, {color})` | `{kind:'color', id, before, after}` |
| `updateGeoNode(id, {name, color})` (both) | pushes TWO entries — one rename + one color |
| `addGeoNode(name, parentId, color)` | `{kind:'add', node: createdNode, sortIndex}` |
| `removeGeoNode(id, mode)`, `removeGeoNodes(ids, mode)` | `{kind:'remove', mode, removedNodes, orderIndices, liftedChildren?}` |
| `reorderGeoNode(...)`, `reorderGeoNodes(...)`, `reparentGeoNode(...)` | `{kind:'reorder', parentChanges, beforeOrder, afterOrder}` |

`orderIndices` captures each removed node's position in
`geoNodeOrder` BEFORE removal — used to restore exact positions on
undo. `liftedChildren` is populated only when `mode ===
'reparent-children'` and records each child whose parent was lifted
to the grandparent.

`parentChanges` records only ids whose parentId actually changed
(pure sort reorders push an empty array). `beforeOrder` /
`afterOrder` are full snapshots of `geoNodeOrder` before/after.

`reparentGeoNode` isn't called from any current UI path, but is part
of the slice API. Treating it as a degenerate `reorder` keeps the
push site uniform.

If a mutation is rejected by validation (e.g., `reorderGeoNodes`
detects a cycle and returns the previous state), NOTHING is pushed —
no-op user actions don't pollute the undo stack.

### 1.4 Undo/redo dispatch

`undoGeoOp` pops the top of `geoOpUndoStack`, applies the inverse,
pushes the same op onto `geoOpRedoStack`. Per-kind semantics:

**paint**
- Local: restore `countryCodes`/`stateCodes` from each patch's
  `before`. Skip patches whose target id no longer exists (matches
  the current `paint` undo behavior).
- Directus: `updateGeoNodeRemote(id, {countryCodes, stateCodes})` per
  applied patch.

**rename**
- Local: if `geoNodes[id]` exists, set `name = before`. Else no-op.
- Directus: `updateGeoNodeRemote(id, {name: before})`.

**color**
- Local: if `geoNodes[id]` exists, set `color = before`. Else no-op.
- Directus: `updateGeoNodeRemote(id, {color: before})`.

**add**
- Local: delete `geoNodes[id]` and filter id out of `geoNodeOrder`.
  If `activePaintGeoId === id`, null it (matches the existing
  `removeGeoNode` invalidation).
- Directus: `deleteGeoNodes([id])`.

**remove**
- Local: for each `removedNode`, re-insert into `geoNodes`. Restore
  positions in `geoNodeOrder` by:
  - filtering out any id in `removedNodes` that's already present
    (shouldn't happen but defensive);
  - building the new order by walking the current `geoNodeOrder` and
    inserting each removed id at its captured `orderIndices[id]`
    position (sort entries by index ascending, then splice in
    sequence). The result is the previous order with any
    same-position entries restored.
- For `reparent-children` mode, additionally revert each
  `liftedChildren[i].parentId` to `beforeParentId` in `geoNodes`.
- Directus: per removed node `createGeoNode(node, orderIndices[id])`;
  per lifted child `updateGeoNodeRemote(id, {parentId: beforeParentId})`;
  then one `reorderGeoNodes(restoredOrder)` to align the global sort.

**reorder**
- Local: set `geoNodeOrder = beforeOrder`. For each `parentChange`,
  set `geoNodes[id].parentId = beforeParentId`.
- Directus: per parent change `updateGeoNodeRemote(id, {parentId:
  beforeParentId})`; one `reorderGeoNodes(beforeOrder)`.

Redo mirrors each. For `remove` redo, delete the nodes again
(cascade or reparent-children depending on `mode`) and write the
corresponding Directus deletes/lifts.

### 1.5 What undo does NOT restore

Undo restores only the data model:
`geoNodes` + `geoNodeOrder` + per-node `name` / `color` /
`countryCodes` / `stateCodes` / `parentId`.

It does NOT restore:
- `activePaintGeoId` (UI state — current paint target)
- `activeEraser`, `selectActive` (UI mode flags)
- `selectedGeoNodeIds`, `selectionAnchorId` (multi-select state)
- `pinnedEntityIso` (map pin)
- Any persisted UI prefs

If an op (e.g. `removeGeoNode`) zeroed `activePaintGeoId` because
the active node was deleted, that side effect stays in place even
after the delete is undone. The user can manually re-activate paint
mode if they want.

### 1.6 Edge cases

- **Skip-on-missing**: each replay branch checks `geoNodes[id]`
  existence before applying, matching the existing paint undo. If a
  node referenced in a stale stack entry no longer exists, that
  per-id step silently no-ops.
- **Empty stack**: undo/redo on an empty stack returns state
  unchanged.
- **Server-side id rejection on `createGeoNode` during remove-undo**:
  documented as a known limitation. Directus has accepted
  client-supplied UUIDs since Phase 1; if it ever stops, local state
  remains correct and a page refresh recovers from divergence. Out
  of scope to defensively handle.
- **Rejected mutations don't push**: every push site is inside the
  validating `set()` callback. If the validator returns state
  unchanged (e.g., cycle in `reorderGeoNodes`, missing id in
  `reparentGeoNode`), no entry is added.
- **Same-id rename followed by paint**: each pushes a separate
  entry; undo unwinds in reverse order naturally.

## Part 2 — Animated tree expand/collapse

### 2.1 Wrap the recursive descent in a grid-rows container

In `components/territory/sidebar/GeoNodeRow.tsx`, the current
recursive render is:

```tsx
{showExpanded && children.map((c) => (
  <GeoNodeRow ... />
))}
```

Replace with:

```tsx
<div
  className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out ${
    showExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
  }`}
  aria-hidden={!showExpanded}
>
  <div className="overflow-hidden">
    {children.map((c) => (
      <GeoNodeRow
        key={c.id}
        nodeId={c.id}
        depth={depth + 1}
        visibleIds={visibleIds}
        forceExpandIds={forceExpandIds}
        dragDisabled={dragDisabled}
        descendantIds={descendantIds}
        visibleOrder={visibleOrder}
        bulkDragSet={bulkDragSet}
        activeDragId={activeDragId}
      />
    ))}
  </div>
</div>
```

Two structural notes:
- Children are now ALWAYS mounted (rendered into the inner div), even
  while collapsed. `overflow-hidden` clips them. This is the
  standard cost of the grid-rows technique — DOM stays present.
- `aria-hidden={!showExpanded}` keeps assistive tech from announcing
  collapsed subtrees.

### 2.2 Reduced-motion

The `motion-safe:` Tailwind prefix gates the transition properties
behind `@media (prefers-reduced-motion: no-preference)`. Users with
`prefers-reduced-motion: reduce` get the toggle instantly.

### 2.3 dnd-kit interaction

Children stay mounted during collapse, so dnd-kit's droppable
registry still includes them. In practice, hit testing requires the
cursor to be inside the rendered bounding box; the
`overflow-hidden` parent has zero height when collapsed, so no
visible drop zones are reachable. Selected nodes inside a collapsed
subtree can still be moved via keyboard sensors — acceptable
behavior; no special handling required.

If we later observe issues with phantom drop targets during the
collapse animation (mid-transition the rows are partially visible),
we'd add `pointer-events-none` to the outer grid container when
`!showExpanded` — for Polish-C this is unnecessary.

## File touches

**Modified:**
- `store/slices/geoSlice.ts` — new `GeoOp` union; renamed stack
  fields; updated `MAX_UNDO` site; new push sites in `updateGeoNode`,
  `addGeoNode`, `reparentGeoNode`, `reorderGeoNode`,
  `reorderGeoNodes`, `removeGeoNode`, `removeGeoNodes`; rewritten
  `undoGeoOp`/`redoGeoOp` with `kind` dispatch. The existing
  `assignCountryToGeo`/`assignStateToGeo`/`clearCountryAssignment`/
  `clearStateAssignment` push the new `{kind:'paint', patches}`
  shape. `geoPersistKeys` is unchanged (the stacks aren't persisted).
- `store/selectors.ts` — `useCanUndoGeo`/`useCanRedoGeo` switch to
  `geoOpUndoStack`/`geoOpRedoStack`.
- `components/territory/toolbar/Toolbar.tsx` — action name imports
  rename to `undoGeoOp`/`redoGeoOp`; button tooltips update to "Undo"
  / "Redo" (with the keystroke hint).
- `components/territory/sidebar/GeoNodeRow.tsx` — wrap the recursive
  render in the grid-rows container.

No new files. No new dependencies.

## Verification

- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `npm run build` clean.
- Manual smoke (user):
  1. Rename a node via inline editor → ⌘Z restores old name. ⇧⌘Z
     reapplies.
  2. Change a node's color via swatch → ⌘Z restores old color.
  3. Click "New geo" → ⌘Z removes the just-created node.
  4. Click ✕ on a node with no children → ⌘Z restores it at the
     same position.
  5. Click ✕ on a node WITH children (cascade) → ⌘Z restores parent
     + all descendants at original positions.
  6. Bulk delete via Backspace (Polish-B) → ⌘Z restores all deleted
     nodes at original positions.
  7. Drag-reorder a node → ⌘Z restores prior order + parent.
  8. Bulk-drag (Polish-B) → ⌘Z restores prior order + parents for
     all moved nodes.
  9. Paint a country → ⌘Z still works exactly as before.
  10. Mixed sequence (rename + paint + reorder + delete) → ⌘Z four
      times unwinds in reverse.
  11. Toolbar undo/redo buttons reflect canUndo/canRedo correctly
      across all op types.
  12. Expand/collapse a row with children → smooth 200ms height
      animation. `prefers-reduced-motion: reduce` users see instant
      toggle.
