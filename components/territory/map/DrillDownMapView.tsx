'use client';

import { useState, useCallback } from 'react';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Sphere, Graticule } from 'react-simple-maps';
import { useCountryStates } from '@/hooks/useCountryStates';
import type { StateFeature } from '@/hooks/useCountryStates';
import { useCountryFillColor, useActions } from '@/hooks/useTerritoryStore';
import MapLegend from './MapLegend';
import MapTooltip from './MapTooltip';
import AssignPopover from './AssignPopover';

interface DrillDownMapViewProps {
  countryIso2: string;
  countryName: string;
}

interface PopoverState {
  entityCode: string;
  entityName: string;
  position: { x: number; y: number };
}

// Single state geography — memoized per feature
function StateGeo({
  geo,
  onClickState,
}: {
  geo: StateFeature;
  onClickState: (geo: StateFeature, x: number, y: number) => void;
}) {
  const entityCode = `${geo.iso2}:${geo.id}`;
  const fill = useCountryFillColor(entityCode);
  const { setHoveredEntityCode } = useActions();

  return (
    <Geography
      geography={geo as unknown as import('react-simple-maps').GeographyFeature}
      fill={fill}
      stroke="#fff"
      strokeWidth={0.8}
      style={{
        default: { outline: 'none', cursor: 'pointer', transition: 'fill 150ms ease' },
        hover: { outline: 'none', fill: fill === '#d1d5db' ? '#b0b7c0' : fill, opacity: 0.82 },
        pressed: { outline: 'none' },
      }}
      onMouseEnter={() => setHoveredEntityCode(`${geo.name} (${geo.id})`)}
      onMouseLeave={() => setHoveredEntityCode(null)}
      onClick={(e: React.MouseEvent) => onClickState(geo, e.clientX, e.clientY)}
      role="button"
      aria-label={geo.name}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const rect = e.currentTarget.getBoundingClientRect();
          onClickState(geo, rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
      }}
    />
  );
}

export default function DrillDownMapView({ countryIso2, countryName }: DrillDownMapViewProps) {
  const { features, loading, error } = useCountryStates(countryIso2);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [zoom, setZoom] = useState(1);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleClickState = useCallback((geo: StateFeature, x: number, y: number) => {
    const entityCode = `${geo.iso2}:${geo.id}`;
    setPopover({ entityCode, entityName: geo.name, position: { x, y } });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#e8f4f8]">
        <div className="flex items-center gap-2 text-zinc-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading {countryName}…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#e8f4f8]">
        <div className="text-red-500">Failed to load states: {error}</div>
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#e8f4f8]">
        <p className="text-zinc-500">No state/province data available for {countryName}.</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 bg-[#e8f4f8]" onMouseMove={handleMouseMove}>
      <ComposableMap
        projection="geoMercator"
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup zoom={zoom} minZoom={0.5} maxZoom={12}>
          <Sphere fill="#cde8f5" stroke="#b0cdd8" strokeWidth={0.5} />
          <Graticule stroke="#d5e8ef" strokeWidth={0.3} step={[20, 20]} />
          <Geographies geography={{ type: 'FeatureCollection', features }}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const feat = features.find((f) => f.rsmKey === geo.rsmKey);
                if (!feat) return null;
                return (
                  <StateGeo key={geo.rsmKey} geo={feat} onClickState={handleClickState} />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.5, 12))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-bold shadow hover:bg-zinc-50"
          aria-label="Zoom in"
        >+</button>
        <button
          onClick={() => setZoom((z) => Math.max(z / 1.5, 0.5))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-bold shadow hover:bg-zinc-50"
          aria-label="Zoom out"
        >−</button>
        <button
          onClick={() => setZoom(1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-xs shadow hover:bg-zinc-50"
          aria-label="Reset zoom"
        >⊙</button>
      </div>

      <MapLegend />
      <MapTooltip mousePos={mousePos} />

      {popover && (
        <AssignPopover
          entityCode={popover.entityCode}
          entityName={popover.entityName}
          entityType="state"
          position={popover.position}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
