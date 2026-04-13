'use client';

import { useTeams, useTeamOrder, useEntityAssignment, useActions } from '@/hooks/useTerritoryStore';
import { flagEmoji } from '@/lib/geoUtils';
import { ISO2_TO_REGION, REGION_LABELS } from '@/lib/regionData';
import type { AssignmentEntityType } from '@/types/territory';

interface SpreadsheetRowProps {
  entityCode: string; // ISO2 for country; "{ISO2}:{stateCode}" for state
  entityName: string;
  entityType: AssignmentEntityType;
  iso2: string; // country ISO2 (for flag + region)
}

export default function SpreadsheetRow({
  entityCode,
  entityName,
  entityType,
  iso2,
}: SpreadsheetRowProps) {
  const teams = useTeams();
  const teamOrder = useTeamOrder();
  const assignment = useEntityAssignment(entityCode);
  const { setAssignment, clearAssignment } = useActions();

  const region = iso2 ? ISO2_TO_REGION[iso2] : undefined;
  const regionLabel = region ? REGION_LABELS[region] : '—';
  const assignedTeam = assignment ? teams[assignment.teamId] : null;

  return (
    <tr className="group border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
      <td className="w-10 py-2.5 pl-4 pr-2 text-center text-lg">
        {entityType === 'country' ? flagEmoji(iso2) : '📍'}
      </td>
      <td className="py-2.5 pr-4">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{entityName}</span>
        {entityType === 'state' && (
          <span className="ml-2 text-xs text-zinc-400">{entityCode}</span>
        )}
      </td>
      <td className="py-2.5 pr-4">
        {region ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {regionLabel}
          </span>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          {assignedTeam && (
            <span
              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: assignedTeam.color }}
            />
          )}
          <select
            value={assignment?.teamId ?? ''}
            onChange={(e) => {
              if (!e.target.value) {
                clearAssignment(entityCode);
              } else {
                setAssignment(entityCode, entityType, entityName, e.target.value);
              }
            }}
            className="rounded-lg border border-zinc-200 py-1 pl-2 pr-6 text-sm text-zinc-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="">Unassigned</option>
            {teamOrder.map((id) => {
              const team = teams[id];
              if (!team) return null;
              return (
                <option key={id} value={id}>
                  {team.name}
                </option>
              );
            })}
          </select>
        </div>
      </td>
    </tr>
  );
}
