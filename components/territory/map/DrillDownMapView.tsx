'use client';

import { useState, useCallback, useMemo, memo, useEffect } from 'react';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Graticule } from 'react-simple-maps';
import { geoMercator, geoPath } from 'd3-geo';
import { useCountryStates } from '@/hooks/useCountryStates';
import type { StateFeature } from '@/hooks/useCountryStates';
import {
  useChoroplethFillColor, useMapTheme, useActions, useActivePaintGeoId, useActiveEraser,
  usePinnedEntityIso, useEntityHighlight,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import { DrillDownAccountLayer } from './AccountLayer';
import MapInfoRail from './MapInfoRail';
import MapTooltip from './MapTooltip';

interface DrillDownMapViewProps {
  countryIso2: string;
  countryName: string;
}

interface EnrichedStateGeo {
  rsmKey: string;
  svgPath: string;
  iso2: string;
  id: string;
  name: string;
  [key: string]: unknown;
}

const StateGeo = memo(function StateGeo({
  geo,
  onClickState,
  scaleMax,
  choroplethActive,
  unassignedFill,
  unassignedHover,
  hoverOpacity,
  stateStroke,
  stateStrokeWidth,
  transition,
}: {
  geo: EnrichedStateGeo;
  onClickState: (entityCode: string) => void;
  scaleMax: number;
  choroplethActive: boolean;
  unassignedFill: string;
  unassignedHover: string;
  hoverOpacity: number;
  stateStroke: string;
  stateStrokeWidth: number;
  transition: string;
}) {
  const entityCode = `${geo.iso2}:${geo.id}`;
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
      stroke={isHighlighted ? 'var(--color-brand)' : isPinned ? 'var(--color-brand)' : stateStroke}
      strokeWidth={isHighlighted ? 2 : isPinned ? 1.5 : stateStrokeWidth}
      style={{
        default: { outline: 'none', cursor: 'pointer', transition },
        hover:   { outline: 'none', fill: isUnassigned ? unassignedHover : fill, opacity: hoverOpacity },
        pressed: { outline: 'none' },
      }}
      onMouseEnter={() => { setHoveredEntityCode(`${geo.name} (${geo.id})`); setHoveredEntityIso(entityCode); }}
      onMouseLeave={() => { setHoveredEntityCode(null); setHoveredEntityIso(null); }}
      onClick={() => onClickState(entityCode)}
      role="button"
      aria-label={geo.name}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') onClickState(entityCode);
      }}
    />
  );
});

const MAP_W = 980;
const MAP_H = 551;

// Fit a geoMercator projection to the features by width; return the geographic
// center, zoom, and the SVG height needed so no feature is clipped vertically.
function fitFeatures(features: StateFeature[]): { center: [number, number]; zoom: number; mapHeight: number } {
  if (features.length === 0) return { center: [0, 20], zoom: 1, mapHeight: MAP_H };
  const baseScale = 140;
  const collection = { type: 'FeatureCollection' as const, features };
  const fitted = geoMercator().fitWidth(MAP_W * 0.98, collection as Parameters<ReturnType<typeof geoMercator>['fitWidth']>[1]);
  const [[x0, y0], [x1, y1]] = geoPath(fitted).bounds(collection as Parameters<ReturnType<typeof geoPath>['bounds']>[0]);
  const mapHeight = Math.max(MAP_H, (y1 - y0) / 0.98);
  const fittedCenter = fitted.invert!([(x0 + x1) / 2, (y0 + y1) / 2]) as [number, number];
  return { center: fittedCenter, zoom: (fitted.scale() / baseScale) * 0.8, mapHeight };
}

const isAlbersUsa = (iso2: string) => iso2 === 'US';
const useSolidBackdrop = (iso2: string) => iso2 === 'US' || iso2 === 'CA';

export default function DrillDownMapView({ countryIso2, countryName }: DrillDownMapViewProps) {
  const { features, loading, error } = useCountryStates(countryIso2);
  const theme = useMapTheme();
  const activePaintId = useActivePaintGeoId();
  const eraserActive = useActiveEraser();
  const { assignStateToGeo, clearStateAssignment } = useActions();
  const { active: choroplethActive, scale } = useChoroplethScale('drilldown', countryIso2);
  const scaleMax = scale?.max ?? 0;
  const { togglePinnedEntityIso, setPinnedEntityIso, clearHighlight } = useActions();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
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
  const useAlbers = isAlbersUsa(countryIso2);
  const solidBackdrop = useSolidBackdrop(countryIso2);

  // Derive center + zoom from features whenever the country changes (not used for AlbersUSA)
  const { center, zoom: initialZoom, mapHeight } = useMemo(
    () => (useAlbers
      ? { center: [-96, 38] as [number, number], zoom: 1, mapHeight: MAP_H }
      : fitFeatures(features)),
    [features, useAlbers],
  );
  const [prevInitialZoom, setPrevInitialZoom] = useState(initialZoom);
  const [prevCenter, setPrevCenter] = useState(center);
  const [zoom, setZoom] = useState(initialZoom);
  const [currentCenter, setCurrentCenter] = useState<[number, number]>(center);
  // getDerivedStateFromProps: reset zoom + center when country/features change
  if (prevInitialZoom !== initialZoom || prevCenter[0] !== center[0] || prevCenter[1] !== center[1]) {
    setPrevInitialZoom(initialZoom);
    setPrevCenter(center);
    setZoom(initialZoom);
    setCurrentCenter(center);
  }

  // Stable reference for Geographies
  const featureCollection = useMemo(
    () => ({ type: 'FeatureCollection' as const, features }),
    [features],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleClickState = useCallback(
    (entityCode: string) => {
      if (eraserActive) {
        clearStateAssignment(entityCode);
        return;
      }
      if (activePaintId) {
        assignStateToGeo(activePaintId, entityCode);
        return;
      }
      togglePinnedEntityIso(entityCode);
    },
    [eraserActive, clearStateAssignment, activePaintId, assignStateToGeo, togglePinnedEntityIso],
  );

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setPinnedEntityIso(null);
  }, [setPinnedEntityIso]);

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.bg }}>
        <div className="flex items-center gap-2 text-ink-muted">
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
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.bg }}>
        <div className="text-rose-500">Failed to load states: {error}</div>
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.bg }}>
        <p className="text-ink-muted">No state/province data available for {countryName}.</p>
      </div>
    );
  }

  const isZoomed = zoom > initialZoom * 1.05;
  const cursor = activePaintId || eraserActive ? 'crosshair' : isZoomed ? 'grab' : 'default';

  return (
    <div
      className="absolute inset-0"
      style={{ background: solidBackdrop ? theme.bg : theme.sphereFill, cursor }}
      onMouseMove={handleMouseMove}
      onClick={handleBackgroundClick}
    >
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
      <ComposableMap
        projection={useAlbers ? 'geoAlbersUsa' : 'geoMercator'}
        projectionConfig={useAlbers ? { scale: 900 } : undefined}
        width={MAP_W}
        height={mapHeight}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <ZoomableGroup
          center={currentCenter}
          zoom={zoom}
          minZoom={initialZoom}
          maxZoom={80}
          translateExtent={[
          [-MAP_W, -mapHeight],
          [MAP_W * 2, mapHeight * 2]
          ]}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCurrentCenter(coordinates as [number, number]);
            setZoom(z);
          }}
        >
          {!solidBackdrop && theme.graticuleStroke && (
            <Graticule stroke={theme.graticuleStroke} strokeWidth={theme.graticuleWidth} step={[20, 20]} />
          )}
          <Geographies geography={featureCollection}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <StateGeo
                  key={geo.rsmKey}
                  geo={geo as unknown as EnrichedStateGeo}
                  onClickState={handleClickState}
                  scaleMax={scaleMax}
                  choroplethActive={choroplethActive}
                  unassignedFill={theme.unassignedFill}
                  unassignedHover={theme.unassignedHover}
                  hoverOpacity={theme.hoverOpacity}
                  stateStroke={theme.stateStroke}
                  stateStrokeWidth={theme.stateStrokeWidth * 0.25}
                  transition={theme.transition}
                />
              ))
            }
          </Geographies>
          <DrillDownAccountLayer countryIso2={countryIso2} features={features} zoom={zoom} />
        </ZoomableGroup>
      </ComposableMap>
      </div>

      {/* Zoom controls — single rounded panel with internal hairlines */}
      <div className="absolute right-4 top-4 z-10 flex flex-col overflow-hidden rounded-xl border border-hairline bg-panel/85 shadow-md backdrop-blur-md divide-y divide-hairline">
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.5, 80))}
          className={theme.zoomBtnClass}
          aria-label="Zoom in"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z / 1.5, initialZoom))}
          className={theme.zoomBtnClass}
          aria-label="Zoom out"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            <path d="M3 8h10" />
          </svg>
        </button>
        <button
          onClick={() => { setZoom(initialZoom); setCurrentCenter(center); }}
          className={theme.zoomBtnClass}
          aria-label="Reset zoom"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="5" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      <MapInfoRail view="drilldown" drilldownIso2={countryIso2} />
      <MapTooltip mousePos={mousePos} />
    </div>
  );
}
