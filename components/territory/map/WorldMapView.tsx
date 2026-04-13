'use client';

import { useState, useCallback, memo } from 'react';
import { ComposableMap, ZoomableGroup, Geography, Sphere, Graticule } from 'react-simple-maps';
import { useGeoData } from '@/hooks/useGeoData';
import type { CountryFeature } from '@/hooks/useGeoData';
import { useCountryFillColor, useActions } from '@/hooks/useTerritoryStore';
import MapLegend from './MapLegend';
import MapTooltip from './MapTooltip';
import AssignPopover from './AssignPopover';

interface WorldMapViewProps {
  onDrillDown: (iso2: string, name: string) => void;
}

interface PopoverState {
  entityCode: string;
  entityName: string;
  position: { x: number; y: number };
}

// Render one country — memoised so it only re-renders when its fill color changes
const CountryGeo = memo(function CountryGeo({
  geo,
  onClickCountry,
}: {
  geo: CountryFeature;
  onClickCountry: (geo: CountryFeature, x: number, y: number) => void;
}) {
  const entityCode = geo.iso2 || geo.id;
  const fill = useCountryFillColor(entityCode);
  const { setHoveredEntityCode } = useActions();

  return (
    <Geography
      geography={geo as unknown as import('react-simple-maps').GeographyFeature}
      fill={fill}
      stroke="#fff"
      strokeWidth={0.4}
      style={{
        default: { outline: 'none', cursor: 'pointer', transition: 'fill 150ms ease' },
        hover:   { outline: 'none', fill: fill === '#d1d5db' ? '#b0b7c0' : fill, opacity: 0.82 },
        pressed: { outline: 'none' },
      }}
      onMouseEnter={() => setHoveredEntityCode(geo.name)}
      onMouseLeave={() => setHoveredEntityCode(null)}
      onClick={(e: React.MouseEvent) => onClickCountry(geo, e.clientX, e.clientY)}
      role="button"
      aria-label={geo.name}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const r = e.currentTarget.getBoundingClientRect();
          onClickCountry(geo, r.left + r.width / 2, r.top + r.height / 2);
        }
      }}
    />
  );
});

export default function WorldMapView({ onDrillDown }: WorldMapViewProps) {
  const countries = useGeoData();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([0, 20]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleClickCountry = useCallback((geo: CountryFeature, x: number, y: number) => {
    const entityCode = geo.iso2 || geo.id;
    setPopover({ entityCode, entityName: geo.name, position: { x, y } });
  }, []);

  return (
    <div className="absolute inset-0 bg-[#e8f4f8]" onMouseMove={handleMouseMove}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140 }}
        width={980}
        height={551}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          center={center}
          zoom={zoom}
          minZoom={0.8}
          maxZoom={8}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCenter(coordinates as [number, number]);
            setZoom(z);
          }}
        >
          <Sphere fill="#cde8f5" stroke="#b0cdd8" strokeWidth={0.5} />
          <Graticule stroke="#d5e8ef" strokeWidth={0.3} step={[20, 20]} />
          {countries.map((country) => (
            <CountryGeo
              key={country.rsmKey}
              geo={country}
              onClickCountry={handleClickCountry}
            />
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.5, 8))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-bold shadow hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
          aria-label="Zoom in"
        >+</button>
        <button
          onClick={() => setZoom((z) => Math.max(z / 1.5, 0.8))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-bold shadow hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
          aria-label="Zoom out"
        >−</button>
        <button
          onClick={() => { setZoom(1); setCenter([0, 20]); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-xs shadow hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
          aria-label="Reset zoom"
        >⊙</button>
      </div>

      <MapLegend />
      <MapTooltip mousePos={mousePos} />

      {popover && (
        <AssignPopover
          entityCode={popover.entityCode}
          entityName={popover.entityName}
          entityType="country"
          position={popover.position}
          onClose={() => setPopover(null)}
          onDrillDown={
            popover.entityCode
              ? () => { onDrillDown(popover.entityCode, popover.entityName); setPopover(null); }
              : undefined
          }
        />
      )}
    </div>
  );
}
