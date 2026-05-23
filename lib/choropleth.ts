import { getEntityMetricVal, type AccountStatsByEntity } from '@/lib/territoryIndex';

/** Sequential ramp endpoints. Tuned to feel like amber-soft → brand. */
const RAMP_FROM = { r: 254, g: 243, b: 199 }; // ≈ amber-100 (--color-accent-soft)
const RAMP_TO   = { r: 79,  g: 70,  b: 229 };  // ≈ indigo-600 (--color-brand)
/** t=0 produces an even softer near-white tint to differentiate "assigned but zero". */
const RAMP_ZERO = { r: 248, g: 250, b: 252 }; // ≈ slate-50

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function mixColor(t: number): string {
  const u = clamp01(t);
  // Two-stop ramp: ZERO → FROM (0..0.05) → TO (0.05..1) so a value just above 0
  // visibly lifts off the near-white floor.
  if (u <= 0.05) {
    const k = u / 0.05;
    const r = lerp(RAMP_ZERO.r, RAMP_FROM.r, k);
    const g = lerp(RAMP_ZERO.g, RAMP_FROM.g, k);
    const b = lerp(RAMP_ZERO.b, RAMP_FROM.b, k);
    return `rgb(${r} ${g} ${b})`;
  }
  const k = (u - 0.05) / 0.95;
  const r = lerp(RAMP_FROM.r, RAMP_TO.r, k);
  const g = lerp(RAMP_FROM.g, RAMP_TO.g, k);
  const b = lerp(RAMP_FROM.b, RAMP_TO.b, k);
  return `rgb(${r} ${g} ${b})`;
}

/** CSS gradient stops for ChoroplethScale's bar. */
export function rampStops(): string {
  return [0, 0.05, 0.5, 1].map((t) => `${mixColor(t)} ${(t * 100).toFixed(1)}%`).join(', ');
}

export interface ChoroplethScale {
  metric: string;
  min: number;
  max: number;
  /** Returns a CSS color string for a given value. Values <= 0 → ZERO tint. */
  fillFor: (value: number) => string;
}

/**
 * Builds a scale for the given metric across the provided stats.
 *
 * `keyFilter` lets the caller restrict to country-level keys (no `:`) or
 * state-level keys (those with `:`).
 */
export function buildChoroplethScale(
  stats: AccountStatsByEntity,
  metric: string,
  keyFilter: (key: string) => boolean,
): ChoroplethScale {
  let min = Infinity;
  let max = 0;
  for (const key in stats) {
    if (!keyFilter(key)) continue;
    const v = getEntityMetricVal(stats[key], metric);
    if (v > 0 && v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min)) min = 0;
  const safeMax = max > 0 ? max : 1;
  return {
    metric,
    min: min === Infinity ? 0 : min,
    max,
    fillFor: (value) => {
      if (value <= 0) return mixColor(0);
      return mixColor(value / safeMax);
    },
  };
}
