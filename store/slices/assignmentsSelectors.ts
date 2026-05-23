import { useTerritoryStore } from '../territoryStore';

export const useAssignments = () => useTerritoryStore((s) => s.assignments);

export const useEntityAssignment = (entityCode: string) =>
  useTerritoryStore((s) => s.assignments[entityCode]);
