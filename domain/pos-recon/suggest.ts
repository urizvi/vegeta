// Heuristic column → entity-field mapping suggester. Naive first pass:
// synonym tables + a substring-match scorer. The P3 batch will replace
// this with a Claude Agent SDK integration for fuzzy matching, but the
// interface stays the same so callers don't churn.

import type { Column } from '@/ingestion/types';
import type {
  POSRecordMapping,
  ShipAndDebitMapping,
  PriceProtectionMapping,
} from './import';

/** Synonyms per entity field. First entry is the canonical form. Lowercased. */
const POS_SYNONYMS: Record<keyof POSRecordMapping, string[]> = {
  distributor: ['distributor', 'dist', 'reseller', 'disti'],
  period: ['period', 'reporting_period', 'month', 'quarter', 'fiscal_period'],
  partNumber: ['part_number', 'partno', 'part_no', 'part', 'mpn', 'sku', 'material'],
  endCustomer: ['end_customer', 'customer', 'account', 'end_user', 'buyer'],
  shipDate: ['ship_date', 'shipped', 'ship', 'shipment_date'],
  sellDate: ['sell_date', 'sold_date', 'invoice_date', 'sold', 'sale_date'],
  quantity: ['quantity', 'qty', 'units', 'quantity_sold', 'ship_qty'],
  resalePrice: ['resale_price', 'unit_price', 'sell_price', 'price', 'resale', 'unit'],
  extendedAmount: ['extended_amount', 'extended', 'total', 'amount', 'ext_amount', 'ext_total'],
  currency: ['currency', 'ccy', 'curr'],
  externalId: ['id', 'line_id', 'row_id', 'external_id', 'transaction_id'],
};

const SD_SYNONYMS: Record<keyof ShipAndDebitMapping, string[]> = {
  distributor: POS_SYNONYMS.distributor,
  period: POS_SYNONYMS.period,
  partNumber: POS_SYNONYMS.partNumber,
  endCustomer: POS_SYNONYMS.endCustomer,
  quantity: POS_SYNONYMS.quantity,
  costPrice: ['cost_price', 'cost', 'unit_cost', 'purchase_price', 'disti_cost'],
  authorizedPrice: ['authorized_price', 'auth_price', 'special_price', 'authorized', 'contract_price'],
  authorizationRef: ['authorization', 'auth_ref', 'debit_auth', 'authorization_number', 'auth_no'],
  currency: POS_SYNONYMS.currency,
  externalId: POS_SYNONYMS.externalId,
};

const PP_SYNONYMS: Record<keyof PriceProtectionMapping, string[]> = {
  distributor: POS_SYNONYMS.distributor,
  period: POS_SYNONYMS.period,
  partNumber: POS_SYNONYMS.partNumber,
  endCustomer: POS_SYNONYMS.endCustomer,
  quantity: POS_SYNONYMS.quantity,
  originalPrice: ['original_price', 'old_price', 'previous_price', 'orig_price', 'price_before'],
  newPrice: ['new_price', 'reduced_price', 'protected_price', 'price_after'],
  effectiveDate: ['effective_date', 'effective', 'price_change_date', 'reset_date'],
  currency: POS_SYNONYMS.currency,
  externalId: POS_SYNONYMS.externalId,
};

export function suggestPOSRecordMapping(columns: readonly Column[]): Partial<POSRecordMapping> {
  return suggestFrom(columns, POS_SYNONYMS);
}

export function suggestShipAndDebitMapping(columns: readonly Column[]): Partial<ShipAndDebitMapping> {
  return suggestFrom(columns, SD_SYNONYMS);
}

export function suggestPriceProtectionMapping(columns: readonly Column[]): Partial<PriceProtectionMapping> {
  return suggestFrom(columns, PP_SYNONYMS);
}

function suggestFrom<M>(
  columns: readonly Column[],
  synonyms: Record<keyof M, string[]>,
): Partial<M> {
  const active = columns.filter((c) => !c.discarded);
  const out: Partial<M> = {};
  const claimed = new Set<string>();

  // Rank fields by synonym-list length descending so more-specific fields
  // (e.g. authorizedPrice) win their columns before generic ones (e.g. price).
  const entries = (Object.entries(synonyms) as [keyof M, string[]][])
    .sort(([, a], [, b]) => b.length - a.length);

  for (const [field, syns] of entries) {
    let best: { column: Column; score: number } | null = null;
    for (const col of active) {
      if (claimed.has(col.key)) continue;
      const score = scoreColumn(col, syns);
      if (score > 0 && (!best || score > best.score)) best = { column: col, score };
    }
    if (best) {
      (out as Record<string, string>)[field as string] = best.column.key;
      claimed.add(best.column.key);
    }
  }
  return out;
}

function scoreColumn(col: Column, synonyms: readonly string[]): number {
  const candidates = [col.key, col.label, col.sourceHeader].map(normalize);
  let best = 0;
  for (const syn of synonyms) {
    const s = normalize(syn);
    for (const cand of candidates) {
      const score = scorePair(cand, s);
      if (score > best) best = score;
    }
  }
  return best;
}

/** Exact = 100, exact-normalized substring match = 70 (cand contains syn or
 *  vice-versa), token-boundary match = 50, otherwise 0. Never fuzzy — that's
 *  intentional; false positives are more harmful than false negatives here. */
function scorePair(cand: string, syn: string): number {
  if (!cand || !syn) return 0;
  if (cand === syn) return 100;
  if (cand.includes(syn) || syn.includes(cand)) return 70;
  const tokens = new Set(cand.split('_').filter(Boolean));
  const synTokens = syn.split('_').filter(Boolean);
  if (synTokens.every((t) => tokens.has(t))) return 50;
  return 0;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
