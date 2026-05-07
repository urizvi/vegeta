'use client';

import { useMemo } from 'react';
import {
  useTeams,
  useTeamOrder,
  useMembers,
  useHierarchyLevels,
  useHierarchyLevelOrder,
} from '@/hooks/useTerritoryStore';
import { teamAncestorsOf } from '@/lib/teamTree';
import type { Member, SalesTeam } from '@/types/territory';

interface Row {
  member: Member;
  teamId: string;
  /** Team names from root → leaf (the row's team path). */
  path: string[];
  /** True if this member is the lead of their immediate team. */
  isLead: boolean;
}

export default function TeamsTableView() {
  const teams = useTeams();
  const order = useTeamOrder();
  const members = useMembers();
  const levels = useHierarchyLevels();
  const levelOrder = useHierarchyLevelOrder();

  const { rows, maxDepth } = useMemo(() => {
    const teamPathById = new Map<string, string[]>();
    function pathFor(teamId: string): string[] {
      const cached = teamPathById.get(teamId);
      if (cached) return cached;
      const ancestors = teamAncestorsOf(teams, teamId).reverse(); // root → parent
      const t: SalesTeam | undefined = teams[teamId];
      const path = [
        ...ancestors.map((aid) => teams[aid]?.name ?? '').filter(Boolean),
        ...(t ? [t.name] : []),
      ];
      teamPathById.set(teamId, path);
      return path;
    }

    const rows: Row[] = [];
    let maxDepth = 0;
    for (const teamId of order) {
      const team = teams[teamId];
      if (!team) continue;
      const path = pathFor(teamId);
      maxDepth = Math.max(maxDepth, path.length);
      for (const memberId of team.memberIds) {
        const member = members[memberId];
        if (!member) continue;
        rows.push({
          member,
          teamId,
          path,
          isLead: team.leadMemberId === memberId,
        });
      }
    }

    // Sort by team path (root → leaf, alphabetical), then by member name within.
    rows.sort((a, b) => {
      const len = Math.max(a.path.length, b.path.length);
      for (let i = 0; i < len; i++) {
        const av = a.path[i] ?? '';
        const bv = b.path[i] ?? '';
        const cmp = av.localeCompare(bv);
        if (cmp !== 0) return cmp;
      }
      return a.member.name.localeCompare(b.member.name);
    });

    return { rows, maxDepth: Math.max(maxDepth, 1) };
  }, [teams, order, members]);

  const depthCols = Array.from({ length: maxDepth }, (_, i) => i);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        No team members yet. Add members to a team to populate the grid.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {depthCols.map((d) => (
              <th
                key={`L${d + 1}`}
                scope="col"
                className="whitespace-nowrap border-r border-slate-100 px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:border-slate-800"
              >
                L{d + 1}
              </th>
            ))}
            {levelOrder.map((id) => (
              <th
                key={id}
                scope="col"
                className="whitespace-nowrap border-l border-slate-200 px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:border-slate-700"
              >
                {levels[id]?.label ?? id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.teamId}-${r.member.id}`}
              className="border-b border-slate-50 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40"
            >
              {depthCols.map((d) => {
                const cell = r.path[d] ?? '';
                return (
                  <td
                    key={d}
                    className="whitespace-nowrap border-r border-slate-100 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300"
                  >
                    {cell === '' ? (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
              {levelOrder.map((id) => {
                const match = r.member.level === id;
                return (
                  <td
                    key={id}
                    className="whitespace-nowrap border-l border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                  >
                    {match ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-800 dark:text-slate-100">
                        {r.member.name}
                        {r.isLead && (
                          <span
                            className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            title="Team lead"
                          >
                            Lead
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-200 dark:text-slate-700">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
