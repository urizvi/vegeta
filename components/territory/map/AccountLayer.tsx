'use client';

import { memo, useMemo } from 'react';
import { Marker } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import {
  useAccounts, useAccountOrder, useShowAccounts,
  useCountryFillColor, useMapTheme, useMapAccountMetric,
} from '@/hooks/useTerritoryStore';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';
import { formatMetric } from '@/lib/accountFields';
import type { MapAccountMetric } from '@/lib/accountFields';
import type { StateFeature } from '@/hooks/useCountryStates';

// ── Shared helpers ────────────────────────────────────────────────────────────

const UNASSIGNED_COLOR = '#ef4444';

/** Radius [4, 18] normalised to the max value across all countries. */
function scaledRadius(val: number, maxVal: number): number {
  if (maxVal <= 0 || val <= 0) return 4;
  return 4 + (Math.log(val + 1) / Math.log(maxVal + 1)) * 14;
}

function bubbleLabel(metric: MapAccountMetric, stats: CountryStats): string {
  const val = stats[metric];
  if (val <= 0) return '';
  if (metric === 'count') return val > 1 ? String(val) : '';
  return formatMetric(metric, val);
}

interface CountryStats { count: number; arr: number; mrr: number; headcount: number }

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
  const fontSize = Math.max(6, 9 / zoom);

  return (
    <Marker coordinates={[lng, lat]}>
      <circle
        r={r}
        fill={fill}
        fillOpacity={0.75}
        stroke="#fff"
        strokeWidth={0.8 / zoom}
        style={{ pointerEvents: 'none' }}
      />
      {label && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="600"
          fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {label}
        </text>
      )}
    </Marker>
  );
});

export function WorldAccountLayer({ zoom }: WorldAccountLayerProps) {
  const accounts   = useAccounts();
  const order      = useAccountOrder();
  const show       = useShowAccounts();
  const metric     = useMapAccountMetric();

  const { byCountry, maxVal } = useMemo(() => {
    const map: Record<string, CountryStats> = {};
    order.forEach((id) => {
      const a = accounts[id];
      if (!a) return;
      if (!map[a.country]) map[a.country] = { count: 0, arr: 0, mrr: 0, headcount: 0 };
      map[a.country].count++;
      map[a.country].arr       += a.arr;
      map[a.country].mrr       += a.mrr;
      map[a.country].headcount += a.headcount;
    });
    const max = Math.max(1, ...Object.values(map).map((s) => s[metric]));
    return { byCountry: map, maxVal: max };
  }, [accounts, order, metric]);

  if (!show || order.length === 0) return null;

  return (
    <>
      {Object.entries(byCountry).map(([iso2, stats]) => {
        const centroid = COUNTRY_CENTROIDS[iso2];
        if (!centroid) return null;
        const [lat, lng] = centroid;
        return (
          <CountryBubble
            key={iso2}
            iso2={iso2}
            scaledR={scaledRadius(stats[metric], maxVal)}
            label={bubbleLabel(metric, stats)}
            lat={lat}
            lng={lng}
            zoom={zoom}
          />
        );
      })}
    </>
  );
}

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
        r={r}
        fill={fill}
        fillOpacity={0.85}
        stroke="#fff"
        strokeWidth={0.5 / zoom}
        style={{ pointerEvents: 'none' }}
      />
    </Marker>
  );
});

export function DrillDownAccountLayer({ countryIso2, features, zoom }: DrillDownAccountLayerProps) {
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
}
