'use client';

import { useState } from 'react';
import { useActions } from '@/hooks/useTerritoryStore';
import type { Member, HierarchyLevel } from '@/types/territory';

const LEVELS: HierarchyLevel[] = ['IC', 'Lead', 'Manager', 'Director', 'VP', 'CRO'];

const LEVEL_COLORS: Record<HierarchyLevel, string> = {
  IC: 'bg-zinc-100 text-zinc-600',
  Lead: 'bg-blue-50 text-blue-700',
  Manager: 'bg-indigo-50 text-indigo-700',
  Director: 'bg-violet-50 text-violet-700',
  VP: 'bg-amber-50 text-amber-700',
  CRO: 'bg-red-50 text-red-700',
};

export default function MemberRow({
  member,
  teamId,
}: {
  member: Member;
  teamId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [role, setRole] = useState(member.role);
  const [level, setLevel] = useState<HierarchyLevel>(member.level);
  const { updateMember, removeMember } = useActions();

  function save() {
    updateMember(member.id, { name, email, role, level });
    setEditing(false);
  }

  function cancel() {
    setName(member.name);
    setEmail(member.email);
    setRole(member.role);
    setLevel(member.level);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as HierarchyLevel)}
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          >
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <div className="flex gap-1">
            <button
              onClick={save}
              className="flex-1 rounded bg-blue-600 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >Save</button>
            <button
              onClick={cancel}
              className="flex-1 rounded border border-zinc-200 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-600"
            >Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 rounded-lg p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {member.name}
          </span>
          <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_COLORS[member.level]}`}>
            {member.level}
          </span>
        </div>
        {member.role && (
          <p className="truncate text-xs text-zinc-500">{member.role}</p>
        )}
        <p className="truncate text-xs text-zinc-400">{member.email}</p>
      </div>
      <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700"
          aria-label="Edit member"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.609z" />
          </svg>
        </button>
        <button
          onClick={() => removeMember(teamId, member.id)}
          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
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
