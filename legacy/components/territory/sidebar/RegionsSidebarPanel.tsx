'use client';

import { useState } from 'react';
import {
  useRegions,
  useRegionOrder,
  useSubregions,
  useSubregionOrder,
  useTeams,
  useTeamOrder,
  useActions,
} from '@/hooks/useTerritoryStore';
import AddSubregionModal from '@/legacy/components/territory/toolbar/AddSubregionModal';
import EditRegionModal from '@/legacy/components/territory/toolbar/EditRegionModal';
import type { Region } from '@/types/territory';

export default function RegionsSidebarPanel() {
  const regions = useRegions();
  const regionOrder = useRegionOrder();
  const subregions = useSubregions();
  const subregionOrder = useSubregionOrder();
  const teams = useTeams();
  const teamOrder = useTeamOrder();
  const { assignSubregionToTeam, removeSubregion } = useActions();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addSubregionFor, setAddSubregionFor] = useState<Region | null>(null);
  const [editCountriesFor, setEditCountriesFor] = useState<Region | null>(null);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {regionOrder.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-slate-400">No regions defined.</p>
          </div>
        ) : (
          regionOrder.map((rid) => {
            const region = regions[rid];
            if (!region) return null;
            const isExpanded = expandedId === rid;
            const childSubregions = subregionOrder
              .map((sid) => subregions[sid])
              .filter((s) => s?.parentRegionId === rid);

            return (
              <div
                key={rid}
                className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {/* Region header */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : rid)}
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    <svg
                      className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      viewBox="0 0 16 16" fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4 4a.75.75 0 010 1.06l-4 4a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
                    </svg>
                  </button>

                  <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {region.name}
                  </span>

                  <span className="text-xs text-slate-400">{region.countryCodes.length} countries</span>

                  {/* Edit countries */}
                  <button
                    onClick={() => setEditCountriesFor(region)}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    title="Edit countries"
                    aria-label="Edit countries"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z" />
                    </svg>
                  </button>
                </div>

                {/* Subregions */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {childSubregions.length === 0 ? (
                      <p className="px-4 py-2 text-xs text-slate-400">No subregions yet.</p>
                    ) : (
                      childSubregions.map((sub) => {
                        if (!sub) return null;
                        const assignedTeam = sub.teamId ? teams[sub.teamId] : null;
                        return (
                          <div
                            key={sub.id}
                            className="flex flex-col gap-1.5 border-b border-slate-50 px-3 py-2.5 last:border-0 dark:border-slate-800"
                          >
                            {/* Subregion row */}
                            <div className="flex items-center gap-2">
                              {/* Color dot showing current team */}
                              <span
                                className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-slate-200"
                                style={{ backgroundColor: assignedTeam?.color ?? '#d1d5db' }}
                              />
                              <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                                {sub.name}
                              </span>
                              <span className="text-xs text-slate-400">{sub.stateCodes.length} states</span>
                              {/* Delete */}
                              <button
                                onClick={() => removeSubregion(sub.id)}
                                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950"
                                aria-label="Delete subregion"
                              >
                                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                                </svg>
                              </button>
                            </div>

                            {/* Team assignment select */}
                            <div className="ml-4">
                              <select
                                value={sub.teamId ?? ''}
                                onChange={(e) => assignSubregionToTeam(sub.id, e.target.value || null)}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2 pr-6 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <option value="">Unassigned</option>
                                {teamOrder.map((tid) => {
                                  const team = teams[tid];
                                  if (!team) return null;
                                  return (
                                    <option key={tid} value={tid}>
                                      {team.name}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Add subregion */}
                    <button
                      onClick={() => setAddSubregionFor(region)}
                      className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
                      </svg>
                      Add subregion
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {addSubregionFor && (
        <AddSubregionModal
          parentRegion={addSubregionFor}
          onClose={() => setAddSubregionFor(null)}
        />
      )}
      {editCountriesFor && (
        <EditRegionModal
          region={editCountriesFor}
          onClose={() => setEditCountriesFor(null)}
        />
      )}
    </div>
  );
}
