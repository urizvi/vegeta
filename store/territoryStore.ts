'use client';

import { create } from 'zustand';
import { createMapUiSlice, mapUiPersistKeys } from './slices/mapUiSlice';
import { createTeamsSlice, teamsPersistKeys } from './slices/teamsSlice';
import { createMembersSlice, membersPersistKeys } from './slices/membersSlice';
import { createRegionsSlice, regionsPersistKeys } from './slices/regionsSlice';
import { createSubregionsSlice, subregionsPersistKeys } from './slices/subregionsSlice';
import { createAssignmentsSlice, assignmentsPersistKeys } from './slices/assignmentsSlice';
import { createGeoSlice, geoPersistKeys } from './slices/geoSlice';
import { createAccountsSlice, accountsPersistKeys } from './slices/accountsSlice';
import { createHierarchyLevelsSlice, hierarchyLevelsPersistKeys } from './slices/hierarchyLevelsSlice';
import { createPipelineStagesSlice, pipelineStagesPersistKeys } from './slices/pipelineStagesSlice';
import { createContactsSlice, contactsPersistKeys } from './slices/contactsSlice';
import { createActivitiesSlice, activitiesPersistKeys } from './slices/activitiesSlice';
import { createTasksSlice, tasksPersistKeys } from './slices/tasksSlice';
import type { TerritoryStore } from './types';

export type { TerritoryStore } from './types';

const PERSIST_KEYS = [
  ...mapUiPersistKeys,
  ...teamsPersistKeys,
  ...membersPersistKeys,
  ...regionsPersistKeys,
  ...subregionsPersistKeys,
  ...assignmentsPersistKeys,
  ...geoPersistKeys,
  ...accountsPersistKeys,
  ...hierarchyLevelsPersistKeys,
  ...pipelineStagesPersistKeys,
  ...contactsPersistKeys,
  ...activitiesPersistKeys,
  ...tasksPersistKeys,
] as const;

type PersistKey = typeof PERSIST_KEYS[number];
type PersistedShape = Pick<TerritoryStore, PersistKey>;

export const useTerritoryStore = create<TerritoryStore>()((...a) => {
  const [set, get] = a;
  return {
    ...createMapUiSlice(...a),
    ...createTeamsSlice(...a),
    ...createMembersSlice(...a),
    ...createRegionsSlice(...a),
    ...createSubregionsSlice(...a),
    ...createAssignmentsSlice(...a),
    ...createGeoSlice(...a),
    ...createAccountsSlice(...a),
    ...createHierarchyLevelsSlice(...a),
    ...createPipelineStagesSlice(...a),
    ...createContactsSlice(...a),
    ...createActivitiesSlice(...a),
    ...createTasksSlice(...a),

    exportState() {
      const state = get();
      const out = {} as PersistedShape;
      for (const k of PERSIST_KEYS) {
        (out as Record<string, unknown>)[k] = state[k];
      }
      return JSON.stringify(out);
    },

    importState(json) {
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        console.error('Failed to import state');
        return;
      }
      if (!data || typeof data !== 'object') return;
      const incoming = data as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of PERSIST_KEYS) {
        if (k in incoming) patch[k] = incoming[k];
      }
      set(patch as Partial<TerritoryStore>);
    },
  };
});
