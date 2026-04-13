'use client';

import { create } from 'zustand';
import type {
  SalesTeam,
  Member,
  Region,
  Assignment,
  AssignmentEntityType,
  CanonicalRegion,
  TerritoryStoreState,
} from '@/types/territory';
import { getTeamColor } from '@/lib/colorUtils';
import { BUILT_IN_REGIONS } from '@/lib/regionData';

interface TerritoryStoreActions {
  // Teams
  addTeam: (name: string, color?: string) => void;
  updateTeam: (id: string, patch: Partial<Pick<SalesTeam, 'name' | 'color'>>) => void;
  removeTeam: (id: string) => void;

  // Members
  addMember: (teamId: string, member: Omit<Member, 'id'>) => void;
  updateMember: (id: string, patch: Partial<Omit<Member, 'id'>>) => void;
  removeMember: (teamId: string, memberId: string) => void;

  // Regions
  addRegion: (name: string, canonicalKey: CanonicalRegion, countryCodes: string[]) => void;
  removeRegion: (id: string) => void;
  assignRegionToTeam: (regionId: string, teamId: string) => void;

  // Assignments
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

  // UI
  setActiveView: (view: 'map' | 'spreadsheet') => void;
  setDrillDownCountryCode: (code: string | null) => void;
  setSelectedEntityCode: (code: string | null) => void;
  setHoveredEntityCode: (code: string | null) => void;

  // Serialisation
  exportState: () => string;
  importState: (json: string) => void;
}

type TerritoryStore = TerritoryStoreState & TerritoryStoreActions;

// Seed regions from built-in region data
function buildSeedRegions(): {
  regions: Record<string, Region>;
  regionOrder: string[];
} {
  const regions: Record<string, Region> = {};
  const regionOrder: string[] = [];
  BUILT_IN_REGIONS.forEach((r) => {
    const id = r.key.toLowerCase();
    regions[id] = { id, name: r.name, canonicalKey: r.key, countryCodes: r.countryCodes };
    regionOrder.push(id);
  });
  return { regions, regionOrder };
}

const { regions: seedRegions, regionOrder: seedRegionOrder } = buildSeedRegions();

// Seed teams
const SEED_TEAMS: SalesTeam[] = [
  { id: 'team-1', name: 'North America', color: getTeamColor(0), memberIds: [] },
  { id: 'team-2', name: 'Europe', color: getTeamColor(1), memberIds: [] },
  { id: 'team-3', name: 'Asia Pacific', color: getTeamColor(2), memberIds: [] },
];

const initialTeams: Record<string, SalesTeam> = {};
const initialTeamOrder: string[] = [];
SEED_TEAMS.forEach((t) => {
  initialTeams[t.id] = t;
  initialTeamOrder.push(t.id);
});

export const useTerritoryStore = create<TerritoryStore>()((set, get) => ({
  // Initial state
  teams: initialTeams,
  members: {},
  regions: seedRegions,
  assignments: {},
  teamOrder: initialTeamOrder,
  regionOrder: seedRegionOrder,
  activeView: 'map',
  drillDownCountryCode: null,
  selectedEntityCode: null,
  hoveredEntityCode: null,

  // ── Teams ──────────────────────────────────────────────────────────────
  addTeam(name, color) {
    const id = `team-${crypto.randomUUID()}`;
    const teamColor = color ?? getTeamColor(get().teamOrder.length);
    set((s) => ({
      teams: { ...s.teams, [id]: { id, name, color: teamColor, memberIds: [] } },
      teamOrder: [...s.teamOrder, id],
    }));
  },

  updateTeam(id, patch) {
    set((s) => ({
      teams: { ...s.teams, [id]: { ...s.teams[id], ...patch } },
    }));
  },

  removeTeam(id) {
    set((s) => {
      const { [id]: _, ...rest } = s.teams;
      // Remove assignments for this team
      const assignments = Object.fromEntries(
        Object.entries(s.assignments).filter(([, a]) => a.teamId !== id),
      );
      return {
        teams: rest,
        teamOrder: s.teamOrder.filter((tid) => tid !== id),
        assignments,
      };
    });
  },

  // ── Members ────────────────────────────────────────────────────────────
  addMember(teamId, member) {
    const id = `member-${crypto.randomUUID()}`;
    set((s) => ({
      members: { ...s.members, [id]: { id, ...member } },
      teams: {
        ...s.teams,
        [teamId]: {
          ...s.teams[teamId],
          memberIds: [...(s.teams[teamId]?.memberIds ?? []), id],
        },
      },
    }));
  },

  updateMember(id, patch) {
    set((s) => ({
      members: { ...s.members, [id]: { ...s.members[id], ...patch } },
    }));
  },

  removeMember(teamId, memberId) {
    set((s) => {
      const { [memberId]: _, ...restMembers } = s.members;
      return {
        members: restMembers,
        teams: {
          ...s.teams,
          [teamId]: {
            ...s.teams[teamId],
            memberIds: s.teams[teamId].memberIds.filter((id) => id !== memberId),
          },
        },
      };
    });
  },

  // ── Regions ────────────────────────────────────────────────────────────
  addRegion(name, canonicalKey, countryCodes) {
    const id = `region-${crypto.randomUUID()}`;
    set((s) => ({
      regions: { ...s.regions, [id]: { id, name, canonicalKey, countryCodes } },
      regionOrder: [...s.regionOrder, id],
    }));
  },

  removeRegion(id) {
    set((s) => {
      const { [id]: _, ...rest } = s.regions;
      return { regions: rest, regionOrder: s.regionOrder.filter((rid) => rid !== id) };
    });
  },

  assignRegionToTeam(regionId, teamId) {
    const region = get().regions[regionId];
    if (!region) return;
    // Country name lookup not available here — we'll pass names from the caller
    // For now use code as name (caller can improve by passing feature names)
    const items = region.countryCodes.map((code) => ({ code, name: code }));
    get().bulkAssign(items, 'country', teamId);
  },

  // ── Assignments ────────────────────────────────────────────────────────
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
      const { [entityCode]: _, ...rest } = s.assignments;
      return { assignments: rest };
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

  // ── UI ─────────────────────────────────────────────────────────────────
  setActiveView: (view) => set({ activeView: view }),
  setDrillDownCountryCode: (code) => set({ drillDownCountryCode: code }),
  setSelectedEntityCode: (code) => set({ selectedEntityCode: code }),
  setHoveredEntityCode: (code) => set({ hoveredEntityCode: code }),

  // ── Serialisation ──────────────────────────────────────────────────────
  exportState() {
    const { teams, members, regions, assignments, teamOrder, regionOrder } = get();
    return JSON.stringify({ teams, members, regions, assignments, teamOrder, regionOrder });
  },

  importState(json) {
    try {
      const data = JSON.parse(json);
      set((s) => ({ ...s, ...data }));
    } catch {
      console.error('Failed to import state');
    }
  },
}));
