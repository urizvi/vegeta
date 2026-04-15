'use client';

import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Graticule } from 'react-simple-maps';
import { useGeoData } from '@/hooks/useGeoData';
import { useCountryFillColor, useMapTheme, useActions } from '@/hooks/useTerritoryStore';
import MapLegend from './MapLegend';
import MapTooltip from './MapTooltip';
import AssignPopover from './AssignPopover';
import { WorldAccountLayer } from './AccountLayer';

interface WorldMapViewProps {
  onDrillDown: (iso2: string, name: string) => void;
}

interface PopoverState {
  entityCode: string;
  entityName: string;
  position: { x: number; y: number };
}

// geo from Geographies has svgPath set + all CountryFeature fields spread onto it
interface EnrichedGeo {
  rsmKey: string;
  svgPath: string;
  iso2: string;
  id: string;
  name: string;
  [key: string]: unknown;
}

const CountryGeo = memo(function CountryGeo({
  geo,
  onClickCountry,
  unassignedFill,
  unassignedHover,
  hoverOpacity,
  countryStroke,
  countryStrokeWidth,
  transition,
}: {
  geo: EnrichedGeo;
  onClickCountry: (entityCode: string, name: string, x: number, y: number) => void;
  unassignedFill: string;
  unassignedHover: string;
  hoverOpacity: number;
  countryStroke: string;
  countryStrokeWidth: number;
  transition: string;
}) {
  const entityCode = geo.iso2 || geo.id;
  const fill = useCountryFillColor(entityCode);
  const { setHoveredEntityCode, setHoveredEntityIso } = useActions();
  const isUnassigned = fill === unassignedFill;

  return (
    <Geography
      geography={geo as unknown as import('react-simple-maps').GeographyFeature}
      fill={fill}
      stroke={countryStroke}
      strokeWidth={countryStrokeWidth}
      style={{
        default: { outline: 'none', cursor: 'pointer', transition },
        hover:   { outline: 'none', fill: isUnassigned ? unassignedHover : fill, opacity: hoverOpacity },
        pressed: { outline: 'none' },
      }}
      onMouseEnter={() => { setHoveredEntityCode(geo.name); setHoveredEntityIso(entityCode); }}
      onMouseLeave={() => { setHoveredEntityCode(null); setHoveredEntityIso(null); }}
      onClick={(e: React.MouseEvent) => onClickCountry(entityCode, geo.name, e.clientX, e.clientY)}
      role="button"
      aria-label={geo.name}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const r = e.currentTarget.getBoundingClientRect();
          onClickCountry(entityCode, geo.name, r.left + r.width / 2, r.top + r.height / 2);
        }
      }}
    />
  );
});

export default function WorldMapView({ onDrillDown }: WorldMapViewProps) {
  const countries = useGeoData();
  const theme = useMapTheme();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [center, setCenter] = useState<[number, number]>([0, 20]);

  // Stable reference — Geographies re-runs its effect whenever this changes
  const featureCollection = useMemo(
    () => ({ type: 'FeatureCollection' as const, features: countries }),
    [countries],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleClickCountry = useCallback(
    (entityCode: string, name: string, x: number, y: number) => {
      setPopover({ entityCode, entityName: name, position: { x, y } });
    },
    [],
  );

  const isZoomed = zoom > 1.05;

  return (
    <div
      className="absolute inset-0"
      style={{ background: theme.sphereFill, cursor: isZoomed ? 'grab' : 'default' }}
      onMouseMove={handleMouseMove}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 160 }}
        width={980}
        height={551}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          center={center}
          zoom={zoom}
          minZoom={1}
          maxZoom={8}
          // filterZoomEvent exists at runtime but is missing from the bundled types
          {...({ filterZoomEvent: (evt: Event) => {
            if (evt.type === 'wheel' || evt.type === 'dblclick') return true;
            return zoomRef.current > 1.05;
          }} as Record<string, unknown>)}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCenter(coordinates as [number, number]);
            setZoom(z);
          }}
        >
          {theme.graticuleStroke && (
            <Graticule stroke={theme.graticuleStroke} strokeWidth={theme.graticuleWidth} step={[20, 20]} />
          )}
          <Geographies geography={featureCollection}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <CountryGeo
                  key={geo.rsmKey}
                  geo={geo as unknown as EnrichedGeo}
                  onClickCountry={handleClickCountry}
                  unassignedFill={theme.unassignedFill}
                  unassignedHover={theme.unassignedHover}
                  hoverOpacity={theme.hoverOpacity}
                  countryStroke={theme.countryStroke}
                  countryStrokeWidth={theme.countryStrokeWidth}
                  transition={theme.transition}
                />
              ))
            }
          </Geographies>
          <WorldAccountLayer zoom={zoom} />
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-1">
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.5, 8))}
          className={theme.zoomBtnClass}
          aria-label="Zoom in"
        >+</button>
        <button
          onClick={() => setZoom((z) => Math.max(z / 1.5, 1))}
          className={theme.zoomBtnClass}
          aria-label="Zoom out"
        >−</button>
        <button
          onClick={() => { setZoom(1); setCenter([0, 20]); }}
          className={theme.zoomBtnClass}
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
