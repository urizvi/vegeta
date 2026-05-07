import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Member, SalesTeam } from '@/types/territory';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[membersSlice] ${label} failed`, err));
}

export interface MembersSlice {
  members: Record<string, Member>;

  addMember: (teamId: string, member: Omit<Member, 'id'>) => string;
  updateMember: (id: string, patch: Partial<Omit<Member, 'id'>>) => void;
  removeMember: (teamId: string, memberId: string) => void;
  hydrateMembers: (members: Array<Member & { teamId: string | null }>) => void;
}

export const membersPersistKeys = ['members'] as const satisfies readonly (keyof MembersSlice)[];

export const createMembersSlice: StateCreator<TerritoryStore, [], [], MembersSlice> = (set) => ({
  members: {},

  addMember(teamId, member) {
    const id = crypto.randomUUID();
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
    fireWrite(
      `createMember(${id})`,
      directusWrite.createMember({ id, ...member, teamId }),
    );
    return id;
  },

  updateMember(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.members[id]) return s;
      didApply = true;
      return { members: { ...s.members, [id]: { ...s.members[id], ...patch } } };
    });
    if (didApply) fireWrite(`updateMember(${id})`, directusWrite.updateMemberRemote(id, patch));
  },

  removeMember(teamId, memberId) {
    let didApply = false;
    let clearedLeadOnTeam = false;
    set((s) => {
      if (!s.members[memberId]) return s;
      didApply = true;
      const team = s.teams[teamId];
      const wasLead = team?.leadMemberId === memberId;
      clearedLeadOnTeam = wasLead;
      const members = { ...s.members };
      delete members[memberId];
      return {
        members,
        teams: {
          ...s.teams,
          [teamId]: {
            ...team,
            memberIds: team.memberIds.filter((id) => id !== memberId),
            leadMemberId: wasLead ? null : team.leadMemberId,
          },
        },
      };
    });
    if (!didApply) return;
    fireWrite(`deleteMember(${memberId})`, directusWrite.deleteMember(memberId));
    if (clearedLeadOnTeam) {
      fireWrite(
        `clearTeamLead(${teamId})`,
        directusWrite.updateTeamRemote(teamId, { leadMemberId: null }),
      );
    }
  },

  hydrateMembers(incoming) {
    set((s) => {
      const members: Record<string, Member> = {};
      const nextTeams: Record<string, SalesTeam> = {};
      s.teamOrder.forEach((tid) => {
        nextTeams[tid] = { ...s.teams[tid], memberIds: [] };
      });
      incoming.forEach((m) => {
        members[m.id] = { id: m.id, name: m.name, email: m.email, role: m.role, level: m.level };
        if (m.teamId && nextTeams[m.teamId]) {
          nextTeams[m.teamId].memberIds.push(m.id);
        }
      });
      return { members, teams: nextTeams };
    });
  },
});
