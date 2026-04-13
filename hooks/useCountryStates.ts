'use client';

import { useState, useEffect } from 'react';

export interface StateFeature {
  rsmKey: string;
  type: 'Feature';
  id: string; // iso_3166_2 e.g. "US-CA"
  name: string;
  iso2: string; // country ISO2
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
}

// Module-level cache: countryISO2 → features (never cleared, session lifetime)
const cache = new Map<string, StateFeature[]>();

export function useCountryStates(countryIso2: string | null): {
  features: StateFeature[];
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{
    features: StateFeature[];
    loading: boolean;
    error: string | null;
  }>(() => {
    if (!countryIso2) return { features: [], loading: false, error: null };
    const cached = cache.get(countryIso2);
    return cached
      ? { features: cached, loading: false, error: null }
      : { features: [], loading: true, error: null };
  });

  useEffect(() => {
    if (!countryIso2) {
      setState({ features: [], loading: false, error: null });
      return;
    }

    const cached = cache.get(countryIso2);
    if (cached) {
      setState({ features: cached, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    fetch('/geo/ne_10m_admin_1_states_provinces.json')
      .then((r) => r.json())
      .then((data: { features: Array<{ type: string; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> }) => {
        // Build cache for ALL countries at once (file is fetched only once total)
        const byCountry = new Map<string, StateFeature[]>();
        data.features.forEach((f, i) => {
          const iso2 = f.properties.iso_a2 as string;
          const code = f.properties.iso_3166_2 as string ?? `${iso2}-${i}`;
          const name = f.properties.name as string ?? code;
          if (!iso2) return;
          const feat: StateFeature = {
            rsmKey: `state-${code}`,
            type: 'Feature',
            id: code,
            name,
            iso2,
            geometry: f.geometry,
            properties: f.properties,
          };
          if (!byCountry.has(iso2)) byCountry.set(iso2, []);
          byCountry.get(iso2)!.push(feat);
        });
        // Populate module cache
        byCountry.forEach((feats, iso) => cache.set(iso, feats));

        const result = byCountry.get(countryIso2) ?? [];
        setState({ features: result, loading: false, error: null });
      })
      .catch((err) => {
        setState({ features: [], loading: false, error: String(err) });
      });
  }, [countryIso2]);

  return state;
}
