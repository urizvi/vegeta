'use client';

import { usePinnedEntityIso, useMapTheme } from '@/store/slices/mapUiSelectors';
import { useActions } from '@/hooks/useTerritoryStore';
import RegionSummaryPanel from './RegionSummaryPanel';

export default function PinnedRegionCard() {
  const iso = usePinnedEntityIso();
  const theme = useMapTheme();
  const { setPinnedEntityIso } = useActions();

  if (!iso) return null;

  return (
    <div
      className={`${theme.legendClass} absolute right-4 top-16 z-10 w-[280px] max-h-[calc(100%-7rem)] overflow-y-auto`}
      role="dialog"
      aria-label="Pinned region details"
    >
      <div className="flex items-center justify-end -mb-1">
        <button
          type="button"
          onClick={() => setPinnedEntityIso(null)}
          aria-label="Close pinned region"
          className="rounded p-1 opacity-60 hover:opacity-100 hover:bg-canvas"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>
      </div>
      <RegionSummaryPanel iso={iso} />
    </div>
  );
}
