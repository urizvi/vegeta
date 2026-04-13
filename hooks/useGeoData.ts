import { useMemo } from 'react';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { numericToIso2 } from '@/lib/geoUtils';

// Loaded once at module level — synchronous, no loading state needed
// eslint-disable-next-line @typescript-eslint/no-var-requires
const worldTopo = require('world-atlas/countries-110m.json') as Topology;

export interface CountryFeature {
  rsmKey: string;
  id: string; // numeric ISO code
  iso2: string; // alpha-2 ISO code
  name: string;
  geometry: unknown;
  properties: Record<string, unknown>;
  type: 'Feature';
}

export function useGeoData(): CountryFeature[] {
  return useMemo(() => {
    const obj = worldTopo.objects['countries'] as GeometryCollection;
    const geoJson = feature(worldTopo, obj);
    return geoJson.features.map((f, i) => {
      const numId = String(f.id ?? '');
      const iso2 = numericToIso2(numId);
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return {
        rsmKey: `country-${numId || i}`,
        id: numId,
        iso2,
        name: (props.name as string) ?? iso2,
        geometry: f.geometry,
        properties: props,
        type: 'Feature' as const,
      } satisfies CountryFeature;
    });
  }, []);
}
