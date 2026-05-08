'use client';

import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Graticule, type GeographyFeature } from 'react-simple-maps';
import type { GeoProjection } from 'd3-geo';
import { geoCentroid } from 'd3-geo';
import { useGeoData } from '@/hooks/useGeoData';
import {
  useChoroplethFillColor, useMapTheme, useActions, useActivePaintGeoId, useActiveEraser,
  usePinnedEntityIso, useEntityHighlight, useShowLabels,
  useActiveSelect, useSelectedEntityCodes, useMapZoomCommand,
} from '@/hooks/useTerritoryStore';
import { useChoroplethScale } from '@/hooks/useChoroplethScale';
import MapInfoRail from './MapInfoRail';
import MapTooltip from './MapTooltip';
import { WorldAccountLayer } from './AccountLayer';
import MapLabels from './MapLabels';

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
  geo, onClickCountry, onDoubleClickFeature, isSelected, scaleMax, choroplethActive,
  unassignedFill, unassignedHover, hoverOpacity, countryStroke, countryStrokeWidth, transition,
  isTabFocus,
}: {
  geo: EnrichedGeo;
  onClickCountry: (entityCode: string, name: string, e: React.MouseEvent) => void;
  onDoubleClickFeature: (entityCode: string) => void;
  isSelected: boolean;
  scaleMax: number;
  choroplethActive: boolean;
  unassignedFill: string;
  unassignedHover: string;
  hoverOpacity: number;
  countryStroke: string;
  countryStrokeWidth: number;
  transition: string;
  isTabFocus: boolean;
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
      stroke={isSelected ? 'var(--color-brand)' : isHighlighted ? 'var(--color-brand)' : isPinned ? 'var(--color-brand)' : countryStroke}
      strokeWidth={isSelected ? 2 : isHighlighted ? 2 : isPinned ? 1.5 : countryStrokeWidth}
      className="map-region-path"
      style={{
        default: {
          cursor: 'pointer',
          transition,
          ...(isSelected ? { fill: `color-mix(in srgb, var(--color-brand) 4%, ${fill})` } : {}),
        },
        hover:   { fill: isUnassigned ? unassignedHover : fill, opacity: hoverOpacity },
        pressed: {},
      }}
      onMouseEnter={() => { setHoveredEntityCode(geo.name); setHoveredEntityIso(entityCode); }}
      onMouseLeave={() => { setHoveredEntityCode(null); setHoveredEntityIso(null); }}
      onClick={(e: React.MouseEvent<SVGPathElement>) => onClickCountry(entityCode, geo.name, e)}
      onDoubleClick={(e: React.MouseEvent<SVGPathElement>) => {
        e.stopPropagation(); // prevent ZoomableGroup's own dblclick zoom from also firing
        onDoubleClickFeature(entityCode);
      }}
      role="button"
      aria-label={geo.name}
      tabIndex={isTabFocus ? 0 : -1}
      onKeyDown={(e: React.KeyboardEvent<SVGPathElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClickCountry(entityCode, geo.name, { metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey } as React.MouseEvent);
        }
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
  const selectActive = useActiveSelect();
  const selectedCodes = useSelectedEntityCodes();
  const { setSelection, addToSelection, toggleSelection } = useActions();
  const showLabels = useShowLabels();
  const { active: choroplethActive, scale } = useChoroplethScale('world');
  const scaleMax = scale?.max ?? 0;
  const { togglePinnedEntityIso, setPinnedEntityIso, clearHighlight } = useActions();
  const zoomCommand = useMapZoomCommand();
  const { setMapZoomCommand } = useActions();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [center, setCenter] = useState<[number, number]>([0, 20]);
  const centerRef = useRef<[number, number]>(center);
  useEffect(() => { centerRef.current = center; }, [center]);
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number; shift: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const projectionRef = useRef<GeoProjection | null>(null);
  const geographiesRef = useRef<GeographyFeature[]>([]);
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

  useEffect(() => {
    if (!zoomCommand) return;
    if (zoomCommand.kind === 'panBy') {
      // ~1 viewBox px ≈ (360 / (980 * zoom)) deg of longitude near equator.
      const [lng, lat] = centerRef.current;
      const z = zoomRef.current;
      const dLng = (zoomCommand.dx * 360) / (980 * z);
      const dLat = (zoomCommand.dy * 180) / (551 * z);
      setCenter([lng - dLng, lat + dLat]);
    } else if (zoomCommand.kind === 'zoomBy') {
      setZoom((z) => Math.min(Math.max(z * zoomCommand.factor, 1), 8));
    } else if (zoomCommand.kind === 'reset') {
      setZoom(1);
      setCenter([0, 20]);
    }
    setMapZoomCommand(null);
  }, [zoomCommand, setMapZoomCommand]);

  const firstFocusableCode = useMemo(() => {
    const codes = countries
      .map((c) => (c as unknown as EnrichedGeo).iso2 || (c as unknown as EnrichedGeo).id)
      .sort();
    return codes[0] ?? null;
  }, [countries]);

  // Stable reference — Geographies re-runs its effect whenever this changes
  const featureCollection = useMemo(
    () => ({ type: 'FeatureCollection' as const, features: countries }),
    [countries],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleClickCountry = useCallback(
    (entityCode: string, name: string, e: React.MouseEvent) => {
      if (selectActive) {
        if (e.metaKey || e.ctrlKey) toggleSelection(entityCode);
        else if (e.shiftKey) addToSelection([entityCode]);
        else setSelection([entityCode]);
        return;
      }
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
    [
      selectActive, toggleSelection, addToSelection, setSelection,
      eraserActive, clearCountryAssignment, activePaintId, assignCountryToGeo,
      togglePinnedEntityIso, onDrillDown,
    ],
  );

  const handleDoubleClickFeature = useCallback((entityCode: string) => {
    const geo = geographiesRef.current.find((g) => {
      const enriched = g as unknown as EnrichedGeo;
      return (enriched.iso2 || enriched.id) === entityCode;
    });
    if (!geo) return;
    const [lng, lat] = geoCentroid(geo as unknown as GeoJSON.Feature);
    setCenter([lng, lat]);
    setZoom((z) => Math.min(z * 2.5, 8));
  }, []);

  const handleLassoMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectActive) return;
    if (e.target !== e.currentTarget) {
      // Click started on a region — let the region's own click handler run.
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setLasso({
      x0: e.clientX - rect.left,
      y0: e.clientY - rect.top,
      x1: e.clientX - rect.left,
      y1: e.clientY - rect.top,
      shift: e.shiftKey,
    });
  }, [selectActive]);

  const handleLassoMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!lasso) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setLasso({ ...lasso, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
  }, [lasso]);

  const handleLassoMouseUp = useCallback(() => {
    if (!lasso) return;
    const proj = projectionRef.current;
    const geos = geographiesRef.current;
    const container = containerRef.current;
    const svg = container?.querySelector('svg') as SVGSVGElement | null;
    if (proj && geos.length && svg) {
      const x0 = Math.min(lasso.x0, lasso.x1);
      const y0 = Math.min(lasso.y0, lasso.y1);
      const x1 = Math.max(lasso.x0, lasso.x1);
      const y1 = Math.max(lasso.y0, lasso.y1);
      // Convert pixel coords (relative to outer container) into SVG viewBox coords (980x551).
      const svgRect = svg.getBoundingClientRect();
      const sx = 980 / svgRect.width;
      const sy = 551 / svgRect.height;
      const mx0 = x0 * sx, my0 = y0 * sy, mx1 = x1 * sx, my1 = y1 * sy;
      const hits: string[] = [];
      for (const geo of geos) {
        const [lng, lat] = geoCentroid(geo as unknown as GeoJSON.Feature);
        const projected = (proj as unknown as (coords: [number, number]) => [number, number] | null)([lng, lat]);
        if (!projected) continue;
        const [cx, cy] = projected;
        if (cx >= mx0 && cx <= mx1 && cy >= my0 && cy <= my1) {
          const enriched = geo as unknown as EnrichedGeo;
          hits.push(enriched.iso2 || enriched.id);
        }
      }
      if (hits.length) {
        if (lasso.shift) addToSelection(hits);
        else setSelection(hits);
      } else if (!lasso.shift) {
        setSelection([]);
      }
    }
    setLasso(null);
  }, [lasso, addToSelection, setSelection]);

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setPinnedEntityIso(null);
  }, [setPinnedEntityIso]);

  const isZoomed = zoom > 1.05;

  const cursor =
    activePaintId || eraserActive ? 'crosshair' :
    selectActive ? 'cell' :
    isZoomed ? 'grab' : 'default';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ background: theme.sphereFill, cursor }}
      onMouseMove={(e) => { handleMouseMove(e); handleLassoMouseMove(e); }}
      onMouseDown={handleLassoMouseDown}
      onMouseUp={handleLassoMouseUp}
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
            // Wheel events include trackpad pinch (delivered as wheel + ctrlKey). Always allow.
            if (evt.type === 'wheel') return true;
            if (evt.type === 'dblclick') return true;
            // Mousedown-drag pan only when zoomed in, to keep clicks at zoom 1 from being eaten by drag.
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
            {(args) => {
              const { geographies, projection } = args as unknown as { geographies: GeographyFeature[]; projection: GeoProjection };
              projectionRef.current = projection;
              geographiesRef.current = geographies;
              return (
                <>
                  {geographies.map((geo) => {
                    const entityCode = (geo as unknown as EnrichedGeo).iso2 || (geo as unknown as EnrichedGeo).id;
                    return (
                      <CountryGeo
                        key={geo.rsmKey}
                        geo={geo as unknown as EnrichedGeo}
                        onClickCountry={handleClickCountry}
                        onDoubleClickFeature={handleDoubleClickFeature}
                        isSelected={selectedCodes.includes(entityCode)}
                        scaleMax={scaleMax}
                        choroplethActive={choroplethActive}
                        unassignedFill={theme.unassignedFill}
                        unassignedHover={theme.unassignedHover}
                        hoverOpacity={theme.hoverOpacity}
                        countryStroke={theme.countryStroke}
                        countryStrokeWidth={theme.countryStrokeWidth}
                        transition={theme.transition}
                        isTabFocus={entityCode === firstFocusableCode}
                      />
                    );
                  })}
                  {showLabels && (
                    <MapLabels
                      geographies={geographies as unknown as { rsmKey: string; name: string; geometry: unknown }[]}
                      projection={projection}
                      zoom={zoom}
                    />
                  )}
                </>
              );
            }}
          </Geographies>
          <WorldAccountLayer zoom={zoom} />
        </ZoomableGroup>
      </ComposableMap>

      {lasso && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <rect
            x={Math.min(lasso.x0, lasso.x1)}
            y={Math.min(lasso.y0, lasso.y1)}
            width={Math.abs(lasso.x1 - lasso.x0)}
            height={Math.abs(lasso.y1 - lasso.y0)}
            fill="var(--color-brand)"
            fillOpacity={0.06}
            stroke="var(--color-brand)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        </svg>
      )}

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
