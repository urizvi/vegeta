import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { HierarchyLevelDef, Member } from '@/types/territory';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[hierarchyLevelsSlice] ${label} failed`, err));
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'level';
}

function uniqueSlug(base: string, has: (s: string) => boolean): string {
  if (!has(base)) return base;
  let i = 2;
  while (has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export interface HierarchyLevelsSlice {
  hierarchyLevels: Record<string, HierarchyLevelDef>;
  hierarchyLevelOrder: string[];

  addLevel: (label: string, color?: string) => string;
  updateLevel: (id: string, patch: Partial<Pick<HierarchyLevelDef, 'label' | 'color'>>) => void;
  reorderLevels: (orderedIds: string[]) => void;
  removeLevel: (id: string, fallbackId?: string | null) => void;
  hydrateLevels: (levels: HierarchyLevelDef[], order: string[]) => void;
}

export const hierarchyLevelsPersistKeys = ['hierarchyLevels', 'hierarchyLevelOrder'] as const satisfies readonly (keyof HierarchyLevelsSlice)[];

export const createHierarchyLevelsSlice: StateCreator<TerritoryStore, [], [], HierarchyLevelsSlice> = (set) => ({
  hierarchyLevels: {},
  hierarchyLevelOrder: [],

  addLevel(label, color) {
    let id = '';
    let slug = '';
    let sort = 0;
    const levelColor = color ?? '#e5e7eb';
    set((s) => {
      sort = s.hierarchyLevelOrder.length;
      id = crypto.randomUUID();
      const existingSlugs = new Set(Object.values(s.hierarchyLevels).map((l) => l.slug));
      slug = uniqueSlug(slugify(label), (x) => existingSlugs.has(x));
      const def: HierarchyLevelDef = { id, slug, label: label.trim() || slug, color: levelColor, sort };
      return {
        hierarchyLevels: { ...s.hierarchyLevels, [id]: def },
        hierarchyLevelOrder: [...s.hierarchyLevelOrder, id],
      };
    });
    fireWrite(
      `createLevel(${id})`,
      directusWrite.createLevel({ id, slug, label: label.trim() || slug, color: levelColor, sort }),
    );
    return id;
  },

  updateLevel(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.hierarchyLevels[id]) return s;
      didApply = true;
      return { hierarchyLevels: { ...s.hierarchyLevels, [id]: { ...s.hierarchyLevels[id], ...patch } } };
    });
    if (didApply) fireWrite(`updateLevel(${id})`, directusWrite.updateLevelRemote(id, patch));
  },

  reorderLevels(orderedIds) {
    set((s) => {
      // Defensive: keep only ids that still exist; preserve any extras at the tail.
      const known = new Set(Object.keys(s.hierarchyLevels));
      const filtered = orderedIds.filter((id) => known.has(id));
      const trailing = s.hierarchyLevelOrder.filter((id) => known.has(id) && !filtered.includes(id));
      const next = [...filtered, ...trailing];
      const map = { ...s.hierarchyLevels };
      next.forEach((id, idx) => { map[id] = { ...map[id], sort: idx }; });
      return { hierarchyLevels: map, hierarchyLevelOrder: next };
    });
    fireWrite('reorderLevels', directusWrite.reorderLevels(orderedIds));
  },

  removeLevel(id, fallbackId = null) {
    let didApply = false;
    const reassignedMemberIds: string[] = [];
    let appliedFallback: string | null = null;
    set((s) => {
      if (!s.hierarchyLevels[id]) return s;
      didApply = true;
      const fallback = fallbackId && s.hierarchyLevels[fallbackId] ? fallbackId : null;
      appliedFallback = fallback;
      const nextLevels = { ...s.hierarchyLevels };
      delete nextLevels[id];
      const nextOrder = s.hierarchyLevelOrder.filter((lid) => lid !== id);
      // Migrate members assigned to this level → fallback (or empty string if none).
      const nextMembers: Record<string, Member> = { ...s.members };
      for (const mid of Object.keys(nextMembers)) {
        if (nextMembers[mid].level === id) {
          nextMembers[mid] = { ...nextMembers[mid], level: fallback ?? '' };
          reassignedMemberIds.push(mid);
        }
      }
      return {
        hierarchyLevels: nextLevels,
        hierarchyLevelOrder: nextOrder,
        members: nextMembers,
      };
    });
    if (!didApply) return;
    for (const mid of reassignedMemberIds) {
      fireWrite(
        `migrateMember(${mid}).level→${appliedFallback ?? ''}`,
        directusWrite.updateMemberRemote(mid, { level: appliedFallback ?? '' }),
      );
    }
    fireWrite(`deleteLevel(${id})`, directusWrite.deleteLevel(id));
  },

  hydrateLevels(levels, order) {
    set(() => {
      const map: Record<string, HierarchyLevelDef> = {};
      levels.forEach((l) => { map[l.id] = l; });
      return { hierarchyLevels: map, hierarchyLevelOrder: order };
    });
  },
});
