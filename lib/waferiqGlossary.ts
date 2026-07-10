// Canonical glossary for WaferIQ. Field descriptions per entity kind
// + status + flag definitions. Consumed by /ingest mapping UI and
// /recon dashboard so definitions stay consistent between surfaces.

import type { DiscrepancyFlagKind } from '@/domain/pos-recon/entities';

export type EntityKind = 'pos_records' | 'ship_and_debit' | 'price_protection';
export type ResultStatus = 'matched' | 'flagged' | 'missing_claim' | 'orphan_claim';

interface FieldDef {
  /** True when the mapper will emit an empty_required issue if this is blank. */
  required: boolean;
  hint: string;
}

export const ENTITY_KIND_HEADLINE: Record<EntityKind, string> = {
  pos_records:
    'POS records are the "truth" side — one row per unit the distributor sold to an end customer.',
  ship_and_debit:
    'Ship-and-debit claims are credits the distributor asks for when they sold at an authorized (lower) price. Credit per unit = cost price − authorized price.',
  price_protection:
    'Price-protection claims are credits on stock the distributor already had when the manufacturer cut the price. Credit per unit = original price − new price.',
};

export const POS_FIELDS: Record<string, FieldDef> = {
  distributor: { required: true, hint: 'Which distributor filed this report (Arrow, Avnet, etc.).' },
  period: { required: true, hint: 'Reporting period, usually the first day of the month (2026-06-01).' },
  partNumber: { required: true, hint: 'Manufacturer part number exactly as it appears on the report.' },
  endCustomer: { required: true, hint: 'End customer the distributor sold to.' },
  shipDate: { required: true, hint: 'Date the distributor shipped to the end customer.' },
  sellDate: { required: true, hint: 'Date the sale was recognized. Often the same as ship date.' },
  quantity: { required: true, hint: 'Units sold on this line.' },
  resalePrice: { required: true, hint: 'Per-unit price the distributor sold at (their "resale" price).' },
  extendedAmount: { required: true, hint: 'Line total — typically quantity × resale price. Stored, not derived, since some POS files round.' },
  currency: { required: false, hint: 'ISO currency code. Defaults to USD if you leave this blank.' },
  externalId: { required: false, hint: 'Optional. The distributor\'s own line ID, if present. Preserved for drill-down.' },
};

export const SD_FIELDS: Record<string, FieldDef> = {
  distributor: { required: true, hint: 'Which distributor is claiming.' },
  period: { required: true, hint: 'Reporting period for the claim.' },
  partNumber: { required: true, hint: 'Manufacturer part number.' },
  endCustomer: { required: true, hint: 'End customer the distributor sold to.' },
  quantity: { required: true, hint: 'Units the distributor is claiming credit against.' },
  costPrice: { required: true, hint: 'Price the distributor paid the manufacturer per unit.' },
  authorizedPrice: { required: true, hint: 'Distributor\'s allowed selling price under the debit authorization. Credit per unit = cost − authorized.' },
  authorizationRef: { required: false, hint: 'Optional. Debit authorization number, if any.' },
  currency: { required: false, hint: 'ISO currency code. Defaults to USD.' },
  externalId: { required: false, hint: 'Optional. Distributor\'s own claim line ID.' },
};

export const PP_FIELDS: Record<string, FieldDef> = {
  distributor: { required: true, hint: 'Which distributor is claiming.' },
  period: { required: true, hint: 'Reporting period for the claim.' },
  partNumber: { required: true, hint: 'Manufacturer part number.' },
  endCustomer: { required: true, hint: 'End customer the distributor sold to (or held stock against).' },
  quantity: { required: true, hint: 'Units the distributor is protecting.' },
  originalPrice: { required: true, hint: 'Per-unit price before the manufacturer\'s cut.' },
  newPrice: { required: true, hint: 'Per-unit price after the cut. Credit per unit = original − new.' },
  effectiveDate: { required: true, hint: 'Date the price change took effect.' },
  currency: { required: false, hint: 'ISO currency code. Defaults to USD.' },
  externalId: { required: false, hint: 'Optional. Distributor\'s own claim line ID.' },
};

export function fieldsFor(kind: EntityKind): Record<string, FieldDef> {
  if (kind === 'pos_records') return POS_FIELDS;
  if (kind === 'ship_and_debit') return SD_FIELDS;
  return PP_FIELDS;
}

export const STATUS_DEFINITION: Record<ResultStatus, string> = {
  matched: 'POS row matched to at least one claim with no discrepancies.',
  flagged: 'POS row matched, but the engine found at least one issue — see the flags.',
  missing_claim: 'POS row with no claim tied to it. Potentially missed credit.',
  orphan_claim: 'Claim with no POS row to back it up. Could indicate a bad claim submission.',
};

export const FLAG_DEFINITION: Record<DiscrepancyFlagKind, string> = {
  missing_claim: 'A POS row wasn\'t matched to any claim. If a claim was expected, someone may have missed filing it.',
  orphan_claim: 'A claim wasn\'t matched to any POS row. The distributor may be asking for credit on a sale that never happened, or the POS report is incomplete.',
  quantity_mismatch: 'Total claim quantity differs from POS quantity beyond the configured tolerance (default ±5%).',
  price_mismatch: 'On a ship-and-debit claim, the POS resale price differs from the authorized price beyond tolerance. Suggests the distributor sold outside the authorized terms.',
  date_out_of_window: 'The claim period is unusually far from the POS ship date, but still within the hard cutoff. Might be a late-filed claim, or the wrong period was picked.',
  duplicate_claim: 'Multiple claims tie back to the same POS row. Could be legitimate splits, or a duplicate submission.',
};
