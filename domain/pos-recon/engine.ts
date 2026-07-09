// P3 — POS reconciliation engine.
//
// Consumes POSRecord[] + Claim[], emits ReconciliationResult[]. The
// matching decisions (customer / part-number similarity) live behind the
// Matcher seam so a Claude Agent SDK-backed matcher can slot in later
// without touching this file.
//
// Determinism: same inputs → same outputs. Inputs are sorted internally
// before matching so caller order doesn't matter.

import type {
  Claim,
  DiscrepancyFlag,
  Money,
  POSRecord,
  ReconciliationResult,
} from './entities';
import { defaultMatcher, type Matcher } from './matcher';
import { dateDiffDays, normalizePartNumber } from './normalize';

export interface MatchingConfig {
  /** Symmetric tolerance on quantity, expressed as a percentage. */
  quantityTolerancePercent: number;
  /** Max absolute days between claim.period and pos.shipDate before
   *  the pair is either flagged (soft, still a match) or rejected. */
  dateWindowDays: number;
  /** Beyond this, we don't call it a match at all. */
  hardDateWindowDays: number;
  /** Minimum customer similarity to consider a POS row a candidate. */
  customerScoreThreshold: number;
  /** Symmetric price tolerance for S&D authorizedPrice vs POS resalePrice. */
  priceMismatchThresholdPercent: number;
  /** If false, ignore distributor when bucketing (rarely wanted). */
  strictDistributor: boolean;
}

export const defaultConfig: MatchingConfig = {
  quantityTolerancePercent: 5,
  dateWindowDays: 30,
  hardDateWindowDays: 90,
  customerScoreThreshold: 0.7,
  priceMismatchThresholdPercent: 5,
  strictDistributor: true,
};

export function reconcile(
  posRecords: readonly POSRecord[],
  claims: readonly Claim[],
  config: Partial<MatchingConfig> = {},
  matcher: Matcher = defaultMatcher,
): ReconciliationResult[] {
  const cfg = { ...defaultConfig, ...config };

  // Sort for deterministic processing.
  const posSorted = [...posRecords].sort(compareById);
  const claimsSorted = [...claims].sort(compareById);

  const buckets = bucketPOS(posSorted, cfg);
  const claimsByPos = new Map<string, Claim[]>();     // posRecord.id → claims
  const matchedClaims = new Set<string>();
  const results: ReconciliationResult[] = [];
  const now = new Date().toISOString();

  // Pass 1: for each claim, find its best POS match (if any).
  for (const claim of claimsSorted) {
    const bucketKey = bucketKeyFor(claim.distributor, claim.partNumber, cfg);
    const candidates = buckets.get(bucketKey) ?? [];
    const match = pickBestPOSMatch(claim, candidates, matcher, cfg);
    if (!match) continue;
    matchedClaims.add(claim.id);
    const arr = claimsByPos.get(match.id) ?? [];
    arr.push(claim);
    claimsByPos.set(match.id, arr);
  }

  // Pass 2: build one result per POS row, matched or not.
  let seq = 0;
  for (const pos of posSorted) {
    const linked = claimsByPos.get(pos.id) ?? [];
    if (linked.length === 0) {
      results.push({
        id: `res_${seq++}`,
        posRecordId: pos.id,
        claimIds: [],
        status: 'missing_claim',
        flags: [{
          kind: 'missing_claim',
          severity: 'warning',
          message: `POS row has no matching claim (${pos.partNumber} × ${pos.quantity} to ${pos.endCustomer}).`,
        }],
      });
      continue;
    }
    const flags = buildFlagsForMatch(pos, linked, cfg);
    const calculatedCredit = sumCredit(linked);
    results.push({
      id: `res_${seq++}`,
      posRecordId: pos.id,
      claimIds: linked.map((c) => c.id),
      status: flags.length > 0 ? 'flagged' : 'matched',
      flags,
      calculatedCredit,
      matchedAt: now,
    });
  }

  // Pass 3: orphan claims — claims that never linked to any POS row.
  for (const claim of claimsSorted) {
    if (matchedClaims.has(claim.id)) continue;
    results.push({
      id: `res_${seq++}`,
      claimIds: [claim.id],
      status: 'orphan_claim',
      flags: [{
        kind: 'orphan_claim',
        severity: 'error',
        message: `Claim has no matching POS row (${claim.partNumber} × ${claim.quantity} to ${claim.endCustomer}).`,
      }],
    });
  }

  return results;
}

function compareById(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function bucketKeyFor(distributor: string, partNumber: string, cfg: MatchingConfig): string {
  const part = normalizePartNumber(partNumber);
  return cfg.strictDistributor ? `${distributor}|${part}` : part;
}

function bucketPOS(pos: readonly POSRecord[], cfg: MatchingConfig): Map<string, POSRecord[]> {
  const out = new Map<string, POSRecord[]>();
  for (const p of pos) {
    const k = bucketKeyFor(p.distributor, p.partNumber, cfg);
    const arr = out.get(k) ?? [];
    arr.push(p);
    out.set(k, arr);
  }
  return out;
}

interface MatchCandidate {
  pos: POSRecord;
  customerScore: number;
  dateDiff: number;
}

function pickBestPOSMatch(
  claim: Claim,
  candidates: readonly POSRecord[],
  matcher: Matcher,
  cfg: MatchingConfig,
): POSRecord | null {
  let best: MatchCandidate | null = null;
  for (const pos of candidates) {
    const cScore = matcher.customerScore(claim.endCustomer, pos.endCustomer);
    if (cScore < cfg.customerScoreThreshold) continue;
    const dDiff = dateDiffDays(claim.period, pos.shipDate);
    if (Number.isNaN(dDiff)) continue;
    if (dDiff > cfg.hardDateWindowDays) continue;
    const cand: MatchCandidate = { pos, customerScore: cScore, dateDiff: dDiff };
    if (!best || isBetter(cand, best)) best = cand;
  }
  return best?.pos ?? null;
}

/** Prefer higher customer score, then closer date, then closer quantity. */
function isBetter(a: MatchCandidate, b: MatchCandidate): boolean {
  if (a.customerScore !== b.customerScore) return a.customerScore > b.customerScore;
  if (a.dateDiff !== b.dateDiff) return a.dateDiff < b.dateDiff;
  return false;
}

function buildFlagsForMatch(pos: POSRecord, claims: readonly Claim[], cfg: MatchingConfig): DiscrepancyFlag[] {
  const flags: DiscrepancyFlag[] = [];

  if (claims.length > 1) {
    flags.push({
      kind: 'duplicate_claim',
      severity: 'warning',
      message: `${claims.length} claims tie back to this POS row.`,
    });
  }

  const totalClaimQty = claims.reduce((s, c) => s + c.quantity, 0);
  const qtyTolerance = (pos.quantity * cfg.quantityTolerancePercent) / 100;
  if (Math.abs(totalClaimQty - pos.quantity) > qtyTolerance) {
    flags.push({
      kind: 'quantity_mismatch',
      severity: 'error',
      message: `Total claim qty ${totalClaimQty} vs POS qty ${pos.quantity} (tolerance ±${cfg.quantityTolerancePercent}%).`,
      amountImpact: (totalClaimQty - pos.quantity) * pos.resalePrice,
    });
  }

  for (const claim of claims) {
    const diff = dateDiffDays(claim.period, pos.shipDate);
    if (!Number.isNaN(diff) && diff > cfg.dateWindowDays) {
      flags.push({
        kind: 'date_out_of_window',
        severity: 'warning',
        message: `Claim period ${claim.period} is ${diff}d from POS ship date ${pos.shipDate} (window ±${cfg.dateWindowDays}d).`,
      });
    }
    if (claim.type === 'ship_and_debit') {
      const priceDiff = Math.abs(pos.resalePrice - claim.authorizedPrice);
      const threshold = (claim.authorizedPrice * cfg.priceMismatchThresholdPercent) / 100;
      if (priceDiff > threshold) {
        flags.push({
          kind: 'price_mismatch',
          severity: 'error',
          message: `POS resale price ${pos.resalePrice} vs S&D authorized price ${claim.authorizedPrice} (tolerance ±${cfg.priceMismatchThresholdPercent}%).`,
          amountImpact: priceDiff * claim.quantity,
        });
      }
    }
  }

  return flags;
}

function sumCredit(claims: readonly Claim[]): Money {
  let total = 0;
  for (const claim of claims) {
    if (claim.type === 'ship_and_debit') {
      total += (claim.costPrice - claim.authorizedPrice) * claim.quantity;
    } else {
      total += (claim.originalPrice - claim.newPrice) * claim.quantity;
    }
  }
  return total;
}
