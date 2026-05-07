'use client';

import {
  useMapTheme, useActions, useHighlightedEntityCodes,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import { useCoverageGaps, useAssignmentConflicts } from '@/store/slices/mapUiSelectors';
import MapLegend from './MapLegend';
import ChoroplethScale from './ChoroplethScale';
import RegionSummaryPanel from './RegionSummaryPanel';

interface Props {
  view: 'world' | 'drilldown';
  drilldownIso2?: string;
}

export default function MapInfoRail({ view, drilldownIso2 }: Props) {
  const theme = useMapTheme();
  const { active, scale, fieldDef } = useChoroplethScale(view, drilldownIso2);
  const gaps = useCoverageGaps(view, drilldownIso2);
  const conflicts = useAssignmentConflicts(view, drilldownIso2);
  const { setHighlightedEntityCodes, clearHighlight } = useActions();
  const highlighted = useHighlightedEntityCodes();

  const isHighlightingGaps =
    highlighted.length > 0 &&
    highlighted.length === gaps.codes.length &&
    gaps.codes.every((c) => highlighted.includes(c));
  const isHighlightingConflicts =
    highlighted.length > 0 &&
    highlighted.length === conflicts.codes.length &&
    conflicts.codes.every((c) => highlighted.includes(c));

  return (
    <div className={`${theme.legendClass} absolute right-4 top-16 z-10 flex w-[300px] flex-col gap-3 max-h-[calc(100%-7rem)] overflow-y-auto`}>
      {active && scale && fieldDef && (
        <ChoroplethScale scale={scale} fieldDef={fieldDef} />
      )}
      <MapLegend />

      {(gaps.count > 0 || conflicts.count > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {gaps.count > 0 && (
            <button
              type="button"
              onClick={() => isHighlightingGaps ? clearHighlight() : setHighlightedEntityCodes(gaps.codes)}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingGaps ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              {gaps.count} unassigned
            </button>
          )}
          {conflicts.count > 0 && (
            <button
              type="button"
              onClick={() => isHighlightingConflicts ? clearHighlight() : setHighlightedEntityCodes(conflicts.codes)}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingConflicts ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              {conflicts.count} conflicts
            </button>
          )}
        </div>
      )}

      <div className="border-t border-hairline pt-3">
        <RegionSummaryPanel />
      </div>
    </div>
  );
}
