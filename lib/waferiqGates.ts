// Pricing-gate seam. P5 ships the plumbing so downstream components
// consult a single hook; nothing is actually gated today. When pricing
// tiers land, this is where per-feature enforcement plugs in — grep for
// `useGate` and `checkGate` to find every consuming call-site.

'use client';

import { useMemo } from 'react';

export type Gate =
  | 'export_csv'
  | 'export_xlsx'
  | 'agent_matcher'
  | 'multi_workspace';

export interface GateResult {
  allowed: boolean;
  /** Human-facing reason when blocked; undefined when allowed. */
  reason?: string;
}

/**
 * Pure gate check. Safe to call from event handlers, non-component code, or
 * tests. Prefer `useGate` from React components so re-renders track
 * entitlement changes when they land.
 */
export function checkGate(feature: Gate): GateResult {
  void feature;
  return { allowed: true };
}

/** React hook wrapper. Memoized so callers get a stable reference. */
export function useGate(feature: Gate): GateResult {
  return useMemo(() => checkGate(feature), [feature]);
}

/** Imperative assert. Throws when blocked. */
export function assertGate(feature: Gate): void {
  const g = checkGate(feature);
  if (!g.allowed) throw new Error(g.reason ?? `Feature "${feature}" is not available on your plan.`);
}
