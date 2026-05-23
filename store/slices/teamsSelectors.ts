import { useTerritoryStore } from '../territoryStore';

export const useTeams = () => useTerritoryStore((s) => s.teams);
export const useTeamOrder = () => useTerritoryStore((s) => s.teamOrder);
export const useTeam = (id: string) => useTerritoryStore((s) => s.teams[id]);
