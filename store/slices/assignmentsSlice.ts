import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Assignment, AssignmentEntityType } from '@/types/territory';

export interface AssignmentsSlice {
  assignments: Record<string, Assignment>;

  setAssignment: (
    entityCode: string,
    entityType: AssignmentEntityType,
    entityName: string,
    teamId: string,
  ) => void;
  clearAssignment: (entityCode: string) => void;
  bulkAssign: (
    items: Array<{ code: string; name: string }>,
    entityType: AssignmentEntityType,
    teamId: string,
  ) => void;
}

export const assignmentsPersistKeys = ['assignments'] as const satisfies readonly (keyof AssignmentsSlice)[];

export const createAssignmentsSlice: StateCreator<TerritoryStore, [], [], AssignmentsSlice> = (set) => ({
  assignments: {},

  setAssignment(entityCode, entityType, entityName, teamId) {
    const id = `assignment-${crypto.randomUUID()}`;
    set((s) => ({
      assignments: {
        ...s.assignments,
        [entityCode]: { id, entityType, entityCode, entityName, teamId, assignedAt: Date.now() },
      },
    }));
  },

  clearAssignment(entityCode) {
    set((s) => {
      const assignments = { ...s.assignments };
      delete assignments[entityCode];
      return { assignments };
    });
  },

  bulkAssign(items, entityType, teamId) {
    set((s) => {
      const newAssignments = { ...s.assignments };
      items.forEach(({ code, name }) => {
        newAssignments[code] = {
          id: `assignment-${crypto.randomUUID()}`,
          entityType,
          entityCode: code,
          entityName: name,
          teamId,
          assignedAt: Date.now(),
        };
      });
      return { assignments: newAssignments };
    });
  },
});
