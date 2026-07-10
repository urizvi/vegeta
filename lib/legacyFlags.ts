// WaferIQ pivot (2026-07-06): flags for parked legacy surfaces.
// See docs/waferiq-pivot.md for context.

const truthy = (v: string | undefined): boolean =>
  v === '1' || v === 'true' || v === 'TRUE';

export function isLegacyTerritoryEnabled(): boolean {
  return truthy(process.env.NEXT_PUBLIC_LEGACY_TERRITORY_ENABLED);
}
