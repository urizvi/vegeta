# Territory Sidebar Hierarchy Editing — Design

Date: 2026-05-09
Sub-project: 4 of the territory rework
Touches: `components/territory/sidebar/*`, `store/slices/geoSlice.ts`

## Goal

Turn the Geos sidebar into a real tree editor: drag-and-drop reorder
and reparent, inline rename, search-within-tree with ancestor
auto-expand, and a per-node color picker. No page navigation, no modal
dialogs.

Multi-select bulk operations are explicitly **deferred** — single-node
DnD covers the main value; tree multi-select with mixed depths has
ambiguous semantics and can be revisited as a follow-up.

## Dependencies

Add `@dnd-kit/core` and `@dnd-kit/sortable` (~14kb total). Chosen over
HTML5 native DnD because keyboard accessibility (Space-pickup,
Arrow-move, Enter-drop) is included for free and matches the
keyboard-first pattern from sub-project 3.

## Data & state

`GeoNode` type unchanged — `parentId` already exists, and ordering
lives on the flat `geoNodeOrder: string[]` array on `geoSlice` (already
persisted to Directus as `sort` via existing write helpers).

New `geoSlice` action:

```ts
reorderGeoNode(
  id: string,
  newParentId: string | null,
  beforeId: string | null,
): void
```

Behavior:

1. Reject when `id === newParentId` or `newParentId` is a descendant of
   `id` (reuse existing `isAncestor`).
2. If `parentId` changed, patch `geoNodes[id].parentId`.
3. Splice `id` out of `geoNodeOrder`, then insert at the index of
   `beforeId` (or push to end if `beforeId === null`).
4. Fire writes: `updateGeoNodeRemote(id, { parentId })` plus a sort
   rewrite for the moved node and its new immediate neighbor (matches
   the `addGeoNode` pattern that already sets `sort` on create).

## Component structure

### `GeoSidebarPanel.tsx`

- New `<input>` at top: search-within-tree. Local `useState<string>`.
- When non-empty, filter visible nodes to those whose name matches
  (case-insensitive) **or** whose descendant matches. Auto-expand
  ancestors of every match by adding their ids to the existing
  `expandedIds` set.
- Wrap the rendered tree in a single
  `<DndContext sensors={[PointerSensor, KeyboardSensor]}
  collisionDetection={pointerWithin}>` with one flat
  `<SortableContext>` containing every currently-visible node id.
  Nesting is visual (depth indent) — sibling vs. nest is determined
  by the pointer-Y zone within each row, not by nested contexts.
- `onDragStart`: pre-compute the descendant set of the active id, used
  to dim invalid drop targets.
- `onDragEnd`: resolve `newParentId` and `beforeId` from the over-row +
  drop zone, then dispatch `reorderGeoNode`.
- While search is active, disable drag (filtered tree breaks reorder
  semantics). Show a hover hint: "Exit search to reorder."

### `GeoNodeRow.tsx`

- Consumes `useSortable({ id })`. The existing chevron/handle area
  receives `attributes` + `listeners`.
- Three drop zones based on pointer Y:
  - **Top third** → insert-before-sibling (2px brand insertion line at
    row top).
  - **Middle third** → nest-as-child (brand-soft background fill).
  - **Bottom third** → insert-after-sibling (2px brand insertion line
    at row bottom).
- **Inline rename**: double-click the name → swap to `<input>`. Enter
  commits via `updateGeoNode({ name: trimmed })`, Esc cancels, blur
  commits. Reject empty after trim. Duplicates allowed (no uniqueness
  constraint exists today).
- **Color swatch button** (new, leading the row before the chevron):
  shows the resolved color (own or nearest ancestor's). Click opens
  `<ColorPickerPopover>`.

### `ColorPickerPopover.tsx` (new)

- 10 brand-tuned swatches in a 5×2 grid + an "Inherit" chip + a hex
  `<input>` validated by `/^#[0-9a-f]{6}$/i`.
- Selecting a swatch / valid hex calls `updateGeoNode({ color })`.
  "Inherit" calls `updateGeoNode({ color: null })`.
- Closes on outside-click (mirrors `MapHelpPopover` overlay pattern
  from sub-project 3).

## Keyboard interaction

Provided by `@dnd-kit` `KeyboardSensor`:

- **Space** — pick up / drop.
- **Arrow Up / Down** — move between siblings while dragging.
- **Arrow Right** — nest into the prior sibling.
- **Arrow Left** — un-nest (move out to grandparent).
- **Esc** — cancel.

All translate to single `reorderGeoNode` calls on drop.

## Persistence

`geoPersistKeys` unchanged (`geoNodes`, `geoNodeOrder`). Both are
already persisted by the existing Directus write layer. No schema
migration required.

## Out of scope (deferred)

- Multi-select (shift-click range, cmd-click toggle, bulk drag, bulk
  delete via Backspace).
- Animated tree open/close transitions beyond the existing chevron.
- Undo/redo for reorder/rename/color (the slice has `geoUndoStack` /
  `geoRedoStack` but they're currently scoped to paint operations;
  extending them is a separate piece of work).

## Verification

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- Manual UI smoke: same-parent reorder, nest, un-nest, dblclick
  rename (commit + cancel + empty-reject), search with auto-expand
  ancestors, color picker swatch + hex + inherit, keyboard
  Space/Arrow drag.

The repo has no automated test suite, so verification is manual UI
smoke + the three static checks above.
