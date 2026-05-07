import { useTerritoryStore } from '../territoryStore';

export const useMembers = () => useTerritoryStore((s) => s.members);
