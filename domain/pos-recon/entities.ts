// WaferIQ P2 — POS / sell-through reconciliation entities.
//
// This is the wedge's data model. Kept narrow: exactly the fields we need
// to run the P3 matching engine and populate the P4 recon dashboard.
// Anything speculative belongs in a P3+ commit, not here.

/** ISO date string (YYYY-MM-DD). We store as string, not Date, so the
 *  store shape is serializable and comparable without timezone drift. */
export type IsoDate = string;

/** Currency amount in the transaction's original currency, expressed as
 *  a number. Currency code lives per-record. Rounding is caller's problem;
 *  matching tolerances live on the engine, not the entity. */
export type Money = number;

// ─── POS record ───────────────────────────────────────────────────────
// A single sell-through line from a distributor's POS report. This is the
// "truth" side of the reconciliation — what the distributor claims was
// actually sold to an end customer.

export interface POSRecord {
  id: string;
  /** Distributor's own line-id if present, else derived from row index. */
  externalId?: string;

  /** Reporting distributor. Free-form string; normalized upstream. */
  distributor: string;
  /** Reporting period this line was included in (usually a month). */
  period: IsoDate;

  /** Manufacturer part number as it appears on the POS report. */
  partNumber: string;
  /** End customer as reported by the distributor. */
  endCustomer: string;

  /** When the distributor shipped to the end customer. */
  shipDate: IsoDate;
  /** When the sale was recognized (may equal shipDate). */
  sellDate: IsoDate;

  quantity: number;
  /** Unit price at which the distributor sold to the end customer. */
  resalePrice: Money;
  /** Extended amount (typically quantity × resalePrice; stored, not derived). */
  extendedAmount: Money;

  /** ISO 4217; defaults to 'USD' when the source omits it. */
  currency: string;

  /** Which ingested Dataset this row came from. */
  datasetId: string;
  /** Row index in the source dataset; kept for drill-down UI. */
  sourceRowIndex: number;
}

// ─── Claims ───────────────────────────────────────────────────────────
// Distributor claims tied to POS transactions. Two shapes in P2: ship-and-
// debit (S&D) and price-protection (PP). Modeled as a discriminated union
// so the P3 matcher can walk them uniformly.

interface ClaimBase {
  id: string;
  externalId?: string;

  distributor: string;
  period: IsoDate;

  partNumber: string;
  endCustomer: string;

  /** Quantity the distributor is claiming credit against. */
  quantity: number;

  currency: string;

  datasetId: string;
  sourceRowIndex: number;
}

/** Ship-and-debit: distributor claims the delta between the price they
 *  paid the manufacturer (`costPrice`) and the special price authorized
 *  for a specific end-customer transaction (`authorizedPrice`). Credit
 *  per unit = costPrice − authorizedPrice. */
export interface ShipAndDebitClaim extends ClaimBase {
  type: 'ship_and_debit';
  costPrice: Money;
  authorizedPrice: Money;
  /** Manufacturer's authorization / debit-authorization reference, if any. */
  authorizationRef?: string;
}

/** Price protection: on a manufacturer price cut, distributor claims a
 *  credit on inventory-on-hand or recently-sold units. `originalPrice`
 *  and `newPrice` bracket the protected delta. */
export interface PriceProtectionClaim extends ClaimBase {
  type: 'price_protection';
  originalPrice: Money;
  newPrice: Money;
  /** When the manufacturer price change took effect. */
  effectiveDate: IsoDate;
}

export type Claim = ShipAndDebitClaim | PriceProtectionClaim;
export type ClaimType = Claim['type'];

// ─── Reconciliation results ───────────────────────────────────────────
// Output of the P3 matching engine. One result per POS row (or per
// unmatched claim). The union captures the four states we care about.

export type DiscrepancyFlagKind =
  | 'missing_claim'          // POS row present, no claim to match
  | 'orphan_claim'           // Claim present, no POS row to match
  | 'quantity_mismatch'      // Matched, but quantities disagree beyond tolerance
  | 'price_mismatch'         // Matched, but authorized/resale price disagrees
  | 'date_out_of_window'     // Matched key fields but ship/period outside window
  | 'duplicate_claim';       // Multiple claims tied to one POS row

export type DiscrepancySeverity = 'info' | 'warning' | 'error';

export interface DiscrepancyFlag {
  kind: DiscrepancyFlagKind;
  severity: DiscrepancySeverity;
  /** Plain-English, user-facing. e.g. "S&D claim qty 100 vs POS qty 95". */
  message: string;
  /** Optional dollar impact of the discrepancy, when computable. */
  amountImpact?: Money;
}

export interface ReconciliationResult {
  id: string;
  /** Present unless status = 'orphan_claim'. */
  posRecordId?: string;
  /** Claim(s) matched to this POS row. Empty for 'missing_claim'. */
  claimIds: string[];
  status: 'matched' | 'missing_claim' | 'orphan_claim' | 'flagged';
  flags: DiscrepancyFlag[];
  /** Net credit calculated across matched claim(s), if any. */
  calculatedCredit?: Money;
  /** Present on 'matched' and 'flagged'. */
  matchedAt?: string;
}
