/**
 * Deterministic fallback palette for Geo nodes that have no user-set color.
 * Hues are tuned to read on the paper-quiet "Vegeta" map theme — muted,
 * complementary, and distinct enough to differentiate up to 8 root geos
 * at a glance.
 *
 * Order is intentional: brand and accent come first so the most visible
 * geos line up with the system's dominant colors.
 */
export const TERRITORY_PALETTE = [
  '#6366f1', // indigo-500 (brand)
  '#f59e0b', // amber-500 (accent)
  '#0d9488', // teal-600
  '#e11d48', // rose-600
  '#7c3aed', // violet-600
  '#0284c7', // sky-600
  '#65a30d', // lime-600
  '#c2410c', // orange-700
] as const;

/** Stable, fast string hash (FNV-1a, 32-bit). Same input → same color. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function defaultColorForGeoId(id: string): string {
  return TERRITORY_PALETTE[hashId(id) % TERRITORY_PALETTE.length];
}
