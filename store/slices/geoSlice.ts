import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { GeoNode } from '@/types/territory';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[geoSlice] ${label} failed`, err));
}

interface NodeCodesPatch {
  id: string;
  before: { countryCodes: string[]; stateCodes: string[] };
  after:  { countryCodes: string[]; stateCodes: string[] };
}

const MAX_UNDO = 50;

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

function diffNodesByCodes(
  prev: Record<string, GeoNode>,
  next: Record<string, GeoNode>,
): NodeCodesPatch[] {
  const out: NodeCodesPatch[] = [];
  for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[id];
    const b = next[id];
    if (!b) continue; // deletions handled separately
    if (
      !a ||
      a.countryCodes !== b.countryCodes ||
      a.stateCodes !== b.stateCodes
    ) {
      out.push({
        id,
        before: a
          ? { countryCodes: a.countryCodes, stateCodes: a.stateCodes }
          : { countryCodes: [], stateCodes: [] },
        after: { countryCodes: b.countryCodes, stateCodes: b.stateCodes },
      });
    }
  }
  return out;
}

export interface GeoSlice {
  geoNodes: Record<string, GeoNode>;
  geoNodeOrder: string[];
  activePaintGeoId: string | null;
  activeEraser: boolean;
  selectActive: boolean;
  geoOpUndoStack: GeoOp[];
  geoOpRedoStack: GeoOp[];

  addGeoNode: (name: string, parentId: string | null, color?: string | null) => string;
  updateGeoNode: (id: string, patch: Partial<Pick<GeoNode, 'name' | 'color'>>) => void;
  reparentGeoNode: (id: string, newParentId: string | null) => void;
  reorderGeoNode(
    id: string,
    newParentId: string | null,
    beforeId: string | null,
  ): void;
  reorderGeoNodes(
    ids: string[],
    newParentId: string | null,
    beforeId: string | null,
  ): void;
  /**
   * `cascade` removes the node and all descendants.
   * `reparent-children` removes the node but moves its direct children up to its parent.
   */
  removeGeoNode: (id: string, mode?: 'cascade' | 'reparent-children') => void;
  removeGeoNodes: (ids: string[], mode?: 'cascade' | 'reparent-children') => void;

  assignCountryToGeo: (geoNodeId: string, countryCode: string) => void;
  assignStateToGeo: (geoNodeId: string, stateCode: string) => void;
  clearCountryAssignment: (countryCode: string) => void;
  clearStateAssignment: (stateCode: string) => void;

  setActivePaintGeo: (id: string | null) => void;
  setActiveEraser: (active: boolean) => void;
  setActiveSelect: (active: boolean) => void;

  undoGeoOp: () => void;
  redoGeoOp: () => void;

  hydrateGeoNodes: (nodes: GeoNode[], order: string[]) => void;
}

export const geoPersistKeys = ['geoNodes', 'geoNodeOrder'] as const satisfies readonly (keyof GeoSlice)[];

function isAncestor(
  nodes: Record<string, GeoNode>,
  candidateAncestorId: string,
  descendantId: string,
): boolean {
  let cur: string | null = descendantId;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return false; // defensive against existing cycles
    seen.add(cur);
    if (cur === candidateAncestorId) return true;
    cur = nodes[cur]?.parentId ?? null;
  }
  return false;
}

function descendantsOf(nodes: Record<string, GeoNode>, rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of Object.values(nodes)) {
        if (n.parentId === id && !out.has(n.id)) {
          out.add(n.id);
          next.push(n.id);
        }
      }
    }
    frontier = next;
  }
  return out;
}

function withCountryRemoved(
  nodes: Record<string, GeoNode>,
  countryCode: string,
): Record<string, GeoNode> {
  const next: Record<string, GeoNode> = {};
  for (const [id, n] of Object.entries(nodes)) {
    next[id] = n.countryCodes.includes(countryCode)
      ? { ...n, countryCodes: n.countryCodes.filter((c) => c !== countryCode) }
      : n;
  }
  return next;
}

function withStateRemoved(
  nodes: Record<string, GeoNode>,
  stateCode: string,
): Record<string, GeoNode> {
  const next: Record<string, GeoNode> = {};
  for (const [id, n] of Object.entries(nodes)) {
    next[id] = n.stateCodes.includes(stateCode)
      ? { ...n, stateCodes: n.stateCodes.filter((c) => c !== stateCode) }
      : n;
  }
  return next;
}

export const createGeoSlice: StateCreator<TerritoryStore, [], [], GeoSlice> = (set) => ({
  geoNodes: {},
  geoNodeOrder: [],
  activePaintGeoId: null,
  activeEraser: false,
  selectActive: false,
  geoOpUndoStack: [],
  geoOpRedoStack: [],

  addGeoNode(name, parentId, color) {
    const id = crypto.randomUUID();
    let sortIndex = 0;
    set((s) => {
      sortIndex = s.geoNodeOrder.length;
      return {
        geoNodes: {
          ...s.geoNodes,
          [id]: {
            id,
            name,
            color: color ?? null,
            parentId,
            countryCodes: [],
            stateCodes: [],
          },
        },
        geoNodeOrder: [...s.geoNodeOrder, id],
      };
    });
    fireWrite(
      `createGeoNode(${id})`,
      directusWrite.createGeoNode(
        { id, name, color: color ?? null, parentId, countryCodes: [], stateCodes: [] },
        sortIndex,
      ),
    );
    return id;
  },

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

  reparentGeoNode(id, newParentId) {
    let didApply = false;
    set((s) => {
      if (!s.geoNodes[id]) return s;
      if (newParentId !== null) {
        if (newParentId === id) return s;
        if (!s.geoNodes[newParentId]) return s;
        if (isAncestor(s.geoNodes, id, newParentId)) return s;
      }
      didApply = true;
      return {
        geoNodes: { ...s.geoNodes, [id]: { ...s.geoNodes[id], parentId: newParentId } },
      };
    });
    if (didApply) {
      fireWrite(
        `reparentGeoNode(${id})`,
        directusWrite.updateGeoNodeRemote(id, { parentId: newParentId }),
      );
    }
  },

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
      const geoNodes: Record<string, GeoNode> = { ...s.geoNodes };
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

  removeGeoNode(id, mode = 'cascade') {
    let dropIds: string[] = [];
    const reparentPatches: Array<{ id: string; parentId: string | null }> = [];
    set((s) => {
      if (!s.geoNodes[id]) return s;
      if (mode === 'cascade') {
        const toDrop = descendantsOf(s.geoNodes, id);
        dropIds = Array.from(toDrop);
        const geoNodes = { ...s.geoNodes };
        toDrop.forEach((nid) => { delete geoNodes[nid]; });
        return {
          geoNodes,
          geoNodeOrder: s.geoNodeOrder.filter((nid) => !toDrop.has(nid)),
          activePaintGeoId: toDrop.has(s.activePaintGeoId ?? '') ? null : s.activePaintGeoId,
        };
      }
      const newParent = s.geoNodes[id].parentId;
      const geoNodes: Record<string, GeoNode> = {};
      for (const [nid, n] of Object.entries(s.geoNodes)) {
        if (nid === id) continue;
        if (n.parentId === id) {
          geoNodes[nid] = { ...n, parentId: newParent };
          reparentPatches.push({ id: nid, parentId: newParent });
        } else {
          geoNodes[nid] = n;
        }
      }
      dropIds = [id];
      return {
        geoNodes,
        geoNodeOrder: s.geoNodeOrder.filter((nid) => nid !== id),
        activePaintGeoId: s.activePaintGeoId === id ? null : s.activePaintGeoId,
      };
    });
    // Reparent-children must run before the delete so children aren't orphaned at SET NULL.
    for (const p of reparentPatches) {
      fireWrite(
        `reparentGeoNode(${p.id})`,
        directusWrite.updateGeoNodeRemote(p.id, { parentId: p.parentId }),
      );
    }
    if (dropIds.length > 0) fireWrite('deleteGeoNodes', directusWrite.deleteGeoNodes(dropIds));
  },

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
      const geoNodes: Record<string, GeoNode> = {};
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

  assignCountryToGeo(geoNodeId, countryCode) {
    let changed: NodeCodesPatch[] = [];
    set((s) => {
      if (!s.geoNodes[geoNodeId]) return s;
      const stripped = withCountryRemoved(s.geoNodes, countryCode);
      const target = stripped[geoNodeId];
      const next = {
        ...stripped,
        [geoNodeId]: { ...target, countryCodes: [...target.countryCodes, countryCode] },
      };
      changed = diffNodesByCodes(s.geoNodes, next);
      const op: GeoOp = { kind: 'paint', patches: changed };
      const undo = [...s.geoOpUndoStack, op].slice(-MAX_UNDO);
      return { geoNodes: next, geoOpUndoStack: undo, geoOpRedoStack: [] };
    });
    for (const c of changed) {
      fireWrite(
        `updateGeoNode(${c.id}).countryCodes`,
        directusWrite.updateGeoNodeRemote(c.id, c.after),
      );
    }
  },

  assignStateToGeo(geoNodeId, stateCode) {
    let changed: NodeCodesPatch[] = [];
    set((s) => {
      if (!s.geoNodes[geoNodeId]) return s;
      const stripped = withStateRemoved(s.geoNodes, stateCode);
      const target = stripped[geoNodeId];
      const next = {
        ...stripped,
        [geoNodeId]: { ...target, stateCodes: [...target.stateCodes, stateCode] },
      };
      changed = diffNodesByCodes(s.geoNodes, next);
      const op: GeoOp = { kind: 'paint', patches: changed };
      const undo = [...s.geoOpUndoStack, op].slice(-MAX_UNDO);
      return { geoNodes: next, geoOpUndoStack: undo, geoOpRedoStack: [] };
    });
    for (const c of changed) {
      fireWrite(
        `updateGeoNode(${c.id}).stateCodes`,
        directusWrite.updateGeoNodeRemote(c.id, c.after),
      );
    }
  },

  clearCountryAssignment(countryCode) {
    let changed: NodeCodesPatch[] = [];
    set((s) => {
      const next = withCountryRemoved(s.geoNodes, countryCode);
      changed = diffNodesByCodes(s.geoNodes, next);
      if (changed.length === 0) return s;
      const op: GeoOp = { kind: 'paint', patches: changed };
      const undo = [...s.geoOpUndoStack, op].slice(-MAX_UNDO);
      return { geoNodes: next, geoOpUndoStack: undo, geoOpRedoStack: [] };
    });
    for (const c of changed) {
      fireWrite(
        `updateGeoNode(${c.id}).countryCodes`,
        directusWrite.updateGeoNodeRemote(c.id, { countryCodes: c.after.countryCodes }),
      );
    }
  },

  clearStateAssignment(stateCode) {
    let changed: NodeCodesPatch[] = [];
    set((s) => {
      const next = withStateRemoved(s.geoNodes, stateCode);
      changed = diffNodesByCodes(s.geoNodes, next);
      if (changed.length === 0) return s;
      const op: GeoOp = { kind: 'paint', patches: changed };
      const undo = [...s.geoOpUndoStack, op].slice(-MAX_UNDO);
      return { geoNodes: next, geoOpUndoStack: undo, geoOpRedoStack: [] };
    });
    for (const c of changed) {
      fireWrite(
        `updateGeoNode(${c.id}).stateCodes`,
        directusWrite.updateGeoNodeRemote(c.id, { stateCodes: c.after.stateCodes }),
      );
    }
  },

  setActivePaintGeo(id) {
    if (id) set({ activePaintGeoId: id, activeEraser: false, selectActive: false });
    else set({ activePaintGeoId: null });
  },

  setActiveEraser(active) {
    if (active) set({ activeEraser: true, activePaintGeoId: null, selectActive: false });
    else set({ activeEraser: false });
  },

  setActiveSelect(active) {
    if (active) set({ selectActive: true, activePaintGeoId: null, activeEraser: false });
    else set({ selectActive: false });
  },

  undoGeoOp() {
    const result: { op: GeoOp | null } = { op: null };
    set((s) => {
      const stack = s.geoOpUndoStack;
      if (stack.length === 0) return s;
      const top = stack[stack.length - 1];
      const nextUndo = stack.slice(0, -1);

      if (top.kind === 'paint') {
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
        const op: GeoOp = { kind: 'paint', patches: live };
        result.op = op;
        return {
          geoNodes: nextNodes,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, op].slice(-MAX_UNDO),
        };
      }

      if (top.kind === 'rename') {
        if (!s.geoNodes[top.id]) {
          return { geoOpUndoStack: nextUndo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], name: top.before },
        };
        result.op = top;
        return {
          geoNodes: nextNodes,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, top].slice(-MAX_UNDO),
        };
      }

      if (top.kind === 'color') {
        if (!s.geoNodes[top.id]) {
          return { geoOpUndoStack: nextUndo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], color: top.before },
        };
        result.op = top;
        return {
          geoNodes: nextNodes,
          geoOpUndoStack: nextUndo,
          geoOpRedoStack: [...s.geoOpRedoStack, top].slice(-MAX_UNDO),
        };
      }

      // Other kinds not yet handled (added in T2-T6). Drop the entry from
      // the undo stack to avoid wedging the system; do NOT push to redo.
      return { geoOpUndoStack: nextUndo };
    });
    const op = result.op;
    if (op) {
      if (op.kind === 'paint') {
        for (const c of op.patches) {
          fireWrite(
            `undo updateGeoNode(${c.id})`,
            directusWrite.updateGeoNodeRemote(c.id, c.before),
          );
        }
      } else if (op.kind === 'rename') {
        fireWrite(
          `undo rename(${op.id})`,
          directusWrite.updateGeoNodeRemote(op.id, { name: op.before }),
        );
      } else if (op.kind === 'color') {
        fireWrite(
          `undo color(${op.id})`,
          directusWrite.updateGeoNodeRemote(op.id, { color: op.before }),
        );
      }
    }
  },

  redoGeoOp() {
    const result: { op: GeoOp | null } = { op: null };
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
        const op: GeoOp = { kind: 'paint', patches: live };
        result.op = op;
        return {
          geoNodes: nextNodes,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, op].slice(-MAX_UNDO),
        };
      }

      if (top.kind === 'rename') {
        if (!s.geoNodes[top.id]) {
          return { geoOpRedoStack: nextRedo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], name: top.after },
        };
        result.op = top;
        return {
          geoNodes: nextNodes,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, top].slice(-MAX_UNDO),
        };
      }

      if (top.kind === 'color') {
        if (!s.geoNodes[top.id]) {
          return { geoOpRedoStack: nextRedo };
        }
        const nextNodes = {
          ...s.geoNodes,
          [top.id]: { ...s.geoNodes[top.id], color: top.after },
        };
        result.op = top;
        return {
          geoNodes: nextNodes,
          geoOpRedoStack: nextRedo,
          geoOpUndoStack: [...s.geoOpUndoStack, top].slice(-MAX_UNDO),
        };
      }

      return { geoOpRedoStack: nextRedo };
    });
    const op = result.op;
    if (op) {
      if (op.kind === 'paint') {
        for (const c of op.patches) {
          fireWrite(
            `redo updateGeoNode(${c.id})`,
            directusWrite.updateGeoNodeRemote(c.id, c.after),
          );
        }
      } else if (op.kind === 'rename') {
        fireWrite(
          `redo rename(${op.id})`,
          directusWrite.updateGeoNodeRemote(op.id, { name: op.after }),
        );
      } else if (op.kind === 'color') {
        fireWrite(
          `redo color(${op.id})`,
          directusWrite.updateGeoNodeRemote(op.id, { color: op.after }),
        );
      }
    }
  },

  hydrateGeoNodes(nodes, order) {
    const map: Record<string, GeoNode> = {};
    nodes.forEach((n) => { map[n.id] = n; });
    set({ geoNodes: map, geoNodeOrder: order, geoOpUndoStack: [], geoOpRedoStack: [] });
  },
});
