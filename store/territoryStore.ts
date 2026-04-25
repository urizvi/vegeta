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
import * as directusWrite from '@/lib/directus-write';
import { getAccounts as fetchAccounts } from '@/lib/directus';

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

  // Account writes (Directus-backed; local cache updated from server response).
  addAccount: (
    data: { name: string; country: string; state?: string; repId?: string | null; fields?: Record<string, string | number> },
  ) => Promise<void>;
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => Promise<void>;
  setAccountField: (accountId: string, fieldId: string, value: string | number) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  deleteAccounts: (ids: string[]) => Promise<void>;
  importAccounts: (
    rows: Array<{ name: string; country: string; state?: string; repId?: string | null; fields?: Record<string, string | number> }>,
  ) => Promise<void>;

  // Field-def writes (Directus-backed).
  addFieldDef: (def: Omit<FieldDefinition, 'id'>) => Promise<void>;
  updateFieldDef: (id: string, patch: Partial<Omit<FieldDefinition, 'id'>>) => Promise<void>;
  removeFieldDef: (id: string) => Promise<void>;
  reorderFieldDefs: (orderedIds: string[]) => Promise<void>;

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

  // ── Account writes (optimistic, reconcile from Directus on failure) ────
  async addAccount(data) {
    try {
      const created = await directusWrite.createAccount({
        name: data.name,
        country: data.country,
        state: data.state,
        repId: data.repId ?? null,
        fields: data.fields ?? {},
      });
      set((s) => ({
        accounts: { ...s.accounts, [created.id]: created },
        accountOrder: [...s.accountOrder, created.id],
      }));
    } catch (err) {
      console.error('addAccount failed', err);
      throw err;
    }
  },

  async updateAccount(id, patch) {
    const prev = get().accounts[id];
    if (!prev) return;
    // Optimistic
    set((s) => ({ accounts: { ...s.accounts, [id]: { ...prev, ...patch } } }));
    try {
      const updated = await directusWrite.updateAccount(id, patch);
      set((s) => ({ accounts: { ...s.accounts, [id]: updated } }));
    } catch (err) {
      console.error('updateAccount failed; reverting', err);
      set((s) => ({ accounts: { ...s.accounts, [id]: prev } }));
      throw err;
    }
  },

  async setAccountField(accountId, fieldId, value) {
    const prev = get().accounts[accountId];
    if (!prev) return;
    const nextFields = { ...prev.fields, [fieldId]: value };
    // Optimistic
    set((s) => ({
      accounts: { ...s.accounts, [accountId]: { ...prev, fields: nextFields } },
    }));
    try {
      const updated = await directusWrite.updateAccount(accountId, { fields: nextFields });
      set((s) => ({ accounts: { ...s.accounts, [accountId]: updated } }));
    } catch (err) {
      console.error('setAccountField failed; reverting', err);
      set((s) => ({ accounts: { ...s.accounts, [accountId]: prev } }));
      throw err;
    }
  },

  async deleteAccount(id) {
    const prev = get().accounts[id];
    const prevOrder = get().accountOrder;
    if (!prev) return;
    // Optimistic
    set((s) => {
      const accounts = { ...s.accounts };
      delete accounts[id];
      return { accounts, accountOrder: s.accountOrder.filter((aid) => aid !== id) };
    });
    try {
      await directusWrite.deleteAccount(id);
    } catch (err) {
      console.error('deleteAccount failed; reverting', err);
      set({ accounts: { ...get().accounts, [id]: prev }, accountOrder: prevOrder });
      throw err;
    }
  },

  async importAccounts(rows) {
    const defs = get().fieldDefs;
    const defaults: Record<string, string | number> = {};
    defs.forEach((d) => {
      if (d.type === 'metric') defaults[d.id] = 0;
      else if (d.type === 'categorical' && d.options?.length) defaults[d.id] = d.options[0];
      else defaults[d.id] = '';
    });
    const inputs = rows.map((r) => ({
      name: r.name,
      country: r.country,
      state: r.state,
      repId: r.repId ?? null,
      fields: { ...defaults, ...(r.fields ?? {}) },
    }));
    try {
      const created = await directusWrite.createAccountsBulk(inputs);
      set((s) => {
        const accounts = { ...s.accounts };
        const accountOrder = [...s.accountOrder];
        created.forEach((a) => {
          accounts[a.id] = a;
          accountOrder.push(a.id);
        });
        return { accounts, accountOrder };
      });
    } catch (err) {
      console.error('importAccounts failed', err);
      throw err;
    }
  },

  async addFieldDef(def) {
    try {
      const sort = get().fieldDefs.length;
      const created = await directusWrite.createFieldDef(def, sort);
      set((s) => ({ fieldDefs: [...s.fieldDefs, created] }));
    } catch (err) {
      console.error('addFieldDef failed', err);
      throw err;
    }
  },

  async updateFieldDef(id, patch) {
    const prev = get().fieldDefs.find((d) => d.id === id);
    if (!prev) return;
    // Optimistic
    set((s) => ({
      fieldDefs: s.fieldDefs.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
    try {
      const updated = await directusWrite.updateFieldDef(id, patch);
      set((s) => ({
        fieldDefs: s.fieldDefs.map((d) => (d.id === id ? updated : d)),
      }));
    } catch (err) {
      console.error('updateFieldDef failed; reverting', err);
      set((s) => ({
        fieldDefs: s.fieldDefs.map((d) => (d.id === id ? prev : d)),
      }));
      throw err;
    }
  },

  async removeFieldDef(id) {
    const prev = get().fieldDefs;
    set((s) => ({ fieldDefs: s.fieldDefs.filter((d) => d.id !== id) }));
    try {
      await directusWrite.deleteFieldDef(id);
    } catch (err) {
      console.error('removeFieldDef failed; reverting', err);
      set({ fieldDefs: prev });
      throw err;
    }
  },

  async reorderFieldDefs(orderedIds) {
    const prev = get().fieldDefs;
    const map = Object.fromEntries(prev.map((d) => [d.id, d]));
    const next = orderedIds.map((id) => map[id]).filter(Boolean);
    set({ fieldDefs: next });
    try {
      await directusWrite.reorderFieldDefs(orderedIds);
    } catch (err) {
      console.error('reorderFieldDefs failed; reverting', err);
      set({ fieldDefs: prev });
      throw err;
    }
  },

  async deleteAccounts(ids) {
    const idSet = new Set(ids);
    const prevAccounts = get().accounts;
    const prevOrder = get().accountOrder;
    // Optimistic
    set((s) => {
      const accounts = { ...s.accounts };
      ids.forEach((id) => delete accounts[id]);
      return { accounts, accountOrder: s.accountOrder.filter((id) => !idSet.has(id)) };
    });
    try {
      await directusWrite.deleteAccounts(ids);
    } catch (err) {
      console.error('deleteAccounts failed; refetching to reconcile', err);
      // Best-effort reconcile: refetch from server.
      try {
        const fresh = await fetchAccounts();
        get().hydrateAccounts(fresh);
      } catch {
        set({ accounts: prevAccounts, accountOrder: prevOrder });
      }
      throw err;
    }
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
