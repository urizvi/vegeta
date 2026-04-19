'use client';

import { create } from 'zustand';
import type {
  SalesTeam,
  Member,
  Region,
  Subregion,
  AssignmentEntityType,
  CanonicalRegion,
  TerritoryStoreState,
  Account,
} from '@/types/territory';
import { getTeamColor } from '@/lib/colorUtils';
import { BUILT_IN_REGIONS } from '@/lib/regionData';
import { DEFAULT_THEME_ID } from '@/lib/mapThemes';
import type { MapThemeId } from '@/lib/mapThemes';
import { DEFAULT_FIELD_DEFS } from '@/lib/accountFields';
import type { FieldDefinition } from '@/lib/accountFields';

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
  updateRegionCountries: (regionId: string, countryCodes: string[]) => void;
  removeRegion: (id: string) => void;

  // Subregions
  addSubregion: (name: string, parentRegionId: string, stateCodes: string[], teamId: string | null) => void;
  updateSubregion: (id: string, patch: Partial<Pick<Subregion, 'name' | 'stateCodes'>>) => void;
  removeSubregion: (id: string) => void;
  assignSubregionToTeam: (subregionId: string, teamId: string | null) => void;

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

  // Accounts + field defs — read-side UI state only; data comes from Directus
  toggleShowAccounts: () => void;
  setMapAccountMetric: (metric: string) => void;

  // Hydration (bulk, single-shot writers called by the Directus fetch hook)
  hydrateAccounts: (accounts: Account[]) => void;
  hydrateFieldDefs: (defs: FieldDefinition[]) => void;
  hydrateMembers: (members: Array<{ id: string; name: string; teamId: string | null }>) => void;

  // UI
  setActiveView: (view: 'map' | 'spreadsheet') => void;
  setMapTheme: (themeId: MapThemeId) => void;
  setDrillDownCountryCode: (code: string | null) => void;
  setSelectedEntityCode: (code: string | null) => void;
  setHoveredEntityCode: (code: string | null) => void;
  setHoveredEntityIso: (code: string | null) => void;

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
  subregions: {},
  assignments: {},
  teamOrder: initialTeamOrder,
  regionOrder: seedRegionOrder,
  subregionOrder: [],
  accounts: {},
  accountOrder: [],
  fieldDefs: DEFAULT_FIELD_DEFS,
  showAccounts: true,
  mapAccountMetric: 'count',
  activeView: 'map',
  mapThemeId: DEFAULT_THEME_ID,
  drillDownCountryCode: null,
  selectedEntityCode: null,
  hoveredEntityCode: null,
  hoveredEntityIso: null,

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
      const teams = { ...s.teams };
      delete teams[id];
      const assignments = Object.fromEntries(
        Object.entries(s.assignments).filter(([, a]) => a.teamId !== id),
      );
      return {
        teams,
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
      const members = { ...s.members };
      delete members[memberId];
      return {
        members,
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

  updateRegionCountries(regionId, countryCodes) {
    set((s) => ({
      regions: { ...s.regions, [regionId]: { ...s.regions[regionId], countryCodes } },
    }));
  },

  removeRegion(id) {
    set((s) => {
      const rest = { ...s.regions };
      delete rest[id];
      const removedSubregionIds = s.subregionOrder.filter(
        (sid) => s.subregions[sid]?.parentRegionId === id,
      );
      const subregions = { ...s.subregions };
      removedSubregionIds.forEach((sid) => delete subregions[sid]);
      return {
        regions: rest,
        regionOrder: s.regionOrder.filter((rid) => rid !== id),
        subregions,
        subregionOrder: s.subregionOrder.filter((sid) => !removedSubregionIds.includes(sid)),
      };
    });
  },

  // ── Subregions ─────────────────────────────────────────────────────────────
  addSubregion(name, parentRegionId, stateCodes, teamId) {
    const id = `subregion-${crypto.randomUUID()}`;
    set((s) => ({
      subregions: { ...s.subregions, [id]: { id, name, parentRegionId, stateCodes, teamId } },
      subregionOrder: [...s.subregionOrder, id],
    }));
  },

  updateSubregion(id, patch) {
    set((s) => ({
      subregions: { ...s.subregions, [id]: { ...s.subregions[id], ...patch } },
    }));
  },

  removeSubregion(id) {
    set((s) => {
      const subregions = { ...s.subregions };
      delete subregions[id];
      return { subregions, subregionOrder: s.subregionOrder.filter((sid) => sid !== id) };
    });
  },

  assignSubregionToTeam(subregionId, teamId) {
    set((s) => ({
      subregions: { ...s.subregions, [subregionId]: { ...s.subregions[subregionId], teamId } },
    }));
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

  // ── Hydration (Directus) ───────────────────────────────────────────────
  hydrateAccounts(incoming) {
    const accounts: Record<string, Account> = {};
    const accountOrder: string[] = [];
    incoming.forEach((a) => {
      accounts[a.id] = a;
      accountOrder.push(a.id);
    });
    set({ accounts, accountOrder });
  },

  hydrateFieldDefs(defs) {
    set({ fieldDefs: defs });
  },

  hydrateMembers(incoming) {
    // Directus owns members; rebuild the members map and attach them to teams
    // by the team_id mirror. Teams already exist from local seed.
    set((s) => {
      const members: Record<string, Member> = {};
      const teams: Record<string, SalesTeam> = {};
      s.teamOrder.forEach((tid) => {
        teams[tid] = { ...s.teams[tid], memberIds: [] };
      });
      incoming.forEach((m) => {
        members[m.id] = {
          id: m.id,
          name: m.name,
          email: s.members[m.id]?.email ?? '',
          role: s.members[m.id]?.role ?? '',
          level: s.members[m.id]?.level ?? 'IC',
        };
        if (m.teamId && teams[m.teamId]) {
          teams[m.teamId].memberIds.push(m.id);
        }
      });
      return { members, teams };
    });
  },

  toggleShowAccounts() {
    set((s) => ({ showAccounts: !s.showAccounts }));
  },

  setMapAccountMetric(metric) {
    set({ mapAccountMetric: metric });
  },

  // ── UI ─────────────────────────────────────────────────────────────────
  setActiveView: (view) => set({ activeView: view }),
  setMapTheme: (themeId) => set({ mapThemeId: themeId }),
  setDrillDownCountryCode: (code) => set({ drillDownCountryCode: code }),
  setSelectedEntityCode: (code) => set({ selectedEntityCode: code }),
  setHoveredEntityCode: (code) => set({ hoveredEntityCode: code }),
  setHoveredEntityIso: (code) => set({ hoveredEntityIso: code }),

  // ── Serialisation ──────────────────────────────────────────────────────
  exportState() {
    const {
      teams, members, regions, subregions, assignments,
      teamOrder, regionOrder, subregionOrder,
      accounts, accountOrder, fieldDefs, mapThemeId, mapAccountMetric,
    } = get();
    return JSON.stringify({
      teams, members, regions, subregions, assignments,
      teamOrder, regionOrder, subregionOrder,
      accounts, accountOrder, fieldDefs, mapThemeId, mapAccountMetric,
    });
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
