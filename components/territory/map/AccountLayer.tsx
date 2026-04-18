'use client';

import { memo, useMemo } from 'react';
import { Marker } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import {
  useAccounts, useAccountOrder, useShowAccounts,
  useCountryFillColor, useMapTheme, useMapAccountMetric, useFieldDefs,
} from '@/hooks/useTerritoryStore';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';
import { formatFieldValue } from '@/lib/accountFields';
import type { StateFeature } from '@/hooks/useCountryStates';

// ── Shared helpers ────────────────────────────────────────────────────────────

const UNASSIGNED_COLOR = '#ef4444';

/** Radius [4, 18] normalised to the max value across all countries. */
function scaledRadius(val: number, maxVal: number): number {
  if (maxVal <= 0 || val <= 0) return 4;
  return 4 + (Math.log(val + 1) / Math.log(maxVal + 1)) * 14;
}

type CountryStats = { count: number } & Record<string, number>;

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

export const WorldAccountLayer = memo(function WorldAccountLayer({ zoom }: WorldAccountLayerProps) {
  const accounts  = useAccounts();
  const order     = useAccountOrder();
  const show      = useShowAccounts();
  const metric    = useMapAccountMetric();
  const fieldDefs = useFieldDefs();

  const { byCountry, maxVal } = useMemo(() => {
    const metricFieldIds = fieldDefs.filter((f) => f.type === 'metric').map((f) => f.id);
    const map: Record<string, CountryStats> = {};
    order.forEach((id) => {
      const a = accounts[id];
      if (!a) return;
      if (!map[a.country]) {
        const stats: CountryStats = { count: 0 };
        metricFieldIds.forEach((fid) => { stats[fid] = 0; });
        map[a.country] = stats;
      }
      map[a.country].count++;
      metricFieldIds.forEach((fid) => {
        map[a.country][fid] = (map[a.country][fid] ?? 0) + (Number(a.fields[fid]) || 0);
      });
    });
    const max = Math.max(1, ...Object.values(map).map((s) => s[metric] ?? 0));
    return { byCountry: map, maxVal: max };
  }, [accounts, order, metric, fieldDefs]);

  const fieldDef = fieldDefs.find((f) => f.id === metric);

  if (!show || order.length === 0) return null;

  return (
    <>
      {Object.entries(byCountry).map(([iso2, stats]) => {
        const centroid = COUNTRY_CENTROIDS[iso2];
        if (!centroid) return null;
        const [lat, lng] = centroid;
        const val = stats[metric] ?? 0;
        const label = metric === 'count'
          ? (val > 1 ? String(val) : '')
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
