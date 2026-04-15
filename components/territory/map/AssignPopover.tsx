'use client';

import { useEffect, useRef } from 'react';
import {
  useTeams,
  useTeamOrder,
  useEntityAssignment,
  useSubregionForState,
  useActions,
} from '@/hooks/useTerritoryStore';
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
  const subregion = useSubregionForState(entityType === 'state' ? entityCode : '');
  const { setAssignment, clearAssignment } = useActions();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const left = Math.min(position.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 232);
  const top = Math.min(position.y + 8, (typeof window !== 'undefined' ? window.innerHeight : 600) - 260);

  const subregionTeam = subregion?.teamId ? teams[subregion.teamId] : null;

  return (
    <div
      ref={ref}
      className="fixed z-50 w-58 min-w-[220px] rounded-xl border border-zinc-200 bg-white p-3 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left, top }}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {entityName}
        </p>
        <button
          onClick={onClose}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          aria-label="Close"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      {/* State: show subregion info */}
      {entityType === 'state' && (
        <div className="mb-3 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Subregion
          </p>
          {subregion ? (
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: subregionTeam?.color ?? '#d1d5db' }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {subregion.name}
                </p>
                <p className="text-xs text-zinc-400">
                  {subregionTeam ? subregionTeam.name : 'Unassigned'} · {subregion.stateCodes.length} states
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-400">
              Not in any subregion.{' '}
              <span className="text-zinc-500">Use the Regions tab in the sidebar to create subregions.</span>
            </p>
          )}
        </div>
      )}

      {/* Country: drill-down button */}
      {onDrillDown && (
        <button
          onClick={onDrillDown}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span>🔍</span> View states/provinces
        </button>
      )}

      {/* Country: direct team assignment */}
      {entityType === 'country' && (
        <>
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
                  onClick={() => { setAssignment(entityCode, entityType, entityName, id); onClose(); }}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                    isAssigned
                      ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ backgroundColor: team.color }} />
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
        </>
      )}
    </div>
  );
}
