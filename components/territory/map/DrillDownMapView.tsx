'use client';

import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Graticule } from 'react-simple-maps';
import { geoMercator } from 'd3-geo';
import { useCountryStates } from '@/hooks/useCountryStates';
import type { StateFeature } from '@/hooks/useCountryStates';
import { useCountryFillColor, useMapTheme, useActions } from '@/hooks/useTerritoryStore';
import { DrillDownAccountLayer } from './AccountLayer';
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
  unassignedFill,
  unassignedHover,
  hoverOpacity,
  stateStroke,
  stateStrokeWidth,
  transition,
}: {
  geo: EnrichedStateGeo;
  onClickState: (entityCode: string, name: string, x: number, y: number) => void;
  unassignedFill: string;
  unassignedHover: string;
  hoverOpacity: number;
  stateStroke: string;
  stateStrokeWidth: number;
  transition: string;
}) {
  const entityCode = `${geo.iso2}:${geo.id}`;
  const fill = useCountryFillColor(entityCode);
  const { setHoveredEntityCode, setHoveredEntityIso } = useActions();
  const isUnassigned = fill === unassignedFill;

  return (
    <Geography
      geography={geo as unknown as import('react-simple-maps').GeographyFeature}
      fill={fill}
      stroke={stateStroke}
      strokeWidth={stateStrokeWidth}
      style={{
        default: { outline: 'none', cursor: 'pointer', transition },
        hover:   { outline: 'none', fill: isUnassigned ? unassignedHover : fill, opacity: hoverOpacity },
        pressed: { outline: 'none' },
      }}
      onMouseEnter={() => { setHoveredEntityCode(`${geo.name} (${geo.id})`); setHoveredEntityIso(entityCode); }}
      onMouseLeave={() => { setHoveredEntityCode(null); setHoveredEntityIso(null); }}
      onClick={(e: React.MouseEvent) => onClickState(entityCode, geo.name, e.clientX, e.clientY)}
      role="button"
      aria-label={geo.name}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const r = e.currentTarget.getBoundingClientRect();
          onClickState(entityCode, geo.name, r.left + r.width / 2, r.top + r.height / 2);
        }
      }}
    />
  );
});

const MAP_W = 980;
const MAP_H = 551;

// Fit a geoMercator projection to the features and return the geographic
// center and zoom factor that fills the viewport with 10% padding.
function fitFeatures(features: StateFeature[]): { center: [number, number]; zoom: number } {
  if (features.length === 0) return { center: [0, 20], zoom: 1 };
  const baseScale = 140;
  const collection = { type: 'FeatureCollection' as const, features };
  // fitSize with 80% of the viewport leaves visible margin around the country
  const fitted = geoMercator().fitSize([MAP_W * 0.8, MAP_H * 0.8], collection as Parameters<ReturnType<typeof geoMercator>['fitSize']>[1]);
  const fittedCenter = fitted.invert!([MAP_W / 2, MAP_H / 2]) as [number, number];
  return { center: fittedCenter, zoom: fitted.scale() / baseScale };
}

const isAlbersUsa = (iso2: string) => iso2 === 'US';

export default function DrillDownMapView({ countryIso2, countryName }: DrillDownMapViewProps) {
  const { features, loading, error } = useCountryStates(countryIso2);
  const theme = useMapTheme();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const useAlbers = isAlbersUsa(countryIso2);

  // Derive center + zoom from features whenever the country changes (not used for AlbersUSA)
  const { center, zoom: initialZoom } = useMemo(
    () => (useAlbers ? { center: [-96, 38] as [number, number], zoom: 1 } : fitFeatures(features)),
    [features, useAlbers],
  );
  const [prevInitialZoom, setPrevInitialZoom] = useState(initialZoom);
  const [prevCenter, setPrevCenter] = useState(center);
  const [zoom, setZoom] = useState(initialZoom);
  const [currentCenter, setCurrentCenter] = useState<[number, number]>(center);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
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
    (entityCode: string, name: string, x: number, y: number) => {
      setPopover({ entityCode, entityName: name, position: { x, y } });
    },
    [],
  );

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.bg }}>
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
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.bg }}>
        <div className="text-red-500">Failed to load states: {error}</div>
      </div>
    );
  }

  if (features.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: theme.bg }}>
        <p className="text-zinc-500">No state/province data available for {countryName}.</p>
      </div>
    );
  }

  const isZoomed = zoom > initialZoom * 1.05;

  return (
    <div
      className="absolute inset-0"
      style={{ background: useAlbers ? theme.bg : theme.sphereFill, cursor: isZoomed ? 'grab' : 'default' }}
      onMouseMove={handleMouseMove}
    >
      <ComposableMap
        projection={useAlbers ? 'geoAlbersUsa' : 'geoMercator'}
        projectionConfig={useAlbers ? { scale: 900 } : undefined}
        width={980}
        height={551}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          center={currentCenter}
          zoom={zoom}
          minZoom={initialZoom}
          maxZoom={80}
          // filterZoomEvent exists at runtime but is missing from the bundled types
          {...({ filterZoomEvent: (evt: Event) => {
            if (evt.type === 'wheel' || evt.type === 'dblclick') return true;
            return zoomRef.current > initialZoom * 1.05;
          }} as Record<string, unknown>)}
          onMoveEnd={({ coordinates, zoom: z }) => {
            setCurrentCenter(coordinates as [number, number]);
            setZoom(z);
          }}
        >
          {!useAlbers && theme.graticuleStroke && (
            <Graticule stroke={theme.graticuleStroke} strokeWidth={theme.graticuleWidth} step={[20, 20]} />
          )}
          <Geographies geography={featureCollection}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <StateGeo
                  key={geo.rsmKey}
                  geo={geo as unknown as EnrichedStateGeo}
                  onClickState={handleClickState}
                  unassignedFill={theme.unassignedFill}
                  unassignedHover={theme.unassignedHover}
                  hoverOpacity={theme.hoverOpacity}
                  stateStroke={theme.stateStroke}
                  stateStrokeWidth={theme.stateStrokeWidth}
                  transition={theme.transition}
                />
              ))
            }
          </Geographies>
          <DrillDownAccountLayer countryIso2={countryIso2} features={features} zoom={zoom} />
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div className="absolute right-4 top-4 flex flex-col gap-1">
        <button onClick={() => setZoom((z) => Math.min(z * 1.5, 80))}
          className={theme.zoomBtnClass}
          aria-label="Zoom in">+</button>
        <button onClick={() => setZoom((z) => Math.max(z / 1.5, initialZoom))}
          className={theme.zoomBtnClass}
          aria-label="Zoom out">−</button>
        <button onClick={() => { setZoom(initialZoom); setCurrentCenter(center); }}
          className={theme.zoomBtnClass}
          aria-label="Reset zoom">⊙</button>
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
