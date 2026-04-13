'use client';

import { useState } from 'react';
import {
  useActiveView,
  useDrillDownCountryCode,
  useTeams,
  useTeamOrder,
  useRegions,
  useRegionOrder,
  useActions,
} from '@/hooks/useTerritoryStore';
import { REGION_LABELS } from '@/lib/regionData';
import { useGeoData } from '@/hooks/useGeoData';

interface ToolbarProps {
  drillDownCountryName: string | null;
}

export default function Toolbar({ drillDownCountryName }: ToolbarProps) {
  const activeView = useActiveView();
  const drillDownCode = useDrillDownCountryCode();
  const teams = useTeams();
  const teamOrder = useTeamOrder();
  const regions = useRegions();
  const regionOrder = useRegionOrder();
  const { setActiveView, setDrillDownCountryCode, assignRegionToTeam, bulkAssign } = useActions();
  const countries = useGeoData();

  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<string>('');

  function handleAssignRegion(teamId: string) {
    if (!selectedRegionId) return;
    // Build name map from geo data
    const nameMap = Object.fromEntries(countries.map((c) => [c.iso2, c.name]));
    const region = regions[selectedRegionId];
    if (!region) return;
    const items = region.countryCodes.map((code) => ({
      code,
      name: nameMap[code] ?? code,
    }));
    bulkAssign(items, 'country', teamId);
    setRegionDropdownOpen(false);
  }

  return (
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
      {/* Logo / title */}
      <span className="mr-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">
        Sales Deployment
      </span>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-zinc-500">
        <button
          onClick={() => setDrillDownCountryCode(null)}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200 ${
            !drillDownCode ? 'font-semibold text-zinc-800 dark:text-zinc-100' : ''
          }`}
        >
          World
        </button>
        {drillDownCode && drillDownCountryName && (
          <>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="rounded px-1.5 py-0.5 font-semibold text-zinc-800 dark:text-zinc-100">
              {drillDownCountryName}
            </span>
          </>
        )}
      </nav>

      <div className="flex-1" />

      {/* Region bulk-assign */}
      <div className="relative">
        <button
          onClick={() => setRegionDropdownOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM5 13.5a6.5 6.5 0 010-11 6.5 6.5 0 010 11z" />
          </svg>
          Regions
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
          </svg>
        </button>

        {regionDropdownOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Bulk Assign Region to Team
            </p>

            {/* Region picker */}
            <div className="mb-2">
              <label className="mb-1 block text-xs text-zinc-500">Region</label>
              <select
                value={selectedRegionId}
                onChange={(e) => setSelectedRegionId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">Select a region…</option>
                {regionOrder.map((id) => {
                  const r = regions[id];
                  if (!r) return null;
                  return (
                    <option key={id} value={id}>
                      {r.name} ({r.countryCodes.length} countries)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Region label reference */}
            {selectedRegionId && regions[selectedRegionId] && (
              <div className="mb-2 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
                <p className="text-xs text-zinc-500">
                  {REGION_LABELS[regions[selectedRegionId].canonicalKey]} —{' '}
                  {regions[selectedRegionId].countryCodes.length} countries
                </p>
              </div>
            )}

            {/* Team assignment buttons */}
            <div className="flex flex-col gap-1">
              {teamOrder.map((tid) => {
                const team = teams[tid];
                if (!team) return null;
                return (
                  <button
                    key={tid}
                    disabled={!selectedRegionId}
                    onClick={() => handleAssignRegion(tid)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="truncate">Assign to {team.name}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setRegionDropdownOpen(false)}
              className="mt-2 w-full rounded-lg border border-zinc-200 py-1.5 text-xs text-zinc-400 hover:bg-zinc-50 dark:border-zinc-700"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
        <button
          onClick={() => setActiveView('map')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeView === 'map'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z" />
          </svg>
          Map
        </button>
        <button
          onClick={() => setActiveView('spreadsheet')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeView === 'spreadsheet'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zM1.5 5.25v9a.25.25 0 00.25.25H5.5V5.25H1.5zm5.5 0v9.25h7.75a.25.25 0 00.25-.25v-9H7zM5.5 3.75H1.5v-.25L1.75 1.5h3.75v2.25zm1.5 0V1.5h7.25l.25 2V3.75H7z" />
          </svg>
          Spreadsheet
        </button>
      </div>
    </header>
  );
}
