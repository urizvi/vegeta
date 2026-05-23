import { useMemo } from 'react';
import {
  useAccountStatsByEntity,
  useFieldDefs,
  useMapAccountMetric,
} from '@/hooks/useTerritoryStore';
import { buildChoroplethScale, type ChoroplethScale } from '@/lib/choropleth';
import type { FieldDefinition } from '@/lib/accountFields';

export interface UseChoroplethScaleResult {
  active: boolean;
  scale: ChoroplethScale | null;
  fieldDef: FieldDefinition | null;
}

/**
 * The choropleth is "active" when the toolbar metric is something other than
 * the default 'count' AND that metric still resolves to a known field def
 * (so deleting a field mid-session falls back gracefully).
 *
 * `view` selects which entity keys participate in the scale:
 *   - 'world'     → country-level keys only (no `:` in key).
 *   - 'drilldown' → state-level keys only (key contains `:` and starts with iso2).
 */
export function useChoroplethScale(
  view: 'world' | 'drilldown',
  drilldownIso2?: string,
): UseChoroplethScaleResult {
  const metric    = useMapAccountMetric();
  const fieldDefs = useFieldDefs();
  const stats     = useAccountStatsByEntity();

  return useMemo<UseChoroplethScaleResult>(() => {
    if (!metric || metric === 'count') {
      return { active: false, scale: null, fieldDef: null };
    }
    const fieldDef = fieldDefs.find((f) => f.id === metric) ?? null;
    if (!fieldDef) return { active: false, scale: null, fieldDef: null };

    const filter =
      view === 'world'
        ? (key: string) => !key.includes(':')
        : (key: string) => key.includes(':') && (!drilldownIso2 || key.startsWith(`${drilldownIso2}:`));

    const scale = buildChoroplethScale(stats, metric, filter);
    return { active: true, scale, fieldDef };
  }, [metric, fieldDefs, stats, view, drilldownIso2]);
}
