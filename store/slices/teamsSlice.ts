import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { SalesTeam } from '@/types/territory';
import { getTeamColor } from '@/lib/colorUtils';
import { isTeamAncestor, teamDescendantsOf } from '@/lib/teamTree';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[teamsSlice] ${label} failed`, err));
}

export interface TeamsSlice {
  teams: Record<string, SalesTeam>;
  teamOrder: string[];

  addTeam: (name: string, color?: string, parentId?: string | null) => string;
  updateTeam: (
    id: string,
    patch: Partial<Pick<SalesTeam, 'name' | 'color' | 'parentId' | 'leadMemberId'>>,
  ) => void;
  reparentTeam: (id: string, newParentId: string | null) => void;
  setTeamLead: (teamId: string, memberId: string | null) => void;
  removeTeam: (id: string, mode?: 'cascade' | 'reparent-children') => void;
  hydrateTeams: (teams: SalesTeam[], order: string[]) => void;
}

export const teamsPersistKeys = ['teams', 'teamOrder'] as const satisfies readonly (keyof TeamsSlice)[];

export const createTeamsSlice: StateCreator<TerritoryStore, [], [], TeamsSlice> = (set) => ({
  teams: {},
  teamOrder: [],

  addTeam(name, color, parentId = null) {
    const id = crypto.randomUUID();
    let sortIndex = 0;
    let teamColor = color ?? '#3b82f6';
    set((s) => {
      sortIndex = s.teamOrder.length;
      teamColor = color ?? getTeamColor(sortIndex);
      return {
        teams: {
          ...s.teams,
          [id]: { id, name, color: teamColor, memberIds: [], parentId, leadMemberId: null },
        },
        teamOrder: [...s.teamOrder, id],
      };
    });
    fireWrite(
      `createTeam(${id})`,
      directusWrite.createTeam(
        { id, name, color: teamColor, memberIds: [], parentId, leadMemberId: null },
        sortIndex,
      ),
    );
    return id;
  },

  updateTeam(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.teams[id]) return s;
      didApply = true;
      return { teams: { ...s.teams, [id]: { ...s.teams[id], ...patch } } };
    });
    if (didApply) fireWrite(`updateTeam(${id})`, directusWrite.updateTeamRemote(id, patch));
  },

  reparentTeam(id, newParentId) {
    let didApply = false;
    set((s) => {
      if (!s.teams[id]) return s;
      if (newParentId !== null) {
        if (newParentId === id) return s;
        if (!s.teams[newParentId]) return s;
        if (isTeamAncestor(s.teams, id, newParentId)) return s; // would create a cycle
      }
      didApply = true;
      return {
        teams: { ...s.teams, [id]: { ...s.teams[id], parentId: newParentId } },
      };
    });
    if (didApply) {
      fireWrite(
        `reparentTeam(${id})`,
        directusWrite.updateTeamRemote(id, { parentId: newParentId }),
      );
    }
  },

  setTeamLead(teamId, memberId) {
    let didApply = false;
    set((s) => {
      const t = s.teams[teamId];
      if (!t) return s;
      if (memberId !== null && !t.memberIds.includes(memberId)) return s;
      didApply = true;
      return { teams: { ...s.teams, [teamId]: { ...t, leadMemberId: memberId } } };
    });
    if (didApply) {
      fireWrite(
        `setTeamLead(${teamId})`,
        directusWrite.updateTeamRemote(teamId, { leadMemberId: memberId }),
      );
    }
  },

  removeTeam(id, mode = 'cascade') {
    let dropTeamIds: string[] = [];
    let dropMemberIds: string[] = [];
    const reparentPatches: Array<{ id: string; parentId: string | null }> = [];
    set((s) => {
      if (!s.teams[id]) return s;
      if (mode === 'cascade') {
        const toDrop = teamDescendantsOf(s.teams, id);
        dropTeamIds = Array.from(toDrop);
        const teams = { ...s.teams };
        const members = { ...s.members };
        toDrop.forEach((tid) => {
          (teams[tid]?.memberIds ?? []).forEach((mid) => {
            dropMemberIds.push(mid);
            delete members[mid];
          });
          delete teams[tid];
        });
        const assignments = Object.fromEntries(
          Object.entries(s.assignments).filter(([, a]) => !toDrop.has(a.teamId)),
        );
        return {
          teams,
          teamOrder: s.teamOrder.filter((tid) => !toDrop.has(tid)),
          members,
          assignments,
        };
      }
      // reparent-children: move direct children up to this team's parent
      const newParent = s.teams[id].parentId;
      const teams: Record<string, SalesTeam> = {};
      for (const [tid, t] of Object.entries(s.teams)) {
        if (tid === id) continue;
        if (t.parentId === id) {
          teams[tid] = { ...t, parentId: newParent };
          reparentPatches.push({ id: tid, parentId: newParent });
        } else {
          teams[tid] = t;
        }
      }
      const members = { ...s.members };
      const droppedMemberIds = s.teams[id].memberIds ?? [];
      droppedMemberIds.forEach((mid) => { delete members[mid]; });
      dropMemberIds = [...droppedMemberIds];
      dropTeamIds = [id];
      const assignments = Object.fromEntries(
        Object.entries(s.assignments).filter(([, a]) => a.teamId !== id),
      );
      return {
        teams,
        teamOrder: s.teamOrder.filter((tid) => tid !== id),
        members,
        assignments,
      };
    });
    if (dropTeamIds.length === 0) return;
    // Reparent-children must run before deletes so children aren't orphaned at SET NULL.
    for (const p of reparentPatches) {
      fireWrite(
        `reparentTeam(${p.id})`,
        directusWrite.updateTeamRemote(p.id, { parentId: p.parentId }),
      );
    }
    for (const mid of dropMemberIds) {
      fireWrite(`deleteMember(${mid})`, directusWrite.deleteMember(mid));
    }
    for (const tid of dropTeamIds) {
      fireWrite(`deleteTeam(${tid})`, directusWrite.deleteTeam(tid));
    }
  },

  hydrateTeams(teams, order) {
    set((s) => {
      const map: Record<string, SalesTeam> = {};
      teams.forEach((t) => {
        // Preserve any memberIds already attached by hydrateMembers.
        map[t.id] = { ...t, memberIds: s.teams[t.id]?.memberIds ?? [] };
      });
      return { teams: map, teamOrder: order };
    });
  },
});
