'use client';

import {
  useTeams,
  useTeamOrder,
  useEntityAssignment,
  useSubregionForState,
  useRegionRollupTeam,
  useActions,
} from '@/hooks/useTerritoryStore';
import { flagEmoji } from '@/lib/geoUtils';
import type { AssignmentEntityType } from '@/types/territory';

interface SpreadsheetRowProps {
  entityCode: string;
  entityName: string;
  entityType: AssignmentEntityType;
  iso2: string;
  groupLabel: string | null;   // region name (country) or subregion name (state)
  regionId?: string | null;    // only for country rows — used for roll-up
}

export default function SpreadsheetRow({
  entityCode,
  entityName,
  entityType,
  iso2,
  groupLabel,
  regionId = null,
}: SpreadsheetRowProps) {
  const teams = useTeams();
  const teamOrder = useTeamOrder();
  const assignment = useEntityAssignment(entityCode);
  const subregion = useSubregionForState(entityType === 'state' ? entityCode : '');
  const rollupTeam = useRegionRollupTeam(entityType === 'country' ? regionId : null);
  const { setAssignment, clearAssignment } = useActions();

  // Determine effective team + source label
  let effectiveTeamId: string | null = null;
  let managedBy: string | null = null;

  if (entityType === 'state' && subregion) {
    effectiveTeamId = subregion.teamId ?? null;
    managedBy = subregion.name;          // "via <SubregionName>"
  } else if (entityType === 'country' && rollupTeam) {
    effectiveTeamId = rollupTeam.id;
    managedBy = groupLabel ?? 'region';  // "via <RegionName>"
  } else {
    effectiveTeamId = assignment?.teamId ?? null;
  }

  const assignedTeam = effectiveTeamId ? (teams[effectiveTeamId] ?? null) : null;
  const isManaged = managedBy !== null;  // read-only — assigned through subregion/region

  return (
    <tr className="group border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
      {/* Flag / icon */}
      <td className="w-10 py-2.5 pl-4 pr-2 text-center text-lg">
        {entityType === 'country' ? flagEmoji(iso2) : '📍'}
      </td>

      {/* Name */}
      <td className="py-2.5 pr-4">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{entityName}</span>
        {entityType === 'state' && (
          <span className="ml-2 text-xs text-zinc-400">{entityCode}</span>
        )}
      </td>

      {/* Region / Subregion badge */}
      <td className="py-2.5 pr-4">
        {groupLabel ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {groupLabel}
          </span>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </td>

      {/* Assigned Team */}
      <td className="py-2 pr-4">
        {isManaged ? (
          /* Managed through subregion or region roll-up — read-only */
          <div className="flex items-center gap-2">
            {assignedTeam ? (
              <>
                <span
                  className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: assignedTeam.color }}
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">{assignedTeam.name}</span>
                <span className="text-xs text-zinc-400">via {managedBy}</span>
              </>
            ) : (
              <span className="text-xs text-zinc-400">Unassigned</span>
            )}
          </div>
        ) : (
          /* Direct assignment — editable dropdown */
          <div className="flex items-center gap-2">
            {assignedTeam && (
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                style={{ backgroundColor: assignedTeam.color }}
              />
            )}
            <select
              value={effectiveTeamId ?? ''}
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
        )}
      </td>
    </tr>
  );
}
