'use client';

import { useState } from 'react';
import {
  useActions,
  useTerritoryStore,
  useHierarchyLevels,
  useHierarchyLevelOrder,
} from '@/hooks/useTerritoryStore';
import { getAccountCountByMember, type RollupCount } from '@/lib/territoryIndex';
import type { Member } from '@/types/territory';

export default function MemberRow({
  member,
  teamId,
  isLead = false,
}: {
  member: Member;
  teamId: string;
  isLead?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [role, setRole] = useState(member.role);
  const [level, setLevel] = useState<string>(member.level);
  const [leadDraft, setLeadDraft] = useState(isLead);
  const { updateMember, removeMember, setTeamLead } = useActions();
  const levels = useHierarchyLevels();
  const levelOrder = useHierarchyLevelOrder();
  const memberLevelDef = levels[member.level];
  const counts: RollupCount = useTerritoryStore((s) =>
    getAccountCountByMember(s)[member.id] ?? { direct: 0, total: 0 },
  );

  function save() {
    updateMember(member.id, { name, email, role, level });
    if (leadDraft !== isLead) {
      setTeamLead(teamId, leadDraft ? member.id : null);
    }
    setEditing(false);
  }

  function cancel() {
    setName(member.name);
    setEmail(member.email);
    setRole(member.role);
    setLevel(member.level);
    setLeadDraft(isLead);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role"
            className="rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
          <div className="flex items-center gap-2">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={levelOrder.length === 0}
              className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 disabled:opacity-50"
            >
              {levelOrder.length === 0 ? (
                <option value="">No levels defined</option>
              ) : (
                levelOrder.map((id) => (
                  <option key={id} value={id}>{levels[id]?.label ?? id}</option>
                ))
              )}
            </select>
            <label className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={leadDraft}
                onChange={(e) => setLeadDraft(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-amber-500"
              />
              Team lead
            </label>
          </div>
          <div className="flex gap-1">
            <button
              onClick={save}
              className="flex-1 rounded bg-indigo-600 py-1 text-xs font-medium text-white hover:bg-indigo-700"
            >Save</button>
            <button
              onClick={cancel}
              className="flex-1 rounded border border-slate-200 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-600"
            >Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 rounded-lg p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            {member.name}
          </span>
          {memberLevelDef ? (
            <span
              className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-800"
              style={{ backgroundColor: memberLevelDef.color }}
            >
              {memberLevelDef.label}
            </span>
          ) : member.level ? (
            <span
              className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              title={`Unknown level "${member.level}" — was it deleted?`}
            >
              {member.level}
            </span>
          ) : null}
          {isLead && (
            <span
              className="flex-shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              title="Team lead"
            >
              Lead
            </span>
          )}
          <span
            className="flex-shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
            title={`${counts.direct} direct · ${counts.total} including roll-up`}
          >
            {counts.direct} · {counts.total}
          </span>
        </div>
        {member.role && (
          <p className="truncate text-xs text-slate-500">{member.role}</p>
        )}
        <p className="truncate text-xs text-slate-400">{member.email}</p>
      </div>
      <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
          aria-label="Edit member"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.609z" />
          </svg>
        </button>
        <button
          onClick={() => removeMember(teamId, member.id)}
          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/30"
          aria-label="Remove member"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H.75a.75.75 0 010-1.5H3V1.75C3 .784 3.784 0 4.75 0h6.5C12.216 0 13 .784 13 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
