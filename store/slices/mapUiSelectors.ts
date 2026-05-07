import { useTerritoryStore } from '../territoryStore';
import { MAP_THEMES } from '@/lib/mapThemes';

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

/** Effective focused entity = pinned (if any) else hovered. */
export const useFocusedEntityIso = () =>
  useTerritoryStore((s) => s.pinnedEntityIso ?? s.hoveredEntityIso);

/** Whether a given entity code is currently highlighted by a coverage badge. */
export const useEntityHighlight = (entityCode: string) =>
  useTerritoryStore((s) => s.highlightedEntityCodes.includes(entityCode));

// ── Region rollup ─────────────────────────────────────────────────────────────

import { useShallow } from 'zustand/react/shallow';
import {
  getEntityGeoIndex,
  getAccountStatsByEntity,
  getEntityMetricVal,
} from '@/lib/territoryIndex';
import type { FieldDefinition } from '@/lib/accountFields';

export interface RegionRollup {
  entityCode: string;
  name: string;
  geoTrail: string[];
  count: number;
  topMetricTotals: { fieldId: string; label: string; total: number; field: FieldDefinition }[];
  topOwners: { repId: string; name: string; teamColor: string | null; count: number }[];
}

export const useRegionRollup = (entityCode: string | null): RegionRollup | null =>
  useTerritoryStore(
    useShallow((s): RegionRollup | null => {
      if (!entityCode) return null;

      // hoveredEntityCode stores the human-readable name set by the map on hover.
      const name = s.hoveredEntityCode ?? entityCode;

      // Build geo breadcrumb trail by walking the GeoNode parent chain.
      const idx = getEntityGeoIndex(s);
      let nodeId: string | undefined = idx[entityCode];
      if (!nodeId && entityCode.includes(':')) nodeId = idx[entityCode.split(':')[0]];
      const trail: string[] = [];
      let cur: string | null | undefined = nodeId ?? null;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const n: import('@/types/territory').GeoNode | undefined = s.geoNodes[cur];
        if (!n) break;
        trail.unshift(n.name);
        cur = n.parentId;
      }

      const stats = getAccountStatsByEntity(s)[entityCode];
      const count = stats?.count ?? 0;

      // FieldDefinition.type is 'metric' (not 'number'/'currency').
      // isCurrency flag distinguishes currency metrics.
      const topMetricTotals = s.fieldDefs
        .filter((f) => f.entity === 'account' && f.type === 'metric')
        .map((f) => ({
          fieldId: f.id,
          label: f.label,
          total: getEntityMetricVal(stats, f.id),
          field: f,
        }))
        .sort((a, b) => {
          if (a.fieldId === s.mapAccountMetric) return -1;
          if (b.fieldId === s.mapAccountMetric) return 1;
          return b.total - a.total;
        })
        .slice(0, 3);

      // Member has no teamId field; derive team membership from SalesTeam.memberIds.
      // Build a repId → teamId index from teamOrder + teams.
      const repTeamMap: Record<string, string> = {};
      for (const tid of s.teamOrder) {
        const t = s.teams[tid];
        if (!t) continue;
        for (const mid of t.memberIds) {
          repTeamMap[mid] = tid;
        }
      }

      // Account.state is "US:US-CA" format; account.country is ISO2.
      const ownerCounts: Record<string, number> = {};
      for (const aid of s.accountOrder) {
        const a = s.accounts[aid];
        if (!a?.repId) continue;
        const matches = entityCode.includes(':')
          ? a.state === entityCode
          : a.country === entityCode;
        if (!matches) continue;
        ownerCounts[a.repId] = (ownerCounts[a.repId] ?? 0) + 1;
      }
      const topOwners = Object.entries(ownerCounts)
        .map(([repId, c]) => {
          const m = s.members[repId];
          const teamId = repTeamMap[repId] ?? null;
          const teamColor = teamId ? (s.teams[teamId]?.color ?? null) : null;
          return { repId, name: m?.name ?? 'Unknown', teamColor, count: c };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      if (count === 0 && trail.length === 0) {
        return { entityCode, name, geoTrail: [], count: 0, topMetricTotals: [], topOwners: [] };
      }
      return { entityCode, name, geoTrail: trail, count, topMetricTotals, topOwners };
    }),
  );
