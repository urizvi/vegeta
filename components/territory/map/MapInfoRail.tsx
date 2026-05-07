'use client';

import { useMapTheme } from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
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

  return (
    <div
      className={`${theme.legendClass} absolute right-4 top-16 z-10 flex w-[300px] flex-col gap-3 max-h-[calc(100%-7rem)] overflow-y-auto`}
    >
      {active && scale && fieldDef && (
        <ChoroplethScale scale={scale} fieldDef={fieldDef} />
      )}
      <MapLegend />
      <div className="border-t border-hairline pt-3">
        <RegionSummaryPanel />
      </div>
    </div>
  );
}
