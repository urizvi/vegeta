'use client';

import { useEffect, useRef } from 'react';
import { useTeams, useTeamOrder, useEntityAssignment, useActions } from '@/hooks/useTerritoryStore';
import type { AssignmentEntityType } from '@/types/territory';

interface AssignPopoverProps {
  entityCode: string;
  entityName: string;
  entityType: AssignmentEntityType;
  position: { x: number; y: number };
  onClose: () => void;
  onDrillDown?: () => void;
}

export default function AssignPopover({
  entityCode,
  entityName,
  entityType,
  position,
  onClose,
  onDrillDown,
}: AssignPopoverProps) {
  const teams = useTeams();
  const teamOrder = useTeamOrder();
  const assignment = useEntityAssignment(entityCode);
  const { setAssignment, clearAssignment } = useActions();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const left = Math.min(position.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 224);
  const top = Math.min(position.y + 8, (typeof window !== 'undefined' ? window.innerHeight : 600) - 240);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-56 rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left, top }}
    >
      <p className="mb-2 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        {entityName}
      </p>

      {/* Drill-down button (country only) */}
      {onDrillDown && (
        <button
          onClick={onDrillDown}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span>🔍</span> View states/provinces
        </button>
      )}

      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
        Assign to team
      </p>
      <div className="flex flex-col gap-0.5">
        {teamOrder.map((id) => {
          const team = teams[id];
          if (!team) return null;
          const isAssigned = assignment?.teamId === id;
          return (
            <button
              key={id}
              onClick={() => {
                setAssignment(entityCode, entityType, entityName, id);
                onClose();
              }}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                isAssigned
                  ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
              }`}
            >
              <span
                className="h-3 w-3 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: team.color }}
              />
              <span className="truncate text-zinc-700 dark:text-zinc-200">{team.name}</span>
              {isAssigned && <span className="ml-auto text-xs text-zinc-400">✓</span>}
            </button>
          );
        })}
        {assignment && (
          <button
            onClick={() => { clearAssignment(entityCode); onClose(); }}
            className="mt-1 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            Clear assignment
          </button>
        )}
      </div>
    </div>
  );
}
