'use client';

import { useState } from 'react';
import {
  useMapTheme, useActions, useHighlightedEntityCodes,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import {
  useCoverageGaps, useAssignmentConflicts, useFocusedEntityIso,
} from '@/store/slices/mapUiSelectors';
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
  const focusedIso = useFocusedEntityIso();
  const [collapsed, setCollapsed] = useState(false);

  const isHighlightingGaps =
    highlighted.length > 0 &&
    highlighted.length === gaps.codes.length &&
    gaps.codes.every((c) => highlighted.includes(c));
  const isHighlightingConflicts =
    highlighted.length > 0 &&
    highlighted.length === conflicts.codes.length &&
    conflicts.codes.every((c) => highlighted.includes(c));

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Show map info"
        className={`${theme.legendClass} absolute right-4 top-16 z-10 flex h-8 w-8 items-center justify-center rounded-full`}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4 L6 8 L10 12" />
        </svg>
      </button>
    );
  }

  return (
    <div className={`${theme.legendClass} absolute right-4 top-16 z-10 flex w-[260px] flex-col gap-3 max-h-[calc(100%-7rem)] overflow-y-auto`}>
      <div className="flex items-center justify-end -mb-1">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide map info"
          className="rounded p-1 opacity-60 hover:opacity-100 hover:bg-canvas"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4 L10 8 L6 12" />
          </svg>
        </button>
      </div>

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

      {focusedIso && (
        <div className="border-t border-hairline pt-3">
          <RegionSummaryPanel />
        </div>
      )}
    </div>
  );
}
