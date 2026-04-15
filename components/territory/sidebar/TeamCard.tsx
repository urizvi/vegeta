'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useActions, useTerritoryStore, useTeamSubregions } from '@/hooks/useTerritoryStore';
import type { SalesTeam } from '@/types/territory';
import MemberRow from './MemberRow';
import AddMemberModal from './AddMemberModal';
import { getContrastText } from '@/lib/colorUtils';

export default function TeamCard({ team }: { team: SalesTeam }) {
  const [expanded, setExpanded] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(team.name);
  const { updateTeam, removeTeam } = useActions();
  const members = useTerritoryStore(
    useShallow((s) => team.memberIds.map((id) => s.members[id]).filter(Boolean)),
  );
  const teamSubregions = useTeamSubregions(team.id);
  const contrastColor = getContrastText(team.color);

  function saveName() {
    if (nameInput.trim()) updateTeam(team.id, { name: nameInput.trim() });
    setEditingName(false);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
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

        {/* Actions */}
        <div className="flex items-center gap-1">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: 'rgba(0,0,0,0.15)', color: contrastColor }}
          >
            {members.length}
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
            onClick={() => { if (confirm(`Delete team "${team.name}"?`)) removeTeam(team.id); }}
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
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Subregions ({teamSubregions.length})
              </p>
              <div className="flex flex-col gap-0.5">
                {teamSubregions.map((sub) => sub && (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800/50"
                  >
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="flex-1 truncate font-medium text-zinc-700 dark:text-zinc-200">
                      {sub.name}
                    </span>
                    <span className="text-zinc-400">{sub.stateCodes.length} states</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members */}
          <div>
            {teamSubregions.length > 0 && (
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Members ({members.length})
              </p>
            )}
            {members.length === 0 ? (
              <p className="py-2 text-center text-xs text-zinc-400">No members yet</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {members.map((m) => (
                  <MemberRow key={m.id} member={m} teamId={team.id} />
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAddMember(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 py-1.5 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
              </svg>
              Add member
            </button>
          </div>
        </div>
      )}

      {showAddMember && (
        <AddMemberModal teamId={team.id} onClose={() => setShowAddMember(false)} />
      )}
    </div>
  );
}
