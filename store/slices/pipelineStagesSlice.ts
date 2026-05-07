import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { PipelineStage } from '@/types/territory';
import type { Account } from '@/types/account';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[pipelineStagesSlice] ${label} failed`, err));
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'stage';
}

function uniqueSlug(base: string, has: (s: string) => boolean): string {
  if (!has(base)) return base;
  let i = 2;
  while (has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export interface PipelineStagesSlice {
  pipelineStages: Record<string, PipelineStage>;
  pipelineStageOrder: string[];

  addStage: (label: string, color?: string) => string;
  updateStage: (
    id: string,
    patch: Partial<Pick<PipelineStage, 'label' | 'color' | 'isWon' | 'isLost'>>,
  ) => void;
  reorderStages: (orderedIds: string[]) => void;
  removeStage: (id: string, fallbackId?: string | null) => void;
  hydrateStages: (stages: PipelineStage[], order: string[]) => void;
}

export const pipelineStagesPersistKeys = ['pipelineStages', 'pipelineStageOrder'] as const satisfies readonly (keyof PipelineStagesSlice)[];

export const createPipelineStagesSlice: StateCreator<TerritoryStore, [], [], PipelineStagesSlice> = (set) => ({
  pipelineStages: {},
  pipelineStageOrder: [],

  addStage(label, color) {
    let id = '';
    let slug = '';
    let sort = 0;
    const stageColor = color ?? '#e5e7eb';
    set((s) => {
      sort = s.pipelineStageOrder.length;
      id = crypto.randomUUID();
      const existingSlugs = new Set(Object.values(s.pipelineStages).map((st) => st.slug));
      slug = uniqueSlug(slugify(label), (x) => existingSlugs.has(x));
      const def: PipelineStage = {
        id,
        slug,
        label: label.trim() || slug,
        color: stageColor,
        sort,
        isWon: false,
        isLost: false,
      };
      return {
        pipelineStages: { ...s.pipelineStages, [id]: def },
        pipelineStageOrder: [...s.pipelineStageOrder, id],
      };
    });
    fireWrite(`createStage(${id})`, directusWrite.createStage({
      id,
      slug,
      label: label.trim() || slug,
      color: stageColor,
      sort,
      isWon: false,
      isLost: false,
    }));
    return id;
  },

  updateStage(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.pipelineStages[id]) return s;
      didApply = true;
      return { pipelineStages: { ...s.pipelineStages, [id]: { ...s.pipelineStages[id], ...patch } } };
    });
    if (didApply) fireWrite(`updateStage(${id})`, directusWrite.updateStageRemote(id, patch));
  },

  reorderStages(orderedIds) {
    set((s) => {
      const known = new Set(Object.keys(s.pipelineStages));
      const filtered = orderedIds.filter((id) => known.has(id));
      const trailing = s.pipelineStageOrder.filter((id) => known.has(id) && !filtered.includes(id));
      const next = [...filtered, ...trailing];
      const map = { ...s.pipelineStages };
      next.forEach((id, idx) => { map[id] = { ...map[id], sort: idx }; });
      return { pipelineStages: map, pipelineStageOrder: next };
    });
    fireWrite('reorderStages', directusWrite.reorderStages(orderedIds));
  },

  removeStage(id, fallbackId = null) {
    let didApply = false;
    const reassignedAccountIds: string[] = [];
    let appliedFallback: string | null = null;
    set((s) => {
      if (!s.pipelineStages[id]) return s;
      didApply = true;
      const fallback = fallbackId && s.pipelineStages[fallbackId] ? fallbackId : null;
      appliedFallback = fallback;
      const nextStages = { ...s.pipelineStages };
      delete nextStages[id];
      const nextOrder = s.pipelineStageOrder.filter((sid) => sid !== id);
      // Migrate accounts assigned to this stage → fallback (or null).
      const nextAccounts: Record<string, Account> = { ...s.accounts };
      for (const aid of Object.keys(nextAccounts)) {
        if (nextAccounts[aid].stageId === id) {
          nextAccounts[aid] = { ...nextAccounts[aid], stageId: fallback };
          reassignedAccountIds.push(aid);
        }
      }
      return {
        pipelineStages: nextStages,
        pipelineStageOrder: nextOrder,
        accounts: nextAccounts,
      };
    });
    if (!didApply) return;
    for (const aid of reassignedAccountIds) {
      fireWrite(
        `migrateAccount(${aid}).stageId→${appliedFallback ?? 'null'}`,
        directusWrite.updateAccount(aid, { stageId: appliedFallback }),
      );
    }
    fireWrite(`deleteStage(${id})`, directusWrite.deleteStage(id));
  },

  hydrateStages(stages, order) {
    set(() => {
      const map: Record<string, PipelineStage> = {};
      stages.forEach((s) => { map[s.id] = s; });
      return { pipelineStages: map, pipelineStageOrder: order };
    });
  },
});
