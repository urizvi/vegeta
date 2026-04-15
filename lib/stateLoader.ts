// Shared state data loader — fetches the GeoJSON once and caches by country ISO2.
// Both useCountryStates and useRegionStates import from here.

export interface StateFeature {
  rsmKey: string;
  type: 'Feature';
  id: string;    // iso_3166_2 e.g. "US-CA"
  name: string;
  iso2: string;  // country ISO2
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

const cache = new Map<string, StateFeature[]>();

// Singleton fetch promise — file is downloaded at most once per session
let fetchPromise: Promise<void> | null = null;

export function loadAllStates(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('/geo/ne_10m_admin_1_states_provinces.json')
    .then((r) => r.json())
    .then((data: { features: Array<{ properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }> }) => {
      const byCountry = new Map<string, StateFeature[]>();
      data.features.forEach((f, i) => {
        const iso2 = f.properties.iso_a2 as string;
        if (!iso2) return;
        const code = (f.properties.iso_3166_2 as string) ?? `${iso2}-${i}`;
        const name = (f.properties.name as string) ?? code;
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
      byCountry.forEach((feats, iso) => cache.set(iso, feats));
    });
  return fetchPromise;
}

export function getStatesForCountry(iso2: string): StateFeature[] {
  return cache.get(iso2) ?? [];
}

export function getStatesForCountries(iso2Codes: string[]): StateFeature[] {
  return iso2Codes.flatMap((iso2) => cache.get(iso2) ?? []);
}

export function isCached(iso2: string): boolean {
  return cache.has(iso2);
}
