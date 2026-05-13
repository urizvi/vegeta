'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useMapTheme, useActions, useHighlightedEntityCodes,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import {
  useCoverageGaps, useAssignmentConflicts,
} from '@/store/slices/mapUiSelectors';
import MapLegend from './MapLegend';
import ChoroplethScale from './ChoroplethScale';
import MapChip from './MapChip';

interface Props {
  view: 'world' | 'drilldown';
  drilldownIso2?: string;
}

type OpenChip = 'legend' | 'scale' | 'gaps' | 'conflicts' | null;

export default function MapChipsDock({ view, drilldownIso2 }: Props) {
  const theme = useMapTheme();
  const { active, scale, fieldDef } = useChoroplethScale(view, drilldownIso2);
  const gaps = useCoverageGaps(view, drilldownIso2);
  const conflicts = useAssignmentConflicts(view, drilldownIso2);
  const { setHighlightedEntityCodes, clearHighlight } = useActions();
  const highlighted = useHighlightedEntityCodes();
  const [openChip, setOpenChip] = useState<OpenChip>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const isHighlightingGaps =
    highlighted.length > 0 &&
    highlighted.length === gaps.codes.length &&
    gaps.codes.every((c) => highlighted.includes(c));
  const isHighlightingConflicts =
    highlighted.length > 0 &&
    highlighted.length === conflicts.codes.length &&
    conflicts.codes.every((c) => highlighted.includes(c));

  useEffect(() => {
    if (!openChip) return;
    function onDocClick(e: MouseEvent) {
      if (!dockRef.current) return;
      if (e.target instanceof Node && !dockRef.current.contains(e.target)) {
        setOpenChip(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openChip]);

  function toggle(chip: Exclude<OpenChip, null>) {
    setOpenChip((cur) => (cur === chip ? null : chip));
  }

  return (
    <div
      ref={dockRef}
      className="absolute left-4 bottom-4 z-10 flex items-end gap-2"
    >
      <ChipWithPopover
        open={openChip === 'legend'}
        popover={<MapLegend />}
        theme={theme}
      >
        <MapChip
          label="Legend"
          active={openChip === 'legend'}
          onClick={() => toggle('legend')}
          glance={<span className="font-medium">Legend</span>}
        />
      </ChipWithPopover>

      {active && scale && fieldDef && (
        <ChipWithPopover
          open={openChip === 'scale'}
          popover={<ChoroplethScale scale={scale} fieldDef={fieldDef} />}
          theme={theme}
        >
          <MapChip
            label="Choropleth scale"
            active={openChip === 'scale'}
            onClick={() => toggle('scale')}
            glance={
              <span
                aria-hidden="true"
                className="inline-block h-2 w-8 rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--color-amber-400), var(--color-brand))' }}
              />
            }
          />
        </ChipWithPopover>
      )}

      {gaps.count > 0 && (
        <ChipWithPopover
          open={openChip === 'gaps'}
          popover={
            <button
              type="button"
              onClick={() => (isHighlightingGaps ? clearHighlight() : setHighlightedEntityCodes(gaps.codes))}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingGaps ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              {gaps.count} unassigned — highlight
            </button>
          }
          theme={theme}
        >
          <MapChip
            label={`${gaps.count} coverage gaps`}
            active={openChip === 'gaps' || isHighlightingGaps}
            onClick={() => toggle('gaps')}
            glance={
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                <span className="font-mono tabular-nums">{gaps.count}</span>
              </>
            }
          />
        </ChipWithPopover>
      )}

      {conflicts.count > 0 && (
        <ChipWithPopover
          open={openChip === 'conflicts'}
          popover={
            <button
              type="button"
              onClick={() => (isHighlightingConflicts ? clearHighlight() : setHighlightedEntityCodes(conflicts.codes))}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-xs ${isHighlightingConflicts ? 'bg-brand/10 ring-1 ring-brand' : 'bg-panel hover:bg-canvas'}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              {conflicts.count} conflicts — highlight
            </button>
          }
          theme={theme}
        >
          <MapChip
            label={`${conflicts.count} assignment conflicts`}
            active={openChip === 'conflicts' || isHighlightingConflicts}
            onClick={() => toggle('conflicts')}
            glance={
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-mono tabular-nums">{conflicts.count}</span>
              </>
            }
          />
        </ChipWithPopover>
      )}
    </div>
  );
}

interface PopoverProps {
  open: boolean;
  popover: ReactNode;
  theme: { legendClass: string };
  children: ReactNode;
}

function ChipWithPopover({ open, popover, theme, children }: PopoverProps) {
  return (
    <div className="relative">
      {open && (
        <div
          className={`${theme.legendClass} absolute left-0 bottom-full mb-2 w-[240px]`}
          role="dialog"
        >
          {popover}
        </div>
      )}
      {children}
    </div>
  );
}
