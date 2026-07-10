'use client';

import { useMemo, useState } from 'react';
import { useGeoData } from '@/hooks/useGeoData';
import { useCountryStates } from '@/hooks/useCountryStates';
import {
  useDrillDownCountryCode,
  useRegions,
  useRegionOrder,
  useSubregions,
  useSubregionOrder,
} from '@/hooks/useTerritoryStore';
import SpreadsheetRow from './SpreadsheetRow';

export default function SpreadsheetView() {
  const countries = useGeoData();
  const drillDownCode = useDrillDownCountryCode();
  const { features: stateFeatures, loading } = useCountryStates(drillDownCode);
  const [search, setSearch] = useState('');

  const regions = useRegions();
  const regionOrder = useRegionOrder();
  const subregions = useSubregions();
  const subregionOrder = useSubregionOrder();

  // Build iso2 → region name lookup from the store
  const countryToRegionName = useMemo(() => {
    const map: Record<string, string> = {};
    regionOrder.forEach((rid) => {
      const region = regions[rid];
      if (!region) return;
      region.countryCodes.forEach((iso2) => { map[iso2] = region.name; });
    });
    return map;
  }, [regions, regionOrder]);

  // Build iso2 → regionId so SpreadsheetRow can check subregion roll-up
  const countryToRegionId = useMemo(() => {
    const map: Record<string, string> = {};
    regionOrder.forEach((rid) => {
      const region = regions[rid];
      if (!region) return;
      region.countryCodes.forEach((iso2) => { map[iso2] = rid; });
    });
    return map;
  }, [regions, regionOrder]);

  // Build stateCode (e.g. "US:US-CA") → subregion lookup
  const stateToSubregion = useMemo(() => {
    const map: Record<string, { name: string; id: string }> = {};
    subregionOrder.forEach((sid) => {
      const sub = subregions[sid];
      if (!sub) return;
      sub.stateCodes.forEach((code) => { map[code] = { name: sub.name, id: sid }; });
    });
    return map;
  }, [subregions, subregionOrder]);

  const countryRows = useMemo(
    () =>
      countries
        .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [countries, search],
  );

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
      <div className="border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={drillDownCode ? 'Search states/provinces…' : 'Search countries…'}
          className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="w-10 py-2.5 pl-4 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400" />
              <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                {drillDownCode ? 'State / Province' : 'Country'}
              </th>
              <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                {drillDownCode ? 'Subregion' : 'Region'}
              </th>
              <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Assigned Team
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-950">
            {drillDownCode ? (
              loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-slate-400">Loading…</td>
                </tr>
              ) : stateRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-slate-400">No states/provinces found.</td>
                </tr>
              ) : (
                stateRows.map((f) => {
                  const entityCode = `${f.iso2}:${f.id}`;
                  const sub = stateToSubregion[entityCode];
                  return (
                    <SpreadsheetRow
                      key={f.id}
                      entityCode={entityCode}
                      entityName={f.name}
                      entityType="state"
                      iso2={f.iso2}
                      groupLabel={sub?.name ?? null}
                    />
                  );
                })
              )
            ) : countryRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-sm text-slate-400">No countries found.</td>
              </tr>
            ) : (
              countryRows.map((c) => (
                <SpreadsheetRow
                  key={c.rsmKey}
                  entityCode={c.iso2 || c.id}
                  entityName={c.name}
                  entityType="country"
                  iso2={c.iso2}
                  groupLabel={countryToRegionName[c.iso2] ?? null}
                  regionId={countryToRegionId[c.iso2] ?? null}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
