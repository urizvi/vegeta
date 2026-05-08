import { useMemo } from 'react';
import { useTerritoryStore } from '../territoryStore';
import { MAP_THEMES } from '@/lib/mapThemes';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';
import {
  getEntityGeoIndex,
  getAccountStatsByEntity,
  getEntityMetricVal,
} from '@/lib/territoryIndex';
import type { FieldDefinition } from '@/lib/accountFields';
import type { GeoNode } from '@/types/territory';

export const useActiveView = () => useTerritoryStore((s) => s.activeView);
export const useMapTheme = () => useTerritoryStore((s) => MAP_THEMES[s.mapThemeId]);
export const useDrillDownCountryCode = () => useTerritoryStore((s) => s.drillDownCountryCode);
export const useSelectedEntityCode = () => useTerritoryStore((s) => s.selectedEntityCode);
export const useHoveredEntityCode = () => useTerritoryStore((s) => s.hoveredEntityCode);
export const useHoveredEntityIso = () => useTerritoryStore((s) => s.hoveredEntityIso);
export const useShowAccounts = () => useTerritoryStore((s) => s.showAccounts);
export const useMapAccountMetric = () => useTerritoryStore((s) => s.mapAccountMetric);

export const useShowLabels = () => useTerritoryStore((s) => s.showLabels);
export const usePinnedEntityIso = () => useTerritoryStore((s) => s.pinnedEntityIso);
export const useHighlightedEntityCodes = () =>
  useTerritoryStore((s) => s.highlightedEntityCodes);
export const useMapZoomCommand = () => useTerritoryStore((s) => s.mapZoomCommand);

/** Effective focused entity = pinned (if any) else hovered. */
export const useFocusedEntityIso = () =>
  useTerritoryStore((s) => s.pinnedEntityIso ?? s.hoveredEntityIso);

/** Whether a given entity code is currently highlighted by a coverage badge. */
export const useEntityHighlight = (entityCode: string) =>
  useTerritoryStore((s) => s.highlightedEntityCodes.includes(entityCode));

// ── Region rollup ─────────────────────────────────────────────────────────────
//
// These hooks return objects containing freshly-built arrays. To keep the
// snapshot reference-stable (required by useSyncExternalStore), we subscribe to
// only the primitive store slices we need and derive the result via useMemo.

export interface RegionRollup {
  entityCode: string;
  name: string;
  geoTrail: string[];
  count: number;
  topMetricTotals: { fieldId: string; label: string; total: number; field: FieldDefinition }[];
  topOwners: { repId: string; name: string; teamColor: string | null; count: number }[];
}

export const useRegionRollup = (entityCode: string | null): RegionRollup | null => {
  const hoveredName    = useTerritoryStore((s) => s.hoveredEntityCode);
  const geoNodes       = useTerritoryStore((s) => s.geoNodes);
  const fieldDefs      = useTerritoryStore((s) => s.fieldDefs);
  const mapMetric      = useTerritoryStore((s) => s.mapAccountMetric);
  const accounts       = useTerritoryStore((s) => s.accounts);
  const accountOrder   = useTerritoryStore((s) => s.accountOrder);
  const members        = useTerritoryStore((s) => s.members);
  const teams          = useTerritoryStore((s) => s.teams);
  const teamOrder      = useTerritoryStore((s) => s.teamOrder);
  const stats          = useTerritoryStore((s) => getAccountStatsByEntity(s));
  const idx            = useTerritoryStore((s) => getEntityGeoIndex(s));

  return useMemo<RegionRollup | null>(() => {
    if (!entityCode) return null;

    const name = hoveredName ?? entityCode;

    let nodeId: string | undefined = idx[entityCode];
    if (!nodeId && entityCode.includes(':')) nodeId = idx[entityCode.split(':')[0]];
    const trail: string[] = [];
    let cur: string | null | undefined = nodeId ?? null;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const n: GeoNode | undefined = geoNodes[cur];
      if (!n) break;
      trail.unshift(n.name);
      cur = n.parentId;
    }

    const entityStats = stats[entityCode];
    const count = entityStats?.count ?? 0;

    const topMetricTotals = fieldDefs
      .filter((f) => f.entity === 'account' && f.type === 'metric')
      .map((f) => ({
        fieldId: f.id,
        label: f.label,
        total: getEntityMetricVal(entityStats, f.id),
        field: f,
      }))
      .sort((a, b) => {
        if (a.fieldId === mapMetric) return -1;
        if (b.fieldId === mapMetric) return 1;
        return b.total - a.total;
      })
      .slice(0, 3);

    const repTeamMap: Record<string, string> = {};
    for (const tid of teamOrder) {
      const t = teams[tid];
      if (!t) continue;
      for (const mid of t.memberIds) repTeamMap[mid] = tid;
    }

    const ownerCounts: Record<string, number> = {};
    for (const aid of accountOrder) {
      const a = accounts[aid];
      if (!a?.repId) continue;
      const matches = entityCode.includes(':')
        ? a.state === entityCode
        : a.country === entityCode;
      if (!matches) continue;
      ownerCounts[a.repId] = (ownerCounts[a.repId] ?? 0) + 1;
    }
    const topOwners = Object.entries(ownerCounts)
      .map(([repId, c]) => {
        const m = members[repId];
        const teamId = repTeamMap[repId] ?? null;
        const teamColor = teamId ? (teams[teamId]?.color ?? null) : null;
        return { repId, name: m?.name ?? 'Unknown', teamColor, count: c };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (count === 0 && trail.length === 0) {
      return { entityCode, name, geoTrail: [], count: 0, topMetricTotals: [], topOwners: [] };
    }
    return { entityCode, name, geoTrail: trail, count, topMetricTotals, topOwners };
  }, [
    entityCode, hoveredName, geoNodes, fieldDefs, mapMetric,
    accounts, accountOrder, members, teams, teamOrder, stats, idx,
  ]);
};

// ── Coverage gaps & assignment conflicts ──────────────────────────────────────

export interface CoverageInfo {
  count: number;
  codes: string[];
}

export const useCoverageGaps = (
  view: 'world' | 'drilldown',
  drilldownIso2?: string,
): CoverageInfo => {
  const idx            = useTerritoryStore((s) => getEntityGeoIndex(s));
  const subregionOrder = useTerritoryStore((s) => s.subregionOrder);
  const subregions     = useTerritoryStore((s) => s.subregions);

  return useMemo<CoverageInfo>(() => {
    if (view === 'world') {
      const codes: string[] = [];
      for (const code of Object.keys(COUNTRY_CENTROIDS)) {
        if (!idx[code]) codes.push(code);
      }
      return { count: codes.length, codes };
    }
    if (!drilldownIso2) return { count: 0, codes: [] };
    const seen = new Set<string>();
    for (const sid of subregionOrder) {
      for (const code of subregions[sid]?.stateCodes ?? []) {
        if (code.startsWith(`${drilldownIso2}:`)) seen.add(code);
      }
    }
    const codes: string[] = [];
    for (const code of seen) {
      if (!idx[code]) codes.push(code);
    }
    return { count: codes.length, codes };
  }, [idx, subregionOrder, subregions, view, drilldownIso2]);
};

export const useAssignmentConflicts = (
  view: 'world' | 'drilldown',
  drilldownIso2?: string,
): CoverageInfo => {
  const idx      = useTerritoryStore((s) => getEntityGeoIndex(s));
  const geoNodes = useTerritoryStore((s) => s.geoNodes);

  return useMemo<CoverageInfo>(() => {
    const conflicts: { country: string; state: string }[] = [];
    for (const stateCode in idx) {
      if (!stateCode.includes(':')) continue;
      const country = stateCode.split(':')[0];
      const stateNode = idx[stateCode];
      const countryNode = idx[country];
      if (!countryNode) continue;
      if (stateNode === countryNode) continue;
      const chain = (start: string) => {
        const out = new Set<string>();
        let cur: string | null = start;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          out.add(cur);
          cur = geoNodes[cur]?.parentId ?? null;
        }
        return out;
      };
      const stateChain = chain(stateNode);
      const countryChain = chain(countryNode);
      const compatible =
        stateChain.has(countryNode) || countryChain.has(stateNode);
      if (!compatible) conflicts.push({ country, state: stateCode });
    }
    if (view === 'world') {
      const set = new Set(conflicts.map((c) => c.country));
      return { count: set.size, codes: [...set] };
    }
    const filtered = drilldownIso2
      ? conflicts.filter((c) => c.country === drilldownIso2)
      : conflicts;
    return { count: filtered.length, codes: filtered.map((c) => c.state) };
  }, [idx, geoNodes, view, drilldownIso2]);
};
