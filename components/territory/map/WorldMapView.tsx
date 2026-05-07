'use client';

import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Graticule } from 'react-simple-maps';
import { useGeoData } from '@/hooks/useGeoData';
import {
  useChoroplethFillColor, useMapTheme, useActions, useActivePaintGeoId, useActiveEraser,
  usePinnedEntityIso, useEntityHighlight,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import MapInfoRail from './MapInfoRail';
import MapTooltip from './MapTooltip';
import { WorldAccountLayer } from './AccountLayer';

interface WorldMapViewProps {
  onDrillDown: (iso2: string, name: string) => void;
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
  geo, onClickCountry, scaleMax, choroplethActive,
  unassignedFill, unassignedHover, hoverOpacity, countryStroke, countryStrokeWidth, transition,
}: {
  geo: EnrichedGeo;
  onClickCountry: (entityCode: string, name: string) => void;
  scaleMax: number;
  choroplethActive: boolean;
  unassignedFill: string;
  unassignedHover: string;
  hoverOpacity: number;
  countryStroke: string;
  countryStrokeWidth: number;
  transition: string;
}) {
  const entityCode = geo.iso2 || geo.id;
  const fill = useChoroplethFillColor(entityCode, scaleMax, choroplethActive);
  const pinnedIso = usePinnedEntityIso();
  const isPinned = pinnedIso === entityCode;
  const isHighlighted = useEntityHighlight(entityCode);
  const { setHoveredEntityCode, setHoveredEntityIso } = useActions();
  const isUnassigned = fill === unassignedFill;

  return (
    <Geography
      geography={geo as unknown as import('react-simple-maps').GeographyFeature}
      fill={fill}
      stroke={isHighlighted ? 'var(--color-brand)' : isPinned ? 'var(--color-brand)' : countryStroke}
      strokeWidth={isHighlighted ? 2 : isPinned ? 1.5 : countryStrokeWidth}
      style={{
        default: { outline: 'none', cursor: 'pointer', transition },
        hover:   { outline: 'none', fill: isUnassigned ? unassignedHover : fill, opacity: hoverOpacity },
        pressed: { outline: 'none' },
      }}
      onMouseEnter={() => { setHoveredEntityCode(geo.name); setHoveredEntityIso(entityCode); }}
      onMouseLeave={() => { setHoveredEntityCode(null); setHoveredEntityIso(null); }}
      onClick={() => onClickCountry(entityCode, geo.name)}
      role="button"
      aria-label={geo.name}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') onClickCountry(entityCode, geo.name);
      }}
    />
  );
});

export default function WorldMapView({ onDrillDown }: WorldMapViewProps) {
  const countries = useGeoData();
  const theme = useMapTheme();
  const activePaintId = useActivePaintGeoId();
  const eraserActive = useActiveEraser();
  const { assignCountryToGeo, clearCountryAssignment } = useActions();
  const { active: choroplethActive, scale } = useChoroplethScale('world');
  const scaleMax = scale?.max ?? 0;
  const { togglePinnedEntityIso, setPinnedEntityIso, clearHighlight } = useActions();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearHighlight();
        setPinnedEntityIso(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearHighlight, setPinnedEntityIso]);
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
    (entityCode: string, name: string) => {
      if (eraserActive) {
        clearCountryAssignment(entityCode);
        return;
      }
      if (activePaintId) {
        assignCountryToGeo(activePaintId, entityCode);
        return;
      }
      togglePinnedEntityIso(entityCode);
      onDrillDown(entityCode, name);
    },
    [eraserActive, clearCountryAssignment, activePaintId, assignCountryToGeo, togglePinnedEntityIso, onDrillDown],
  );

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setPinnedEntityIso(null);
  }, [setPinnedEntityIso]);

  const isZoomed = zoom > 1.05;

  const cursor = activePaintId || eraserActive ? 'crosshair' : isZoomed ? 'grab' : 'default';

  return (
    <div
      className="absolute inset-0"
      style={{ background: theme.sphereFill, cursor }}
      onMouseMove={handleMouseMove}
      onClick={handleBackgroundClick}
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
                  scaleMax={scaleMax}
                  choroplethActive={choroplethActive}
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

      {/* Zoom controls — single rounded panel with internal hairlines */}
      <div className="absolute right-4 top-4 z-10 flex flex-col overflow-hidden rounded-xl border border-hairline bg-panel/85 shadow-md backdrop-blur-md divide-y divide-hairline">
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.5, 8))}
          className={theme.zoomBtnClass}
          aria-label="Zoom in"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z / 1.5, 1))}
          className={theme.zoomBtnClass}
          aria-label="Zoom out"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            <path d="M3 8h10" />
          </svg>
        </button>
        <button
          onClick={() => { setZoom(1); setCenter([0, 20]); }}
          className={theme.zoomBtnClass}
          aria-label="Reset zoom"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="5" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      <MapInfoRail view="world" />
      <MapTooltip mousePos={mousePos} />
    </div>
  );
}
