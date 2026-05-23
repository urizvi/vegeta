import type { FieldDefinition } from './accountFields';
import { parseCSV } from './csvParser';

// ── Excel / CSV parsing ───────────────────────────────────────────────────────

/** Parse an Excel file (ArrayBuffer) into rows keyed by lowercased header. */
export async function parseExcel(buffer: ArrayBuffer): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return raw.map((row) => {
    const record: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      record[k.toLowerCase().trim()] = String(v ?? '').trim();
    });
    return record;
  });
}

/** Parse a text file as CSV, normalising headers to lowercase. */
export function parseTextFile(text: string): Record<string, string>[] {
  return parseCSV(text); // csvParser already lowercases headers
}

// ── Field inference ───────────────────────────────────────────────────────────

/** Infer a FieldDefinition (minus id) from a column header + sample values. */
export function inferField(
  header: string,
  values: string[],
): Omit<FieldDefinition, 'id'> {
  const label = header; // preserve original casing as the label
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);

  if (nonEmpty.length === 0) return { label, type: 'text', entity: 'account' };

  // Numeric check
  const hasCurrency = nonEmpty.some((v) => /[$€£¥]/.test(v));
  const numericCount = nonEmpty.filter((v) =>
    !isNaN(parseFloat(v.replace(/[$€£¥,\s]/g, ''))),
  ).length;
  if (numericCount / nonEmpty.length > 0.8) {
    return { label, type: 'metric', isCurrency: hasCurrency, entity: 'account' };
  }

  // Categorical check — low cardinality, values repeat
  const unique = [...new Set(nonEmpty.map((v) => v))];
  if (unique.length <= 20 && unique.length / nonEmpty.length < 0.4) {
    return { label, type: 'categorical', options: unique, entity: 'account' };
  }

  return { label, type: 'text', entity: 'account' };
}

// ── Column reconciliation ─────────────────────────────────────────────────────

const STATIC_ALIASES = new Set([
  'name', 'account', 'company', 'account name', 'company name', 'account_name', 'company_name',
  'country', 'country code', 'country_code', 'iso2', 'iso', 'country_iso',
  'state', 'province', 'state/province', 'state_province',
  'rep', 'sales rep', 'owner', 'account owner', 'assigned to', 'assigned_to', 'sales_rep',
]);

export interface ReconcileResult {
  /** Existing fieldDefs matched by a column in the file. */
  matched: FieldDefinition[];
  /** Inferred new field defs for columns not matched to existing defs. */
  incoming: Omit<FieldDefinition, 'id'>[];
  /** Existing fieldDefs that have no column in the file. */
  orphaned: FieldDefinition[];
  /** Whether any action is needed (i.e. there are new or orphaned fields). */
  needsReconcile: boolean;
}

/**
 * Compare file headers against the current fieldDefs to find what's new,
 * what matched, and what's missing from the file.
 *
 * @param headers      Lowercased header keys from the parsed file.
 * @param fieldDefs    Current field definitions from the store.
 * @param rows         Sample rows used for type inference on new columns.
 */
export function reconcileColumns(
  headers: string[],
  fieldDefs: FieldDefinition[],
  rows: Record<string, string>[],
): ReconcileResult {
  const matched: FieldDefinition[] = [];
  const incomingHeaders: string[] = [];

  headers.forEach((header) => {
    const h = header.toLowerCase().trim();
    if (STATIC_ALIASES.has(h)) return; // skip static columns

    const existing = fieldDefs.find(
      (d) => d.label.toLowerCase() === h || d.id.toLowerCase() === h,
    );
    if (existing) {
      matched.push(existing);
    } else {
      incomingHeaders.push(header);
    }
  });

  const matchedIds = new Set(matched.map((d) => d.id));
  const orphaned = fieldDefs.filter((d) => !matchedIds.has(d.id));

  // Infer types for new columns from sample values (first 100 rows)
  const sampleRows = rows.slice(0, 100);
  const incoming: Omit<FieldDefinition, 'id'>[] = incomingHeaders.map((header) => {
    const colKey = header.toLowerCase().trim();
    const values = sampleRows.map((r) => r[colKey] ?? '');
    return inferField(header, values);
  });

  return {
    matched,
    incoming,
    orphaned,
    needsReconcile: incoming.length > 0 || orphaned.length > 0,
  };
}
