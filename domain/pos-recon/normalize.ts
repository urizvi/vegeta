// Small normalization helpers used by the recon matcher + engine. Kept
// terse and pure so they can be shared by the LocalMatcher and (later) an
// AgentMatcher without changing entity data at rest.

import type { IsoDate } from './entities';

/** Uppercase, strip non-alphanumerics. "abc-123" and "ABC 123" both → "ABC123". */
export function normalizePartNumber(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Common company-name suffixes that mean the same thing. Stripped before
// comparison so "Acme Inc" and "Acme, Inc." collapse.
const CUSTOMER_SUFFIXES = [
  'inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation',
  'co', 'company', 'gmbh', 'ag', 'sa', 'bv', 'plc', 'nv', 'kk',
];

/** Lowercase, drop punctuation, collapse whitespace, strip common suffixes.
 *  "Acme, Inc." → "acme". "Beta Corporation" → "beta". */
export function normalizeCustomer(s: string): string {
  const lowered = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = lowered.split(' ').filter((t) => !CUSTOMER_SUFFIXES.includes(t));
  return tokens.join(' ');
}

/** Absolute integer day-count between two IsoDate strings. Positive integer
 *  regardless of order. NaN if either date is unparseable. */
export function dateDiffDays(a: IsoDate, b: IsoDate): number {
  const dA = Date.parse(a);
  const dB = Date.parse(b);
  if (Number.isNaN(dA) || Number.isNaN(dB)) return Number.NaN;
  const ms = Math.abs(dA - dB);
  return Math.round(ms / 86_400_000);
}
