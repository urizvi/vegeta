// Map ingested Datasets (P1) to typed POS-recon entities (P2). This is
// the boundary layer: it takes a user-provided column mapping and turns
// generic Row objects into POSRecords / Claims. The P3 matching engine
// consumes the typed output.
//
// Deliberately no matching logic here — that's P3. This layer just does
// per-row projection + coercion + issue surfacing.

import type { Dataset, Row } from '@/ingestion/types';
import type {
  Claim,
  IsoDate,
  Money,
  POSRecord,
  PriceProtectionClaim,
  ShipAndDebitClaim,
} from './entities';

/** Mapping issues surface at the dataset→entity boundary. Distinct from
 *  ingestion's ValidationIssue, which surfaces at the file→dataset boundary. */
export interface MappingIssue {
  rowIndex: number;
  entityField: string;
  kind: 'missing_column' | 'empty_required' | 'type_coerce';
  message: string;
}

export interface MapResult<T> {
  entities: T[];
  issues: MappingIssue[];
}

// ─── POS records ──────────────────────────────────────────────────────

export interface POSRecordMapping {
  distributor: string;
  period: string;
  partNumber: string;
  endCustomer: string;
  shipDate: string;
  sellDate: string;
  quantity: string;
  resalePrice: string;
  extendedAmount: string;
  currency?: string;
  externalId?: string;
}

export function mapPOSRecords(dataset: Dataset, mapping: POSRecordMapping): MapResult<POSRecord> {
  const missing = missingColumns(dataset, mapping);
  if (missing.length > 0) {
    return { entities: [], issues: mappingMissingIssues(missing, mapping, dataset.name) };
  }

  const entities: POSRecord[] = [];
  const issues: MappingIssue[] = [];

  dataset.rows.forEach((row, i) => {
    const rec = tryBuildPOSRecord(row, i, mapping, dataset.id, issues);
    if (rec) entities.push(rec);
  });

  return { entities, issues };
}

function tryBuildPOSRecord(
  row: Row,
  rowIndex: number,
  m: POSRecordMapping,
  datasetId: string,
  issues: MappingIssue[],
): POSRecord | null {
  const distributor = coerceText(row[m.distributor], rowIndex, 'distributor', issues, true);
  const period = coerceDate(row[m.period], rowIndex, 'period', issues, true);
  const partNumber = coerceText(row[m.partNumber], rowIndex, 'partNumber', issues, true);
  const endCustomer = coerceText(row[m.endCustomer], rowIndex, 'endCustomer', issues, true);
  const shipDate = coerceDate(row[m.shipDate], rowIndex, 'shipDate', issues, true);
  const sellDate = coerceDate(row[m.sellDate], rowIndex, 'sellDate', issues, true);
  const quantity = coerceNumber(row[m.quantity], rowIndex, 'quantity', issues, true);
  const resalePrice = coerceMoney(row[m.resalePrice], rowIndex, 'resalePrice', issues, true);
  const extendedAmount = coerceMoney(row[m.extendedAmount], rowIndex, 'extendedAmount', issues, true);
  const currency = m.currency
    ? coerceText(row[m.currency], rowIndex, 'currency', issues, false) ?? 'USD'
    : 'USD';
  const externalId = m.externalId
    ? coerceText(row[m.externalId], rowIndex, 'externalId', issues, false) ?? undefined
    : undefined;

  if (
    distributor == null || period == null || partNumber == null ||
    endCustomer == null || shipDate == null || sellDate == null ||
    quantity == null || resalePrice == null || extendedAmount == null
  ) return null;

  return {
    id: `pos_${datasetId}_${rowIndex}`,
    externalId,
    distributor,
    period,
    partNumber,
    endCustomer,
    shipDate,
    sellDate,
    quantity,
    resalePrice,
    extendedAmount,
    currency,
    datasetId,
    sourceRowIndex: rowIndex,
  };
}

// ─── Claims ───────────────────────────────────────────────────────────

interface ClaimBaseMapping {
  distributor: string;
  period: string;
  partNumber: string;
  endCustomer: string;
  quantity: string;
  currency?: string;
  externalId?: string;
}

export interface ShipAndDebitMapping extends ClaimBaseMapping {
  costPrice: string;
  authorizedPrice: string;
  authorizationRef?: string;
}

export interface PriceProtectionMapping extends ClaimBaseMapping {
  originalPrice: string;
  newPrice: string;
  effectiveDate: string;
}

export function mapShipAndDebitClaims(
  dataset: Dataset,
  mapping: ShipAndDebitMapping,
): MapResult<ShipAndDebitClaim> {
  const missing = missingColumns(dataset, mapping);
  if (missing.length > 0) return { entities: [], issues: mappingMissingIssues(missing, mapping, dataset.name) };

  const entities: ShipAndDebitClaim[] = [];
  const issues: MappingIssue[] = [];

  dataset.rows.forEach((row, i) => {
    const base = tryBuildClaimBase(row, i, mapping, issues);
    const costPrice = coerceMoney(row[mapping.costPrice], i, 'costPrice', issues, true);
    const authorizedPrice = coerceMoney(row[mapping.authorizedPrice], i, 'authorizedPrice', issues, true);
    const authorizationRef = mapping.authorizationRef
      ? coerceText(row[mapping.authorizationRef], i, 'authorizationRef', issues, false) ?? undefined
      : undefined;

    if (!base || costPrice == null || authorizedPrice == null) return;

    entities.push({
      ...base,
      id: `sd_${dataset.id}_${i}`,
      type: 'ship_and_debit',
      datasetId: dataset.id,
      sourceRowIndex: i,
      costPrice,
      authorizedPrice,
      authorizationRef,
    });
  });

  return { entities, issues };
}

export function mapPriceProtectionClaims(
  dataset: Dataset,
  mapping: PriceProtectionMapping,
): MapResult<PriceProtectionClaim> {
  const missing = missingColumns(dataset, mapping);
  if (missing.length > 0) return { entities: [], issues: mappingMissingIssues(missing, mapping, dataset.name) };

  const entities: PriceProtectionClaim[] = [];
  const issues: MappingIssue[] = [];

  dataset.rows.forEach((row, i) => {
    const base = tryBuildClaimBase(row, i, mapping, issues);
    const originalPrice = coerceMoney(row[mapping.originalPrice], i, 'originalPrice', issues, true);
    const newPrice = coerceMoney(row[mapping.newPrice], i, 'newPrice', issues, true);
    const effectiveDate = coerceDate(row[mapping.effectiveDate], i, 'effectiveDate', issues, true);

    if (!base || originalPrice == null || newPrice == null || effectiveDate == null) return;

    entities.push({
      ...base,
      id: `pp_${dataset.id}_${i}`,
      type: 'price_protection',
      datasetId: dataset.id,
      sourceRowIndex: i,
      originalPrice,
      newPrice,
      effectiveDate,
    });
  });

  return { entities, issues };
}

/** Convenience wrapper for callers that don't want to import per-type
 *  mappers. Returns Claim[] under a discriminated union. */
export function mapClaims(
  dataset: Dataset,
  spec:
    | { type: 'ship_and_debit'; mapping: ShipAndDebitMapping }
    | { type: 'price_protection'; mapping: PriceProtectionMapping },
): MapResult<Claim> {
  if (spec.type === 'ship_and_debit') {
    return mapShipAndDebitClaims(dataset, spec.mapping);
  }
  return mapPriceProtectionClaims(dataset, spec.mapping);
}

function tryBuildClaimBase(
  row: Row,
  rowIndex: number,
  m: ClaimBaseMapping,
  issues: MappingIssue[],
): {
  externalId?: string;
  distributor: string;
  period: IsoDate;
  partNumber: string;
  endCustomer: string;
  quantity: number;
  currency: string;
} | null {
  const distributor = coerceText(row[m.distributor], rowIndex, 'distributor', issues, true);
  const period = coerceDate(row[m.period], rowIndex, 'period', issues, true);
  const partNumber = coerceText(row[m.partNumber], rowIndex, 'partNumber', issues, true);
  const endCustomer = coerceText(row[m.endCustomer], rowIndex, 'endCustomer', issues, true);
  const quantity = coerceNumber(row[m.quantity], rowIndex, 'quantity', issues, true);
  const currency = m.currency
    ? coerceText(row[m.currency], rowIndex, 'currency', issues, false) ?? 'USD'
    : 'USD';
  const externalId = m.externalId
    ? coerceText(row[m.externalId], rowIndex, 'externalId', issues, false) ?? undefined
    : undefined;

  if (distributor == null || period == null || partNumber == null ||
      endCustomer == null || quantity == null) return null;

  return { externalId, distributor, period, partNumber, endCustomer, quantity, currency };
}

// ─── Column presence + coercion helpers ───────────────────────────────

type MappingLike = Record<string, string | undefined>;

function missingColumns(dataset: Dataset, mapping: object): string[] {
  const cols = new Set(dataset.columns.filter((c) => !c.discarded).map((c) => c.key));
  const missing: string[] = [];
  for (const [entityField, columnKey] of Object.entries(mapping as MappingLike)) {
    if (!columnKey) continue;
    if (!cols.has(columnKey)) missing.push(entityField);
  }
  return missing;
}

function mappingMissingIssues(
  fields: string[],
  mapping: object,
  datasetName: string,
): MappingIssue[] {
  const m = mapping as MappingLike;
  return fields.map((entityField) => ({
    rowIndex: -1,
    entityField,
    kind: 'missing_column' as const,
    message: `Mapping references column "${m[entityField]}" which doesn't exist in "${datasetName}".`,
  }));
}

function coerceText(
  v: Row[string],
  rowIndex: number,
  entityField: string,
  issues: MappingIssue[],
  required: boolean,
): string | null {
  if (v === null || v === undefined || v === '') {
    if (required) issues.push({
      rowIndex, entityField, kind: 'empty_required',
      message: `${entityField} is required but empty.`,
    });
    return null;
  }
  if (typeof v === 'string') return v;
  return String(v);
}

function coerceNumber(
  v: Row[string],
  rowIndex: number,
  entityField: string,
  issues: MappingIssue[],
  required: boolean,
): number | null {
  if (v === null || v === undefined || v === '') {
    if (required) issues.push({
      rowIndex, entityField, kind: 'empty_required',
      message: `${entityField} is required but empty.`,
    });
    return null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? Number(v.trim().replace(/,/g, '')) : Number(v);
  if (!Number.isFinite(n)) {
    issues.push({
      rowIndex, entityField, kind: 'type_coerce',
      message: `${entityField} expected number, got ${describe(v)}.`,
    });
    return null;
  }
  return n;
}

function coerceMoney(
  v: Row[string],
  rowIndex: number,
  entityField: string,
  issues: MappingIssue[],
  required: boolean,
): Money | null {
  // Same coercion as number today; separate name reserves room for
  // currency-symbol stripping ("$1,234.50") without touching call sites.
  if (typeof v === 'string') {
    const stripped = v.replace(/[$€£¥]/g, '').trim();
    return coerceNumber(stripped, rowIndex, entityField, issues, required);
  }
  return coerceNumber(v, rowIndex, entityField, issues, required);
}

function coerceDate(
  v: Row[string],
  rowIndex: number,
  entityField: string,
  issues: MappingIssue[],
  required: boolean,
): IsoDate | null {
  if (v === null || v === undefined || v === '') {
    if (required) issues.push({
      rowIndex, entityField, kind: 'empty_required',
      message: `${entityField} is required but empty.`,
    });
    return null;
  }
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) {
    issues.push({
      rowIndex, entityField, kind: 'type_coerce',
      message: `${entityField} expected date, got ${describe(v)}.`,
    });
    return null;
  }
  // YYYY-MM-DD in UTC to avoid timezone drift.
  return d.toISOString().slice(0, 10);
}

function describe(v: unknown): string {
  if (v === null || v === undefined) return 'empty';
  if (typeof v === 'string') return `"${v.length > 32 ? v.slice(0, 32) + '…' : v}"`;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
