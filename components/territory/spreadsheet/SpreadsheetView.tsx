'use client';

import { useMemo, useState } from 'react';
import { useGeoData } from '@/hooks/useGeoData';
import { useCountryStates } from '@/hooks/useCountryStates';
import { useDrillDownCountryCode } from '@/hooks/useTerritoryStore';
import SpreadsheetRow from './SpreadsheetRow';

export default function SpreadsheetView() {
  const countries = useGeoData();
  const drillDownCode = useDrillDownCountryCode();
  const { features: stateFeatures, loading } = useCountryStates(drillDownCode);
  const [search, setSearch] = useState('');

  // Country rows (world view)
  const countryRows = useMemo(
    () =>
      countries
        .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [countries, search],
  );

  // State rows (drill-down view)
  const stateRows = useMemo(
    () =>
      stateFeatures
        .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [stateFeatures, search],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search bar */}
      <div className="border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={drillDownCode ? 'Search states/provinces…' : 'Search countries…'}
          className="w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="w-10 py-2.5 pl-4 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400" />
              <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {drillDownCode ? 'State / Province' : 'Country'}
              </th>
              <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Region
              </th>
              <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Assigned Team
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-zinc-950">
            {drillDownCode ? (
              loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-zinc-400">
                    Loading…
                  </td>
                </tr>
              ) : stateRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-zinc-400">
                    No states/provinces found.
                  </td>
                </tr>
              ) : (
                stateRows.map((f) => (
                  <SpreadsheetRow
                    key={f.id}
                    entityCode={`${f.iso2}:${f.id}`}
                    entityName={f.name}
                    entityType="state"
                    iso2={f.iso2}
                  />
                ))
              )
            ) : countryRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-sm text-zinc-400">
                  No countries found.
                </td>
              </tr>
            ) : (
              countryRows.map((c) => (
                <SpreadsheetRow
                  key={c.rsmKey}
                  entityCode={c.iso2 || c.id}
                  entityName={c.name}
                  entityType="country"
                  iso2={c.iso2}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
