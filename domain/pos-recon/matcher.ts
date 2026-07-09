// Matcher seam for the P3 engine. Keeps fuzzy-matching decisions out of
// the engine core so a Claude Agent SDK-backed matcher can be swapped in
// later without touching engine logic.
//
// Contract: methods return a similarity score in [0, 1]. 1.0 = certain
// match; 0 = definitely different. The engine's config decides what
// score qualifies as a match — the matcher just scores.

import { normalizeCustomer, normalizePartNumber } from './normalize';

export interface Matcher {
  /** Score two customer-name strings for likely-same-entity. */
  customerScore(a: string, b: string): number;
  /** Score two part-number strings. */
  partScore(a: string, b: string): number;
}

/**
 * Default local implementation:
 *   - Exact match after normalization → 1.0
 *   - One is a prefix or suffix of the other after normalization → 0.7
 *   - Otherwise → 0
 *
 * Deliberately conservative — no edit-distance fuzz here. False positives
 * in the recon engine cost the user real money, so anything with a hint
 * of ambiguity should land in the "flagged" bucket for review, not
 * silently match.
 */
export class LocalMatcher implements Matcher {
  customerScore(a: string, b: string): number {
    const na = normalizeCustomer(a);
    const nb = normalizeCustomer(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.startsWith(nb) || nb.startsWith(na)) return 0.7;
    if (na.endsWith(nb) || nb.endsWith(na)) return 0.7;
    return 0;
  }

  partScore(a: string, b: string): number {
    const na = normalizePartNumber(a);
    const nb = normalizePartNumber(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.startsWith(nb) || nb.startsWith(na)) return 0.7;
    return 0;
  }
}

export const defaultMatcher: Matcher = new LocalMatcher();
