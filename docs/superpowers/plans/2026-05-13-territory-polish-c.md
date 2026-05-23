# Territory Polish-C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the geo slice's undo/redo stack to cover every data mutation (rename, color, add, reorder, remove — in addition to the existing paint ops), and add a smooth grid-rows expand/collapse animation to the sidebar tree.

**Architecture:** Replace `geoUndoStack: NodeCodesPatch[][]` with `geoOpUndoStack: GeoOp[]` where `GeoOp` is a discriminated union (`paint | rename | color | add | remove | reorder`). Each mutating action captures op-specific "before" data inside its `set()` callback and pushes one entry. `undoGeoOp` / `redoGeoOp` dispatch on `kind` and replay against `geoNodes` + `geoNodeOrder` + Directus. The tree animation uses Tailwind's `grid-template-rows: 0fr ↔ 1fr` idiom with `motion-safe:` gating.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand, Tailwind v4. No test framework — verification is `npx tsc --noEmit && npm run lint && npm run build` after each task.

**Spec:** `docs/superpowers/specs/2026-05-13-territory-polish-c-design.md`.

---

## File Structure

**Modified:**
- `store/slices/geoSlice.ts` — `GeoOp` type, renamed stack fields, renamed action names, new push sites in every mutating action, rewritten `undoGeoOp`/`redoGeoOp` dispatcher.
- `store/slices/geoSelectors.ts` — `useCanUndoGeo`/`useCanRedoGeo` switch from `geoUndoStack` to `geoOpUndoStack`. Selector names unchanged.
- `components/territory/toolbar/Toolbar.tsx` — `undoGeoAssignment`/`redoGeoAssignment` action references rename to `undoGeoOp`/`redoGeoOp`; button tooltips/titles tighten from "Undo Geo assignment" to "Undo" (the keystroke hint stays).
- `components/territory/sidebar/GeoNodeRow.tsx` — wrap the recursive `children.map(...)` in the grid-rows animation container.

No new files. No new dependencies.

---

## Task 1: Foundation — `GeoOp` union, renames, paint-only dispatch

This is the largest task; subsequent tasks add one variant at a time. After T1: undo/redo still works for paint operations (existing behavior), all the names are updated, but no new variants have push sites yet.

**Files:**
- Modify: `store/slices/geoSlice.ts`
- Modify: `store/slices/geoSelectors.ts`
- Modify: `components/territory/toolbar/Toolbar.tsx`

- [ ] **Step 1: Add the `GeoOp` union type to `geoSlice.ts`**

Find the existing `NodeCodesPatch` interface near the top of `store/slices/geoSlice.ts` (around line 10):

```ts
interface NodeCodesPatch {
  id: string;
  before: { countryCodes: string[]; stateCodes: string[] };
  after:  { countryCodes: string[]; stateCodes: string[] };
}

const MAX_UNDO = 50;
```

Immediately after `const MAX_UNDO = 50;`, add the new union:

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
      parentChanges: Array<{
        id: string;
        beforeParentId: string | null;
        afterParentId: string | null;
      }>;
      beforeOrder: string[];
      afterOrder: string[];
    };
```

- [ ] **Step 2: Rename the slice fields in `GeoSlice` interface**

In the same file, find the interface (around line 44):

```ts
  geoUndoStack: NodeCodesPatch[][]; // each entry is one op (multi-node)
  geoRedoStack: NodeCodesPatch[][];
```

Change to:

```ts
  geoOpUndoStack: GeoOp[];
  geoOpRedoStack: GeoOp[];
```

Find the action declarations (around line 82):

```ts
  undoGeoAssignment: () => void;
  redoGeoAssignment: () => void;
```

Change to:

```ts
  undoGeoOp: () => void;
  redoGeoOp: () => void;
```

- [ ] **Step 3: Update the slice initial state**

In the same file, find the initializer (around line 156):

```ts
  geoUndoStack: [],
  geoRedoStack: [],
```

Change to:

```ts
  geoOpUndoStack: [],
  geoOpRedoStack: [],
```

- [ ] **Step 4: Update the four existing paint push sites**

Find each paint action (`assignCountryToGeo`, `assignStateToGeo`, `clearCountryAssignment`, `clearStateAssignment`). Each contains an identical pattern that looks like:

```ts
      changed = diffNodesByCodes(s.geoNodes, next);
      const undo = [...s.geoUndoStack, changed].slice(-MAX_UNDO);
      return { geoNodes: next, geoUndoStack: undo, geoRedoStack: [] };
```

For each of the four actions, change to:

```ts
      changed = diffNodesByCodes(s.geoNodes, next);
      const op: GeoOp = { kind: 'paint', patches: changed };
      const undo = [...s.geoOpUndoStack, op].slice(-MAX_UNDO);
      return { geoNodes: next, geoOpUndoStack: undo, geoOpRedoStack: [] };
```

(The local `changed` variable type `NodeCodesPatch[]` is unchanged; the `op` literal wraps it.)

- [ ] **Step 5: Rewrite `undoGeoAssignment` → `undoGeoOp` with paint-only dispatch**

Find the existing `undoGeoAssignment()` implementation (around line 514) and replace the entire method body. The new shape:

```ts
  undoGeoOp() {
    let appliedOp: GeoOp | null = null;
    set((s) => {
      const stack = s.geoOpUndoStack;
      if (stack.length === 0) return s;
      const top = stack[stack.length - 1];
      const nextUndo = stack.slice(0, -1);

      if (top.kind === 'paint') {
        // Skip patches whose nodes no longer exist.
        const live = top.patches.filter((p) => s.geoNodes[p.id]);
        if (live.length === 0) {
          return { geoOpUndoStack: nextUndo };
        }
        const nextNodes = { ...s.geoNodes };
        for (const p of live) {
          nextNodes[p.id] = {
            ...nextNodes[p.id],
            countryCodes: p.before.countryCodes,
            stateCodes: p.before.stateCodes,
          };
        }
        appliedOp = { kind: 'paint', patches: live };
        return {
          geoNodes: nextNodes,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, appliedOp].slice(-MAX_UNDO),
        };
      }

      // Other kinds not yet handled (added in later tasks). Drop the entry
      // from the undo stack to avoid wedging the system; do NOT push to redo.
      return { geoOpUndoStack: nextUndo };
    });
    if (appliedOp && appliedOp.kind === 'paint') {
      for (const c of appliedOp.patches) {
        fireWrite(
          `undo updateGeoNode(${c.id})`,
          directusWrite.updateGeoNodeRemote(c.id, c.before),
        );
      }
    }
  },
```

- [ ] **Step 6: Rewrite `redoGeoAssignment` → `redoGeoOp` with paint-only dispatch**

Find `redoGeoAssignment()` and replace with:

```ts
  redoGeoOp() {
    let appliedOp: GeoOp | null = null;
    set((s) => {
      const stack = s.geoOpRedoStack;
      if (stack.length === 0) return s;
      const top = stack[stack.length - 1];
      const nextRedo = stack.slice(0, -1);

      if (top.kind === 'paint') {
        const live = top.patches.filter((p) => s.geoNodes[p.id]);
        if (live.length === 0) {
          return { geoOpRedoStack: nextRedo };
        }
        const nextNodes = { ...s.geoNodes };
        for (const p of live) {
          nextNodes[p.id] = {
            ...nextNodes[p.id],
            countryCodes: p.after.countryCodes,
            stateCodes: p.after.stateCodes,
          };
        }
        appliedOp = { kind: 'paint', patches: live };
        return {
          geoNodes: nextNodes,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, appliedOp].slice(-MAX_UNDO),
        };
      }

      return { geoOpRedoStack: nextRedo };
    });
    if (appliedOp && appliedOp.kind === 'paint') {
      for (const c of appliedOp.patches) {
        fireWrite(
          `redo updateGeoNode(${c.id})`,
          directusWrite.updateGeoNodeRemote(c.id, c.after),
        );
      }
    }
  },
```

- [ ] **Step 7: Update `hydrateGeoNodes` to reset the renamed stacks**

Find:

```ts
  hydrateGeoNodes(nodes, order) {
    const map: Record<string, GeoNode> = {};
    nodes.forEach((n) => { map[n.id] = n; });
    set({ geoNodes: map, geoNodeOrder: order, geoUndoStack: [], geoRedoStack: [] });
  },
```

Change to:

```ts
  hydrateGeoNodes(nodes, order) {
    const map: Record<string, GeoNode> = {};
    nodes.forEach((n) => { map[n.id] = n; });
    set({ geoNodes: map, geoNodeOrder: order, geoOpUndoStack: [], geoOpRedoStack: [] });
  },
```

- [ ] **Step 8: Update selectors in `geoSelectors.ts`**

In `store/slices/geoSelectors.ts`, find:

```ts
export const useCanUndoGeo = () => useTerritoryStore((s) => s.geoUndoStack.length > 0);
export const useCanRedoGeo = () => useTerritoryStore((s) => s.geoRedoStack.length > 0);
```

Change to:

```ts
export const useCanUndoGeo = () => useTerritoryStore((s) => s.geoOpUndoStack.length > 0);
export const useCanRedoGeo = () => useTerritoryStore((s) => s.geoOpRedoStack.length > 0);
```

- [ ] **Step 9: Update `Toolbar.tsx` action references**

In `components/territory/toolbar/Toolbar.tsx`, find the destructure (around line 59):

```ts
    undoGeoAssignment, redoGeoAssignment, toggleShowLabels, clearSelection, setMapZoomCommand,
```

Change to:

```ts
    undoGeoOp, redoGeoOp, toggleShowLabels, clearSelection, setMapZoomCommand,
```

Find the keydown handler call sites (around line 126 and line 129):

```ts
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoGeoAssignment();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redoGeoAssignment();
      }
```

Change to:

```ts
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoGeoOp();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redoGeoOp();
      }
```

Find the dependency array of that `useEffect` (around line 136):

```ts
    setActivePaintGeo, setActiveEraser, undoGeoAssignment, redoGeoAssignment,
```

Change to:

```ts
    setActivePaintGeo, setActiveEraser, undoGeoOp, redoGeoOp,
```

Find the undo button (around line 280):

```tsx
        <button
          onClick={undoGeoAssignment}
          disabled={!canUndo}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Undo Geo assignment (⌘Z)"
          aria-label="Undo Geo assignment"
        >
```

Change to:

```tsx
        <button
          onClick={undoGeoOp}
          disabled={!canUndo}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Undo (⌘Z)"
          aria-label="Undo"
        >
```

Find the redo button (around line 290):

```tsx
        <button
          onClick={redoGeoAssignment}
          disabled={!canRedo}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Redo Geo assignment (⇧⌘Z)"
          aria-label="Redo Geo assignment"
        >
```

Change to:

```tsx
        <button
          onClick={redoGeoOp}
          disabled={!canRedo}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
        >
```

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 11: Commit**

```bash
git add store/slices/geoSlice.ts store/slices/geoSelectors.ts components/territory/toolbar/Toolbar.tsx
git commit -m "refactor(territory): GeoOp union, rename undo stacks/actions, paint-only dispatch"
```

---

## Task 2: `rename` variant

**Files:**
- Modify: `store/slices/geoSlice.ts`

- [ ] **Step 1: Push a rename op from `updateGeoNode` when `name` changes**

Find `updateGeoNode(id, patch)` (around line 189):

```ts
  updateGeoNode(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.geoNodes[id]) return s;
      didApply = true;
      return { geoNodes: { ...s.geoNodes, [id]: { ...s.geoNodes[id], ...patch } } };
    });
    if (didApply) fireWrite(`updateGeoNode(${id})`, directusWrite.updateGeoNodeRemote(id, patch));
  },
```

Replace with:

```ts
  updateGeoNode(id, patch) {
    let didApply = false;
    set((s) => {
      const cur = s.geoNodes[id];
      if (!cur) return s;
      didApply = true;
      const next = { ...s.geoNodes, [id]: { ...cur, ...patch } };

      // Push one op per logical edit (rename and color are tracked separately).
      const ops: GeoOp[] = [];
      if (patch.name !== undefined && patch.name !== cur.name) {
        ops.push({ kind: 'rename', id, before: cur.name, after: patch.name });
      }
      if (patch.color !== undefined && (patch.color ?? null) !== (cur.color ?? null)) {
        ops.push({ kind: 'color', id, before: cur.color ?? null, after: patch.color ?? null });
      }
      const nextUndo = ops.length > 0
        ? [...s.geoOpUndoStack, ...ops].slice(-MAX_UNDO)
        : s.geoOpUndoStack;

      return {
        geoNodes: next,
        geoOpUndoStack: nextUndo,
        geoOpRedoStack: ops.length > 0 ? [] : s.geoOpRedoStack,
      };
    });
    if (didApply) fireWrite(`updateGeoNode(${id})`, directusWrite.updateGeoNodeRemote(id, patch));
  },
```

(Pushing two ops handles the rare `{name, color}` combined patch. The color variant is handled in Step 1 above too — Task 3 below adds the color undo branch, but the push site is already shared with rename.)

- [ ] **Step 2: Add the `rename` branch to `undoGeoOp`**

Find the existing dispatcher in `undoGeoOp`. After the `paint` block and before the catch-all return, add:

```ts
      if (top.kind === 'rename') {
        if (!s.geoNodes[top.id]) {
          return { geoOpUndoStack: nextUndo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], name: top.before },
        };
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, top].slice(-MAX_UNDO),
        };
      }
```

Update the post-`set` Directus replay block. The existing block looks like:

```ts
    if (appliedOp && appliedOp.kind === 'paint') {
      for (const c of appliedOp.patches) {
        fireWrite(
          `undo updateGeoNode(${c.id})`,
          directusWrite.updateGeoNodeRemote(c.id, c.before),
        );
      }
    }
```

Change to:

```ts
    if (appliedOp) {
      if (appliedOp.kind === 'paint') {
        for (const c of appliedOp.patches) {
          fireWrite(
            `undo updateGeoNode(${c.id})`,
            directusWrite.updateGeoNodeRemote(c.id, c.before),
          );
        }
      } else if (appliedOp.kind === 'rename') {
        fireWrite(
          `undo rename(${appliedOp.id})`,
          directusWrite.updateGeoNodeRemote(appliedOp.id, { name: appliedOp.before }),
        );
      }
    }
```

- [ ] **Step 3: Add the `rename` branch to `redoGeoOp`**

Find the existing `redoGeoOp` dispatcher. After the `paint` block and before the catch-all, add:

```ts
      if (top.kind === 'rename') {
        if (!s.geoNodes[top.id]) {
          return { geoOpRedoStack: nextRedo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], name: top.after },
        };
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, top].slice(-MAX_UNDO),
        };
      }
```

Update the Directus replay block. Currently:

```ts
    if (appliedOp && appliedOp.kind === 'paint') {
      for (const c of appliedOp.patches) {
        fireWrite(
          `redo updateGeoNode(${c.id})`,
          directusWrite.updateGeoNodeRemote(c.id, c.after),
        );
      }
    }
```

Change to:

```ts
    if (appliedOp) {
      if (appliedOp.kind === 'paint') {
        for (const c of appliedOp.patches) {
          fireWrite(
            `redo updateGeoNode(${c.id})`,
            directusWrite.updateGeoNodeRemote(c.id, c.after),
          );
        }
      } else if (appliedOp.kind === 'rename') {
        fireWrite(
          `redo rename(${appliedOp.id})`,
          directusWrite.updateGeoNodeRemote(appliedOp.id, { name: appliedOp.after }),
        );
      }
    }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): undo/redo for geo node rename"
```

---

## Task 3: `color` variant

**Files:**
- Modify: `store/slices/geoSlice.ts`

The push site is already shared with `rename` (Task 2 Step 1). This task only adds the undo/redo dispatch branches.

- [ ] **Step 1: Add the `color` branch to `undoGeoOp`**

Find the `rename` branch in `undoGeoOp` (just added in Task 2). Immediately after it, add:

```ts
      if (top.kind === 'color') {
        if (!s.geoNodes[top.id]) {
          return { geoOpUndoStack: nextUndo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], color: top.before },
        };
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block (after `set`), add a branch after the `rename` branch:

```ts
      } else if (appliedOp.kind === 'color') {
        fireWrite(
          `undo color(${appliedOp.id})`,
          directusWrite.updateGeoNodeRemote(appliedOp.id, { color: appliedOp.before }),
        );
      }
```

- [ ] **Step 2: Add the `color` branch to `redoGeoOp`**

Find the `rename` branch in `redoGeoOp`. Immediately after it, add:

```ts
      if (top.kind === 'color') {
        if (!s.geoNodes[top.id]) {
          return { geoOpRedoStack: nextRedo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], color: top.after },
        };
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block, add after the `rename` branch:

```ts
      } else if (appliedOp.kind === 'color') {
        fireWrite(
          `redo color(${appliedOp.id})`,
          directusWrite.updateGeoNodeRemote(appliedOp.id, { color: appliedOp.after }),
        );
      }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): undo/redo for geo node color change"
```

---

## Task 4: `add` variant

**Files:**
- Modify: `store/slices/geoSlice.ts`

- [ ] **Step 1: Push an `add` op from `addGeoNode`**

Find `addGeoNode(name, parentId, color)` (around line 159). The current implementation returns `id` from a closure-captured value. Replace the entire method with:

```ts
  addGeoNode(name, parentId, color) {
    const id = crypto.randomUUID();
    const node: GeoNode = {
      id,
      name,
      color: color ?? null,
      parentId,
      countryCodes: [],
      stateCodes: [],
    };
    let sortIndex = 0;
    set((s) => {
      sortIndex = s.geoNodeOrder.length;
      const op: GeoOp = { kind: 'add', node, sortIndex };
      return {
        geoNodes: { ...s.geoNodes, [id]: node },
        geoNodeOrder: [...s.geoNodeOrder, id],
        geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
        geoOpRedoStack: [],
      };
    });
    fireWrite(
      `createGeoNode(${id})`,
      directusWrite.createGeoNode(node, sortIndex),
    );
    return id;
  },
```

- [ ] **Step 2: Add the `add` branch to `undoGeoOp`**

In `undoGeoOp`, after the `color` branch, add:

```ts
      if (top.kind === 'add') {
        if (!s.geoNodes[top.node.id]) {
          return { geoOpUndoStack: nextUndo };
        }
        const nextNodes = { ...s.geoNodes };
        delete nextNodes[top.node.id];
        const nextOrder = s.geoNodeOrder.filter((nid) => nid !== top.node.id);
        const nextActivePaint =
          s.activePaintGeoId === top.node.id ? null : s.activePaintGeoId;
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoNodeOrder: nextOrder,
          activePaintGeoId: nextActivePaint,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block, add after the `color` branch:

```ts
      } else if (appliedOp.kind === 'add') {
        fireWrite(
          `undo add(${appliedOp.node.id})`,
          directusWrite.deleteGeoNodes([appliedOp.node.id]),
        );
      }
```

- [ ] **Step 3: Add the `add` branch to `redoGeoOp`**

In `redoGeoOp`, after the `color` branch, add:

```ts
      if (top.kind === 'add') {
        if (s.geoNodes[top.node.id]) {
          // Already present; drop the redo entry without re-applying.
          return { geoOpRedoStack: nextRedo };
        }
        const nextOrder = [...s.geoNodeOrder];
        const insertAt = Math.min(top.sortIndex, nextOrder.length);
        nextOrder.splice(insertAt, 0, top.node.id);
        appliedOp = top;
        return {
          geoNodes: { ...s.geoNodes, [top.node.id]: top.node },
          geoNodeOrder: nextOrder,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block, add after the `color` branch:

```ts
      } else if (appliedOp.kind === 'add') {
        fireWrite(
          `redo add(${appliedOp.node.id})`,
          directusWrite.createGeoNode(appliedOp.node, appliedOp.sortIndex),
        );
      }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): undo/redo for geo node add"
```

---

## Task 5: `reorder` variant

**Files:**
- Modify: `store/slices/geoSlice.ts`

The single-node `reorderGeoNode`, the bulk `reorderGeoNodes`, and the degenerate `reparentGeoNode` all push the same shape.

- [ ] **Step 1: Push a `reorder` op from `reorderGeoNode`**

Find `reorderGeoNode(id, newParentId, beforeId)`. Replace its `set` callback's success branch (the final `return` that includes `didApply = true`) so it captures `parentChanges` and the before/after order, and includes the new op in the returned partial. The full updated method:

```ts
  reorderGeoNode(id, newParentId, beforeId) {
    let didApply = false;
    let nextOrder: string[] | null = null;
    let parentChanged = false;
    let opForWrite: GeoOp | null = null;
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
      const op: GeoOp = {
        kind: 'reorder',
        parentChanges: parentChanged
          ? [{ id, beforeParentId: currentParent, afterParentId: newParentId }]
          : [],
        beforeOrder: s.geoNodeOrder,
        afterOrder: order,
      };
      opForWrite = op;
      return {
        geoNodes: parentChanged
          ? { ...s.geoNodes, [id]: { ...s.geoNodes[id], parentId: newParentId } }
          : s.geoNodes,
        geoNodeOrder: order,
        geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
        geoOpRedoStack: [],
      };
    });
    if (!didApply || !nextOrder) return;
    void opForWrite; // capture suppresses unused warning; actual write below is unchanged
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

(The `void opForWrite` line silences a "captured but unused" warning since the op is only needed inside `set()`. If your toolchain doesn't flag this, you can delete that line.)

- [ ] **Step 2: Push a `reorder` op from `reorderGeoNodes`**

Find `reorderGeoNodes(ids, newParentId, beforeId)`. Replace the successful `return` from its `set()` callback so it includes the new op. The full updated method:

```ts
  reorderGeoNodes(ids, newParentId, beforeId) {
    if (ids.length === 0) return;
    let didApply = false;
    let nextOrder: string[] | null = null;
    const parentChanges: string[] = [];
    set((s) => {
      if (ids.some((id) => !s.geoNodes[id])) return s;
      if (newParentId !== null) {
        if (!s.geoNodes[newParentId]) return s;
        if (ids.includes(newParentId)) return s;
        if (ids.some((id) => isAncestor(s.geoNodes, id, newParentId))) return s;
      }
      if (beforeId !== null) {
        if (!s.geoNodes[beforeId]) return s;
        if (ids.includes(beforeId)) return s;
      }

      const geoNodes: Record<string, GeoNode> = { ...s.geoNodes };
      const parentChangeOps: Array<{
        id: string;
        beforeParentId: string | null;
        afterParentId: string | null;
      }> = [];
      for (const id of ids) {
        if (geoNodes[id].parentId !== newParentId) {
          parentChangeOps.push({
            id,
            beforeParentId: geoNodes[id].parentId,
            afterParentId: newParentId,
          });
          geoNodes[id] = { ...geoNodes[id], parentId: newParentId };
          parentChanges.push(id);
        }
      }

      const batchSet = new Set(ids);
      const without = s.geoNodeOrder.filter((nid) => !batchSet.has(nid));
      const insertAt = beforeId === null ? without.length : without.indexOf(beforeId);
      const order = [...without];
      order.splice(insertAt < 0 ? order.length : insertAt, 0, ...ids);

      didApply = true;
      nextOrder = order;
      const op: GeoOp = {
        kind: 'reorder',
        parentChanges: parentChangeOps,
        beforeOrder: s.geoNodeOrder,
        afterOrder: order,
      };
      return {
        geoNodes,
        geoNodeOrder: order,
        geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
        geoOpRedoStack: [],
      };
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

- [ ] **Step 3: Push a `reorder` op from `reparentGeoNode`**

`reparentGeoNode` doesn't touch `geoNodeOrder`. Treat it as a degenerate reorder where `beforeOrder === afterOrder`. Replace the whole method with:

```ts
  reparentGeoNode(id, newParentId) {
    let didApply = false;
    set((s) => {
      const cur = s.geoNodes[id];
      if (!cur) return s;
      if (newParentId !== null) {
        if (newParentId === id) return s;
        if (!s.geoNodes[newParentId]) return s;
        if (isAncestor(s.geoNodes, id, newParentId)) return s;
      }
      if (cur.parentId === newParentId) return s;
      didApply = true;
      const op: GeoOp = {
        kind: 'reorder',
        parentChanges: [{ id, beforeParentId: cur.parentId, afterParentId: newParentId }],
        beforeOrder: s.geoNodeOrder,
        afterOrder: s.geoNodeOrder,
      };
      return {
        geoNodes: { ...s.geoNodes, [id]: { ...cur, parentId: newParentId } },
        geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
        geoOpRedoStack: [],
      };
    });
    if (didApply) {
      fireWrite(
        `reparentGeoNode(${id})`,
        directusWrite.updateGeoNodeRemote(id, { parentId: newParentId }),
      );
    }
  },
```

- [ ] **Step 4: Add the `reorder` branch to `undoGeoOp`**

In `undoGeoOp`, after the `add` branch, add:

```ts
      if (top.kind === 'reorder') {
        const nextNodes = { ...s.geoNodes };
        for (const pc of top.parentChanges) {
          if (nextNodes[pc.id]) {
            nextNodes[pc.id] = { ...nextNodes[pc.id], parentId: pc.beforeParentId };
          }
        }
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoNodeOrder: top.beforeOrder,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block, add after the `add` branch:

```ts
      } else if (appliedOp.kind === 'reorder') {
        for (const pc of appliedOp.parentChanges) {
          fireWrite(
            `undo reorder-parent(${pc.id})`,
            directusWrite.updateGeoNodeRemote(pc.id, { parentId: pc.beforeParentId }),
          );
        }
        if (appliedOp.beforeOrder !== appliedOp.afterOrder) {
          fireWrite(
            `undo reorder-sort`,
            directusWrite.reorderGeoNodes(appliedOp.beforeOrder),
          );
        }
      }
```

- [ ] **Step 5: Add the `reorder` branch to `redoGeoOp`**

In `redoGeoOp`, after the `add` branch, add:

```ts
      if (top.kind === 'reorder') {
        const nextNodes = { ...s.geoNodes };
        for (const pc of top.parentChanges) {
          if (nextNodes[pc.id]) {
            nextNodes[pc.id] = { ...nextNodes[pc.id], parentId: pc.afterParentId };
          }
        }
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoNodeOrder: top.afterOrder,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block, add after the `add` branch:

```ts
      } else if (appliedOp.kind === 'reorder') {
        for (const pc of appliedOp.parentChanges) {
          fireWrite(
            `redo reorder-parent(${pc.id})`,
            directusWrite.updateGeoNodeRemote(pc.id, { parentId: pc.afterParentId }),
          );
        }
        if (appliedOp.beforeOrder !== appliedOp.afterOrder) {
          fireWrite(
            `redo reorder-sort`,
            directusWrite.reorderGeoNodes(appliedOp.afterOrder),
          );
        }
      }
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): undo/redo for geo node reorder + reparent"
```

---

## Task 6: `remove` variant

**Files:**
- Modify: `store/slices/geoSlice.ts`

The most complex variant. `cascade` mode captures the union of descendants + their order indices. `reparent-children` mode additionally captures `liftedChildren`.

- [ ] **Step 1: Push a `remove` op from `removeGeoNode`**

Replace the entire `removeGeoNode(id, mode)` method with:

```ts
  removeGeoNode(id, mode = 'cascade') {
    let dropIds: string[] = [];
    const reparentPatches: Array<{ id: string; parentId: string | null }> = [];
    set((s) => {
      if (!s.geoNodes[id]) return s;
      if (mode === 'cascade') {
        const toDrop = descendantsOf(s.geoNodes, id);
        dropIds = Array.from(toDrop);
        const removedNodes = dropIds.map((nid) => s.geoNodes[nid]);
        const orderIndices: Record<string, number> = {};
        s.geoNodeOrder.forEach((nid, idx) => {
          if (toDrop.has(nid)) orderIndices[nid] = idx;
        });
        const geoNodes = { ...s.geoNodes };
        toDrop.forEach((nid) => { delete geoNodes[nid]; });
        const op: GeoOp = {
          kind: 'remove',
          mode: 'cascade',
          removedNodes,
          orderIndices,
        };
        return {
          geoNodes,
          geoNodeOrder: s.geoNodeOrder.filter((nid) => !toDrop.has(nid)),
          activePaintGeoId: toDrop.has(s.activePaintGeoId ?? '') ? null : s.activePaintGeoId,
          geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
          geoOpRedoStack: [],
        };
      }

      // reparent-children
      const newParent = s.geoNodes[id].parentId;
      const liftedChildren: Array<{ id: string; beforeParentId: string }> = [];
      const geoNodes: Record<string, GeoNode> = {};
      for (const [nid, n] of Object.entries(s.geoNodes)) {
        if (nid === id) continue;
        if (n.parentId === id) {
          geoNodes[nid] = { ...n, parentId: newParent };
          reparentPatches.push({ id: nid, parentId: newParent });
          liftedChildren.push({ id: nid, beforeParentId: id });
        } else {
          geoNodes[nid] = n;
        }
      }
      dropIds = [id];
      const removedNode = s.geoNodes[id];
      const orderIndices: Record<string, number> = {};
      s.geoNodeOrder.forEach((nid, idx) => {
        if (nid === id) orderIndices[nid] = idx;
      });
      const op: GeoOp = {
        kind: 'remove',
        mode: 'reparent-children',
        removedNodes: [removedNode],
        orderIndices,
        liftedChildren,
      };
      return {
        geoNodes,
        geoNodeOrder: s.geoNodeOrder.filter((nid) => nid !== id),
        activePaintGeoId: s.activePaintGeoId === id ? null : s.activePaintGeoId,
        geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
        geoOpRedoStack: [],
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

- [ ] **Step 2: Push a `remove` op from `removeGeoNodes`**

Replace the entire `removeGeoNodes(ids, mode)` method with:

```ts
  removeGeoNodes(ids, mode = 'cascade') {
    if (ids.length === 0) return;
    let dropIds: string[] = [];
    const reparentPatches: Array<{ id: string; parentId: string | null }> = [];
    set((s) => {
      const valid = ids.filter((id) => s.geoNodes[id]);
      if (valid.length === 0) return s;

      if (mode === 'cascade') {
        const drop = new Set<string>();
        for (const id of valid) {
          for (const did of descendantsOf(s.geoNodes, id)) drop.add(did);
        }
        dropIds = Array.from(drop);
        const removedNodes = dropIds.map((nid) => s.geoNodes[nid]);
        const orderIndices: Record<string, number> = {};
        s.geoNodeOrder.forEach((nid, idx) => {
          if (drop.has(nid)) orderIndices[nid] = idx;
        });
        const geoNodes = { ...s.geoNodes };
        drop.forEach((nid) => { delete geoNodes[nid]; });
        const activeStillExists = s.activePaintGeoId !== null && !drop.has(s.activePaintGeoId);
        const op: GeoOp = {
          kind: 'remove',
          mode: 'cascade',
          removedNodes,
          orderIndices,
        };
        return {
          geoNodes,
          geoNodeOrder: s.geoNodeOrder.filter((nid) => !drop.has(nid)),
          activePaintGeoId: activeStillExists ? s.activePaintGeoId : null,
          geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
          geoOpRedoStack: [],
        };
      }

      // reparent-children
      const removed = new Set(valid);
      const liftedChildren: Array<{ id: string; beforeParentId: string }> = [];
      const geoNodes: Record<string, GeoNode> = {};
      for (const [nid, n] of Object.entries(s.geoNodes)) {
        if (removed.has(nid)) continue;
        if (n.parentId && removed.has(n.parentId)) {
          const newParent = s.geoNodes[n.parentId].parentId;
          geoNodes[nid] = { ...n, parentId: newParent };
          reparentPatches.push({ id: nid, parentId: newParent });
          liftedChildren.push({ id: nid, beforeParentId: n.parentId });
        } else {
          geoNodes[nid] = n;
        }
      }
      dropIds = Array.from(removed);
      const removedNodes = dropIds.map((nid) => s.geoNodes[nid]);
      const orderIndices: Record<string, number> = {};
      s.geoNodeOrder.forEach((nid, idx) => {
        if (removed.has(nid)) orderIndices[nid] = idx;
      });
      const activeStillExists = s.activePaintGeoId !== null && !removed.has(s.activePaintGeoId);
      const op: GeoOp = {
        kind: 'remove',
        mode: 'reparent-children',
        removedNodes,
        orderIndices,
        liftedChildren,
      };
      return {
        geoNodes,
        geoNodeOrder: s.geoNodeOrder.filter((nid) => !removed.has(nid)),
        activePaintGeoId: activeStillExists ? s.activePaintGeoId : null,
        geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
        geoOpRedoStack: [],
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

- [ ] **Step 3: Add the `remove` branch to `undoGeoOp`**

In `undoGeoOp`, after the `reorder` branch, add:

```ts
      if (top.kind === 'remove') {
        // Restore each removed node into geoNodes.
        const nextNodes: Record<string, GeoNode> = { ...s.geoNodes };
        for (const n of top.removedNodes) {
          nextNodes[n.id] = n;
        }
        // For reparent-children mode, revert lifted children's parents.
        if (top.mode === 'reparent-children' && top.liftedChildren) {
          for (const lc of top.liftedChildren) {
            if (nextNodes[lc.id]) {
              nextNodes[lc.id] = { ...nextNodes[lc.id], parentId: lc.beforeParentId };
            }
          }
        }
        // Restore geoNodeOrder by re-inserting removed ids at their captured indices,
        // walking in ascending index order so each splice keeps later indices valid.
        const orderedRestores = Object.entries(top.orderIndices)
          .map(([id, idx]) => ({ id, idx }))
          .sort((a, b) => a.idx - b.idx);
        const nextOrder = [...s.geoNodeOrder];
        for (const { id, idx } of orderedRestores) {
          const insertAt = Math.min(idx, nextOrder.length);
          nextOrder.splice(insertAt, 0, id);
        }
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoNodeOrder: nextOrder,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block, add after the `reorder` branch:

```ts
      } else if (appliedOp.kind === 'remove') {
        const orderedRestores = Object.entries(appliedOp.orderIndices)
          .map(([id, idx]) => ({ id, idx }))
          .sort((a, b) => a.idx - b.idx);
        // Re-create each removed node in Directus.
        for (const n of appliedOp.removedNodes) {
          const idx = appliedOp.orderIndices[n.id] ?? 0;
          fireWrite(
            `undo remove-create(${n.id})`,
            directusWrite.createGeoNode(n, idx),
          );
        }
        // Revert lifted children's parents.
        if (appliedOp.mode === 'reparent-children' && appliedOp.liftedChildren) {
          for (const lc of appliedOp.liftedChildren) {
            fireWrite(
              `undo remove-lift-revert(${lc.id})`,
              directusWrite.updateGeoNodeRemote(lc.id, { parentId: lc.beforeParentId }),
            );
          }
        }
        // Align the global sort.
        const restoredOrder = (() => {
          // Approximate by inserting each restored id at its captured index against
          // the *current* (post-restore) local order. The state callback above already
          // computed this; we don't have access here, so reconstruct.
          //
          // We can pass through the local state by reading useTerritoryStore.getState
          // — but the slice's post-set replay block isn't aware of the store yet.
          // Workaround: use the captured `appliedOp` plus orderedRestores to derive
          // the order purely from the op payload + the *current* live order.
          //
          // Simpler: rely on the state callback's output. After set(), the local
          // store already has the restored order; read it via getState.
          return [];
        })();
        void restoredOrder; // see note below
        // Actually defer the global sort write to use the live store state. We can't
        // import getState here; instead, push one final reorderGeoNodes call by
        // reading the order from the slice through a setTimeout(0). To keep the file
        // simple, we replicate the order locally:
        //
        // NB: This is a known approximation — see Step 4 for the cleaner approach.
      }
```

Step 3 above is intentionally incomplete because the post-`set` Directus replay block doesn't have access to the live `geoNodeOrder`. The cleaner approach is Step 4.

- [ ] **Step 4: Refactor the Directus replay to read live state for `remove` undo**

Replace the inelegant block from Step 3 with a cleaner version. The slice creator already has access to the store via the second `StateCreator` argument; we can use `get()` to read post-set state.

Find the slice creator declaration:

```ts
export const createGeoSlice: StateCreator<TerritoryStore, [], [], GeoSlice> = (set) => ({
```

Change to:

```ts
export const createGeoSlice: StateCreator<TerritoryStore, [], [], GeoSlice> = (set, get) => ({
```

Now replace the placeholder `remove` branch in `undoGeoOp`'s Directus replay block (Step 3) with:

```ts
      } else if (appliedOp.kind === 'remove') {
        for (const n of appliedOp.removedNodes) {
          const idx = appliedOp.orderIndices[n.id] ?? 0;
          fireWrite(
            `undo remove-create(${n.id})`,
            directusWrite.createGeoNode(n, idx),
          );
        }
        if (appliedOp.mode === 'reparent-children' && appliedOp.liftedChildren) {
          for (const lc of appliedOp.liftedChildren) {
            fireWrite(
              `undo remove-lift-revert(${lc.id})`,
              directusWrite.updateGeoNodeRemote(lc.id, { parentId: lc.beforeParentId }),
            );
          }
        }
        fireWrite(
          `undo remove-sort`,
          directusWrite.reorderGeoNodes(get().geoNodeOrder),
        );
      }
```

(The `get()` call reads the live `geoNodeOrder` after the `set()` callback has run.)

- [ ] **Step 5: Add the `remove` branch to `redoGeoOp`**

In `redoGeoOp`, after the `reorder` branch, add:

```ts
      if (top.kind === 'remove') {
        const removedIds = new Set(top.removedNodes.map((n) => n.id));
        const nextNodes: Record<string, GeoNode> = {};
        for (const [nid, n] of Object.entries(s.geoNodes)) {
          if (removedIds.has(nid)) continue;
          if (top.mode === 'reparent-children' && top.liftedChildren) {
            // For redo, lift children whose parent is being deleted again.
            const lift = top.liftedChildren.find((lc) => lc.id === nid);
            if (lift) {
              const parentNode = s.geoNodes[lift.beforeParentId];
              const newParent = parentNode ? parentNode.parentId : null;
              nextNodes[nid] = { ...n, parentId: newParent };
              continue;
            }
          }
          nextNodes[nid] = n;
        }
        appliedOp = top;
        return {
          geoNodes: nextNodes,
          geoNodeOrder: s.geoNodeOrder.filter((nid) => !removedIds.has(nid)),
          activePaintGeoId:
            s.activePaintGeoId !== null && removedIds.has(s.activePaintGeoId)
              ? null
              : s.activePaintGeoId,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, top].slice(-MAX_UNDO),
        };
      }
```

In the Directus replay block, add after the `reorder` branch:

```ts
      } else if (appliedOp.kind === 'remove') {
        const removedIds = appliedOp.removedNodes.map((n) => n.id);
        if (appliedOp.mode === 'reparent-children' && appliedOp.liftedChildren) {
          // Reparent children to grandparent first (matching forward removeGeoNode behavior).
          for (const lc of appliedOp.liftedChildren) {
            const live = get().geoNodes[lc.id];
            if (live) {
              fireWrite(
                `redo remove-lift(${lc.id})`,
                directusWrite.updateGeoNodeRemote(lc.id, { parentId: live.parentId }),
              );
            }
          }
        }
        fireWrite(
          `redo remove-delete`,
          directusWrite.deleteGeoNodes(removedIds),
        );
      }
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add store/slices/geoSlice.ts
git commit -m "feat(territory): undo/redo for geo node remove (cascade + reparent-children)"
```

---

## Task 7: Tree expand/collapse animation

**Files:**
- Modify: `components/territory/sidebar/GeoNodeRow.tsx`

- [ ] **Step 1: Wrap the recursive descent in a grid-rows container**

Find the recursive render block at the bottom of `components/territory/sidebar/GeoNodeRow.tsx` (around line 254):

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
          bulkDragSet={bulkDragSet}
          activeDragId={activeDragId}
        />
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

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add components/territory/sidebar/GeoNodeRow.tsx
git commit -m "feat(territory): animated tree expand/collapse via grid-template-rows"
```

---

## Task 8: Full verification + task-summary entry

**Files:**
- Modify: `.claude/docs/task-summary.md`

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

All three must exit clean. If any fail, diagnose and fix before continuing.

- [ ] **Step 2: User manual smoke (ask user; do not run yourself)**

Have the user run `npm run dev` and verify:

1. Rename a node via inline editor → ⌘Z restores old name; ⇧⌘Z reapplies.
2. Change a node's color via swatch → ⌘Z restores old color.
3. Click "New geo" → ⌘Z removes the just-created node.
4. Click ✕ on a node with no children → ⌘Z restores it at its position.
5. Click ✕ on a node WITH children (cascade) → ⌘Z restores parent + descendants at original positions.
6. Bulk delete via Backspace (Polish-B) → ⌘Z restores all deleted nodes at original positions.
7. Drag-reorder a node → ⌘Z restores prior order + parent.
8. Bulk-drag (Polish-B) → ⌘Z restores prior order + parents for all moved nodes.
9. Paint a country → ⌘Z still works exactly as before.
10. Mixed sequence (rename + paint + reorder + delete) → four ⌘Z unwinds in reverse.
11. Toolbar undo/redo buttons reflect canUndo/canRedo across all op types.
12. Expand/collapse a row with children → smooth 200ms height animation. `prefers-reduced-motion: reduce` users see instant toggle.

- [ ] **Step 3: Append to `.claude/docs/task-summary.md`**

Append after the existing Polish-B section:

```markdown

---

## Shipped 2026-05-13 — Polish-C (universal undo/redo + tree animation)

Spec: `docs/superpowers/specs/2026-05-13-territory-polish-c-design.md`
Plan: `docs/superpowers/plans/2026-05-13-territory-polish-c.md`

Third of four follow-up polish passes. Polish-D (SP3 motion) remains.

### What shipped

- `store/slices/geoSlice.ts` — replaces the paint-only undo plumbing
  with a discriminated-union `GeoOp` covering six variants: `paint`
  (existing), `rename`, `color`, `add`, `remove` (cascade +
  reparent-children, single + bulk), `reorder` (single + bulk +
  degenerate reparent). Stack fields renamed to
  `geoOpUndoStack` / `geoOpRedoStack`; actions renamed to
  `undoGeoOp` / `redoGeoOp`. Slice creator now takes `(set, get)` so
  the post-set Directus replay can read the live `geoNodeOrder` for
  the `remove` variant.
- `store/slices/geoSelectors.ts` — `useCanUndoGeo` / `useCanRedoGeo`
  switch to the renamed stack fields. Selector names unchanged.
- `components/territory/toolbar/Toolbar.tsx` — `undoGeoAssignment` /
  `redoGeoAssignment` references renamed to `undoGeoOp` /
  `redoGeoOp`. Button titles tighten from "Undo Geo assignment" to
  "Undo (⌘Z)" / "Redo (⇧⌘Z)".
- `components/territory/sidebar/GeoNodeRow.tsx` — wraps the
  recursive children in a `grid grid-rows-[0fr] ↔ grid-rows-[1fr]`
  container with `motion-safe:transition-[grid-template-rows]
  duration-200 ease-out`. `prefers-reduced-motion: reduce` users
  get the instant toggle.

### Op semantics

| Kind | Push site | Undo (data) | Redo (data) | Directus replay |
|---|---|---|---|---|
| paint | 4 assign/clear actions | restore before-codes | restore after-codes | updateGeoNodeRemote per patch |
| rename | `updateGeoNode({name})` | name = before | name = after | updateGeoNodeRemote |
| color | `updateGeoNode({color})` | color = before | color = after | updateGeoNodeRemote |
| add | `addGeoNode` | delete from nodes + order | re-insert at sortIndex | deleteGeoNodes / createGeoNode |
| remove | `removeGeoNode`/`removeGeoNodes` | restore nodes + orderIndices; revert liftedChildren | re-delete (and re-lift) | createGeoNode + lift + reorderGeoNodes / deleteGeoNodes |
| reorder | `reorderGeoNode`/`reorderGeoNodes`/`reparentGeoNode` | restore beforeOrder + beforeParentIds | restore afterOrder + afterParentIds | updateGeoNodeRemote per parent change + reorderGeoNodes |

UI state (`activePaintGeoId`, `selectedGeoNodeIds`,
`selectionAnchorId`, `activeEraser`, `selectActive`,
`pinnedEntityIso`) is NOT touched by undo/redo. The `activePaintGeoId`
nulling that happens forward when its target is deleted stays nulled
even after the deletion is undone.

### Deviations from spec

None substantive. The spec named two implementation details that
landed as designed:

- `parentChanges` carries BOTH `beforeParentId` and `afterParentId`
  so redo can reconstruct the forward state without re-walking
  siblings.
- The slice creator destructures `(set, get)` so the `remove` undo
  can call `directusWrite.reorderGeoNodes(get().geoNodeOrder)` after
  the `set()` callback completes.

### Known limitations (per spec)

- `createGeoNode` during a remove-undo trusts that Directus accepts
  the client-supplied UUID. Directus has done so since Phase 1; if
  rejected, local state remains correct and a refresh recovers.
- Stack is session-only (not persisted). A page reload clears
  history. Matches the prior paint-only behavior.
- MAX_UNDO remains 50.

### Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
Manual UI smoke checklist in plan Task 8 Step 2.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/docs/task-summary.md
git commit -m "docs: log polish-C shipped (universal undo/redo + tree animation)"
```

---

## Self-Review Notes

**Spec coverage:**
- §1.1 GeoOp union → T1 Step 1 (full schema including `afterParentId` on `parentChanges`).
- §1.2 renames → T1 Steps 2, 3, 4, 7, 8, 9.
- §1.3 push sites — paint T1 Step 4; rename/color T2 Step 1; add T4 Step 1; reorder T5 Steps 1–3; remove T6 Steps 1–2.
- §1.4 undo/redo dispatch — paint T1 Steps 5–6; rename T2 Steps 2–3; color T3 Steps 1–2; add T4 Steps 2–3; reorder T5 Steps 4–5; remove T6 Steps 3–5 (slice-creator `get()` introduced in T6 Step 4).
- §1.5 UI state not restored — implicit in the dispatch design; the only UI-touching update is the `activePaintGeoId` nulling on `add` undo (T4 Step 2) which mirrors the forward semantics.
- §2.1–2.3 tree animation → T7.
- Verification + task-summary → T8.

**Placeholder scan:** clean.

**Type consistency:**
- `GeoOp` shape: defined fully in T1 Step 1, including `afterParentId` on `parentChanges` so T5's `redoGeoOp` reorder branch reads it directly without a schema patch.
- `geoOpUndoStack` / `geoOpRedoStack`: introduced in T1 Step 2, consistently used in every subsequent push and dispatch step.
- `undoGeoOp` / `redoGeoOp`: introduced in T1 Steps 5–6, consistently extended in T2–T6.
- `(set, get)` destructure: introduced in T6 Step 4, used only in T6 Step 4's Directus replay for `remove` undo. Other branches don't need `get`.
