'use client';

import { useState } from 'react';
import {
  useTeams,
  useTeamOrder,
  useTerritoryStore,
} from '@/hooks/useTerritoryStore';
import { getAccountCountByTeam, type RollupCount } from '@/lib/territoryIndex';
import { teamChildrenOf } from '@/lib/teamTree';
import type { SalesTeam } from '@/types/territory';
import AddTeamModal from './AddTeamModal';

export default function TeamTreeView() {
  const teams = useTeams();
  const order = useTeamOrder();
  const [addParentId, setAddParentId] = useState<string | null | undefined>(undefined);

  const roots = order.filter((id) => (teams[id]?.parentId ?? null) === null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {roots.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No teams yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {roots.map((id) => {
            const t = teams[id];
            if (!t) return null;
            return (
              <TreeNode
                key={id}
                team={t}
                isLast
                ancestorLastFlags={[]}
                onAddSubteam={(pid) => setAddParentId(pid)}
              />
            );
          })}
        </ul>
      )}

      {addParentId !== undefined && (
        <AddTeamModal
          parentId={addParentId}
          onClose={() => setAddParentId(undefined)}
        />
      )}
    </div>
  );
}

function TreeNode({
  team,
  isLast,
  ancestorLastFlags,
  onAddSubteam,
}: {
  team: SalesTeam;
  isLast: boolean;
  /** For each ancestor (root → parent), true if that ancestor was the last sibling at its level. */
  ancestorLastFlags: boolean[];
  onAddSubteam: (parentId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const teams = useTeams();
  const order = useTeamOrder();
  const counts: RollupCount = useTerritoryStore((s) =>
    getAccountCountByTeam(s)[team.id] ?? { direct: 0, total: 0 },
  );
  const lead = useTerritoryStore((s) =>
    team.leadMemberId ? s.members[team.leadMemberId] ?? null : null,
  );
  const childIds = teamChildrenOf(teams, order, team.id);
  const hasChildren = childIds.length > 0;
  const depth = ancestorLastFlags.length;

  return (
    <li className="flex flex-col">
      <div className="group flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-slate-50 dark:hover:bg-slate-800/60">
        {/* Indent rails for ancestor levels */}
        {ancestorLastFlags.map((wasLast, i) => (
          <span
            key={i}
            className={`inline-block h-6 w-4 flex-shrink-0 ${
              wasLast ? '' : 'border-l border-slate-200 dark:border-slate-700'
            }`}
            aria-hidden="true"
          />
        ))}

        {/* Branch glyph for this node */}
        {depth > 0 && (
          <span className="relative inline-block h-6 w-4 flex-shrink-0" aria-hidden="true">
            <span
              className={`absolute left-0 top-0 w-px bg-slate-200 dark:bg-slate-700 ${
                isLast ? 'h-3' : 'h-full'
              }`}
            />
            <span className="absolute left-0 top-3 h-px w-3 bg-slate-200 dark:bg-slate-700" />
          </span>
        )}

        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? '' : '-rotate-90'}`}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
            </svg>
          </button>
        ) : (
          <span className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        )}

        {/* Color dot */}
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-white/60 shadow-sm"
          style={{ backgroundColor: team.color }}
          aria-hidden="true"
        />

        {/* Name */}
        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {team.name}
        </span>

        {/* Lead */}
        {lead && (
          <span
            className="ml-1 inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            title={`Team lead: ${lead.name}`}
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1l2.16 4.38 4.84.7-3.5 3.41.83 4.81L8 12.02l-4.33 2.28.83-4.81L1 6.08l4.84-.7L8 1z" />
            </svg>
            <span className="max-w-[8rem] truncate">{lead.name}</span>
          </span>
        )}

        <div className="flex-1" />

        {/* Account count */}
        <span
          className="flex-shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
          title={`${counts.direct} direct accounts · ${counts.total} including roll-up`}
        >
          {counts.direct} · {counts.total}
        </span>

        {/* Hover action: add sub-team */}
        <button
          type="button"
          onClick={() => onAddSubteam(team.id)}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-700"
          title="Add sub-team"
          aria-label="Add sub-team"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
          </svg>
        </button>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <ul className="flex flex-col gap-0.5">
          {childIds.map((cid, i) => {
            const child = teams[cid];
            if (!child) return null;
            return (
              <TreeNode
                key={cid}
                team={child}
                isLast={i === childIds.length - 1}
                ancestorLastFlags={[...ancestorLastFlags, isLast]}
                onAddSubteam={onAddSubteam}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}
