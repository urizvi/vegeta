'use client';

import { memo, useMemo } from 'react';
import { Marker } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import { useAccounts, useAccountOrder, useShowAccounts, useCountryFillColor, useMapTheme } from '@/hooks/useTerritoryStore';
import { COUNTRY_CENTROIDS } from '@/lib/countryCentroids';
import type { StateFeature } from '@/hooks/useCountryStates';

// ── World map — one bubble per country ──────────────────────────────────────

interface WorldAccountLayerProps {
  zoom: number;
}

const UNASSIGNED_COLOR = '#ef4444'; // red for unassigned territories

// Country bubble: reads its own fill color so it matches the territory assignment
const CountryBubble = memo(function CountryBubble({
  iso2,
  count,
  lat,
  lng,
  zoom,
}: {
  iso2: string;
  count: number;
  lat: number;
  lng: number;
  zoom: number;
}) {
  const teamColor = useCountryFillColor(iso2);
  const theme = useMapTheme();
  const isUnassigned = teamColor === theme.unassignedFill;
  const fill = isUnassigned ? UNASSIGNED_COLOR : teamColor;
  const r = Math.max(5, Math.min(16, 3 + Math.log(count + 1) * 3.5)) / zoom;
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
      {count > 1 && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="600"
          fill="#fff"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {count > 99 ? '99+' : count}
        </text>
      )}
    </Marker>
  );
});

export function WorldAccountLayer({ zoom }: WorldAccountLayerProps) {
  const accounts = useAccounts();
  const order = useAccountOrder();
  const show = useShowAccounts();

  const byCountry = useMemo(() => {
    const map: Record<string, { count: number; arr: number }> = {};
    order.forEach((id) => {
      const a = accounts[id];
      if (!a) return;
      if (!map[a.country]) map[a.country] = { count: 0, arr: 0 };
      map[a.country].count++;
      map[a.country].arr += a.arr;
    });
    return map;
  }, [accounts, order]);

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
            count={stats.count}
            lat={lat}
            lng={lng}
            zoom={zoom}
          />
        );
      })}
    </>
  );
}

// ── Drill-down — individual dot per account at state centroid ────────────────

interface DrillDownAccountLayerProps {
  countryIso2: string;
  features: StateFeature[];
  zoom: number;
}

// State dot: reads fill color for state entity code
const StateDot = memo(function StateDot({
  entityCode,
  coordinates,
  zoom,
}: {
  entityCode: string;
  coordinates: [number, number];
  zoom: number;
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
  const order = useAccountOrder();
  const show = useShowAccounts();

  // Build state code → centroid map from loaded GeoJSON features
  const stateCentroids = useMemo(() => {
    const map: Record<string, [number, number]> = {};
    features.forEach((f) => {
      const centroid = geoCentroid(f as Parameters<typeof geoCentroid>[0]);
      // centroid is [lng, lat]; Marker expects [lng, lat]
      map[f.id] = centroid as [number, number];
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
        // state is stored as "US:US-CA"; we need just the state code part for centroid lookup
        const stateKey = account.state ? account.state.split(':')[1] : null;
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
