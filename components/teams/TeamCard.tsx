'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useActions,
  useTerritoryStore,
  useTeams,
  useTeamOrder,
  useTeamSubregions,
} from '@/hooks/useTerritoryStore';
import { getAccountCountByTeam, type RollupCount } from '@/lib/territoryIndex';
import { teamChildrenOf } from '@/lib/teamTree';
import type { SalesTeam } from '@/types/territory';
import MemberRow from './MemberRow';
import AddMemberModal from './AddMemberModal';
import AddTeamModal from './AddTeamModal';
import { getContrastText } from '@/lib/colorUtils';

export default function TeamCard({ team, depth = 0 }: { team: SalesTeam; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddSubteam, setShowAddSubteam] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(team.name);
  const { updateTeam, removeTeam } = useActions();
  const allTeams = useTeams();
  const allTeamOrder = useTeamOrder();
  const members = useTerritoryStore(
    useShallow((s) => team.memberIds.map((id) => s.members[id]).filter(Boolean)),
  );
  const teamSubregions = useTeamSubregions(team.id);
  const counts: RollupCount = useTerritoryStore((s) =>
    getAccountCountByTeam(s)[team.id] ?? { direct: 0, total: 0 },
  );
  const childIds = teamChildrenOf(allTeams, allTeamOrder, team.id);
  const lead = useTerritoryStore((s) =>
    team.leadMemberId ? s.members[team.leadMemberId] ?? null : null,
  );
  const contrastColor = getContrastText(team.color);

  function saveName() {
    if (nameInput.trim()) updateTeam(team.id, { name: nameInput.trim() });
    setEditingName(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div
        className="flex items-center gap-2 rounded-t-xl px-3 py-2.5"
        style={{ backgroundColor: team.color }}
      >
        {/* Color picker */}
        <label className="cursor-pointer">
          <span className="sr-only">Change team color</span>
          <input
            type="color"
            value={team.color}
            onChange={(e) => updateTeam(team.id, { color: e.target.value })}
            className="h-0 w-0 opacity-0"
          />
          <span
            className="inline-block h-4 w-4 rounded-full border-2 border-white/60 shadow"
            style={{ backgroundColor: team.color }}
          />
        </label>

        {/* Name */}
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="flex-1 rounded bg-white/20 px-1.5 py-0.5 text-sm font-semibold outline-none"
            style={{ color: contrastColor }}
          />
        ) : (
          <button
            onClick={() => { setEditingName(true); setNameInput(team.name); }}
            className="flex-1 truncate text-left text-sm font-semibold"
            style={{ color: contrastColor }}
          >
            {team.name}
          </button>
        )}

        {/* Lead chip */}
        {lead && (
          <span
            className="hidden flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex"
            style={{ backgroundColor: 'rgba(0,0,0,0.18)', color: contrastColor }}
            title={`Team lead: ${lead.name}`}
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1l2.16 4.38 4.84.7-3.5 3.41.83 4.81L8 12.02l-4.33 2.28.83-4.81L1 6.08l4.84-.7L8 1z" />
            </svg>
            <span className="max-w-[8rem] truncate">{lead.name}</span>
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: 'rgba(0,0,0,0.15)', color: contrastColor }}
            title={`${counts.direct} direct accounts · ${counts.total} including roll-up`}
          >
            {counts.direct} · {counts.total}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
            style={{ color: contrastColor }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
            </svg>
          </button>
          <button
            onClick={() => { if (confirm(`Delete team "${team.name}" and all sub-teams?`)) removeTeam(team.id); }}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
            style={{ color: contrastColor }}
            aria-label="Delete team"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-2 py-2 space-y-3">
          {/* Subregions */}
          {teamSubregions.length > 0 && (
            <div>
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Subregions ({teamSubregions.length})
              </p>
              <div className="flex flex-col gap-0.5">
                {teamSubregions.map((sub) => sub && (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/50"
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-200">
                      {sub.name}
                    </span>
                    <span className="text-slate-400">{sub.stateCodes.length} states</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members */}
          <div>
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Members ({members.length})
            </p>
            {members.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400">No members yet</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    teamId={team.id}
                    isLead={team.leadMemberId === m.id}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAddMember(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
              </svg>
              Add member
            </button>
          </div>

          {/* Sub-teams */}
          <div>
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Sub-teams ({childIds.length})
            </p>
            {childIds.length > 0 && (
              <div className="flex flex-col gap-2">
                {childIds.map((cid) => {
                  const child = allTeams[cid];
                  if (!child) return null;
                  return <TeamCard key={cid} team={child} depth={depth + 1} />;
                })}
              </div>
            )}
            <button
              onClick={() => setShowAddSubteam(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
              </svg>
              Add sub-team
            </button>
          </div>
        </div>
      )}

      {showAddMember && (
        <AddMemberModal teamId={team.id} onClose={() => setShowAddMember(false)} />
      )}
      {showAddSubteam && (
        <AddTeamModal parentId={team.id} onClose={() => setShowAddSubteam(false)} />
      )}
    </div>
  );
}
