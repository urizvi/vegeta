'use client';

import { memo, useMemo } from 'react';
import { Marker } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import {
  useAccounts, useAccountOrder, useShowAccounts,
  useCountryFillColor, useMapTheme, useMapAccountMetric, useFieldDefs,
  useAccountStatsByEntity,
} from '@/hooks/useTerritoryStore';
import { getEntityMetricVal } from '@/lib/territoryIndex';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';
import { formatFieldValue } from '@/lib/accountFields';
import type { StateFeature } from '@/hooks/useCountryStates';

// ── Shared helpers ────────────────────────────────────────────────────────────

const UNASSIGNED_COLOR = '#94a3b8'; // slate-400 — quieter than the old red on the paper-quiet ocean

/** Radius [4, 18] normalised to the max value across all countries. */
function scaledRadius(val: number, maxVal: number): number {
  if (maxVal <= 0 || val <= 0) return 4;
  return 4 + (Math.log(val + 1) / Math.log(maxVal + 1)) * 14;
}

// ── World map — one bubble per country ───────────────────────────────────────

interface WorldAccountLayerProps { zoom: number }

const CountryBubble = memo(function CountryBubble({
  iso2, scaledR, label, lat, lng, zoom,
}: {
  iso2: string; scaledR: number; label: string; lat: number; lng: number; zoom: number;
}) {
  const teamColor = useCountryFillColor(iso2);
  const theme = useMapTheme();
  const isUnassigned = teamColor === theme.unassignedFill;
  const fill = isUnassigned ? UNASSIGNED_COLOR : teamColor;
  const r = scaledR / zoom;
  const fontSize = 9 / zoom;

  return (
    <Marker coordinates={[lng, lat]}>
      {/* Soft halo for legibility on the paper-quiet ocean */}
      <circle
        r={r + 1.2 / zoom}
        fill="#ffffff"
        fillOpacity={0.85}
        stroke="rgba(15,23,42,0.10)"
        strokeWidth={0.5 / zoom}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        r={r}
        fill={fill}
        fillOpacity={0.92}
        stroke="#ffffff"
        strokeWidth={0.6 / zoom}
        style={{ pointerEvents: 'none' }}
      />
      {label && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="700"
          fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {label}
        </text>
      )}
    </Marker>
  );
});

export const WorldAccountLayer = memo(function WorldAccountLayer({ zoom }: WorldAccountLayerProps) {
  const order     = useAccountOrder();
  const show      = useShowAccounts();
  const metric    = useMapAccountMetric();
  const fieldDefs = useFieldDefs();
  const stats     = useAccountStatsByEntity();

  const { byCountry, maxVal } = useMemo(() => {
    const map: Record<string, number> = {};
    let max = 1;
    for (const key in stats) {
      if (key.includes(':')) continue; // skip state-level buckets
      const val = getEntityMetricVal(stats[key], metric);
      map[key] = val;
      if (val > max) max = val;
    }
    return { byCountry: map, maxVal: max };
  }, [stats, metric]);

  const fieldDef = fieldDefs.find((f) => f.id === metric);

  if (!show || order.length === 0) return null;

  return (
    <>
      {Object.entries(byCountry).map(([iso2, val]) => {
        const centroid = COUNTRY_CENTROIDS[iso2];
        if (!centroid) return null;
        const [lat, lng] = centroid;
        const label = metric === 'count'
          ? (val > 0 ? String(val) : '')
          : (fieldDef ? formatFieldValue(val, fieldDef) : String(val));
        return (
          <CountryBubble
            key={iso2}
            iso2={iso2}
            scaledR={scaledRadius(val, maxVal)}
            label={label}
            lat={lat}
            lng={lng}
            zoom={zoom}
          />
        );
      })}
    </>
  );
});

// ── Drill-down — individual dot per account at state centroid ─────────────────

interface DrillDownAccountLayerProps {
  countryIso2: string;
  features: StateFeature[];
  zoom: number;
}

const StateDot = memo(function StateDot({
  entityCode, coordinates, zoom,
}: {
  entityCode: string; coordinates: [number, number]; zoom: number;
}) {
  const teamColor = useCountryFillColor(entityCode);
  const theme = useMapTheme();
  const isUnassigned = !entityCode || teamColor === theme.unassignedFill;
  const fill = isUnassigned ? UNASSIGNED_COLOR : teamColor;
  const r = 4 / zoom;

  return (
    <Marker coordinates={coordinates}>
      <circle
        r={r + 0.8 / zoom}
        fill="#ffffff"
        fillOpacity={0.85}
        stroke="rgba(15,23,42,0.10)"
        strokeWidth={0.4 / zoom}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        r={r}
        fill={fill}
        fillOpacity={0.95}
        stroke="#ffffff"
        strokeWidth={0.4 / zoom}
        style={{ pointerEvents: 'none' }}
      />
    </Marker>
  );
});

export const DrillDownAccountLayer = memo(function DrillDownAccountLayer({ countryIso2, features, zoom }: DrillDownAccountLayerProps) {
  const accounts = useAccounts();
  const order    = useAccountOrder();
  const show     = useShowAccounts();

  const stateCentroids = useMemo(() => {
    const map: Record<string, [number, number]> = {};
    features.forEach((f) => {
      map[f.id] = geoCentroid(f as Parameters<typeof geoCentroid>[0]) as [number, number];
    });
    return map;
  }, [features]);

  const countryAccounts = useMemo(
    () => order.map((id) => accounts[id]).filter((a) => a?.country === countryIso2),
    [accounts, order, countryIso2],
  );

  if (!show || countryAccounts.length === 0) return null;

  return (
    <>
      {countryAccounts.map((account) => {
        if (!account) return null;
        const stateKey    = account.state ? account.state.split(':')[1] : null;
        const coordinates = stateKey ? stateCentroids[stateKey] : null;
        if (!coordinates) return null;
        return (
          <StateDot
            key={account.id}
            entityCode={account.state ?? ''}
            coordinates={coordinates}
            zoom={zoom}
          />
        );
      })}
    </>
  );
});
