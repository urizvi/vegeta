import type { Column, ParsedSheet, Row, ValidationIssue } from './types';
import { coerceCell } from './infer';

export interface BuildDatasetResult {
  rows: Row[];
  issues: ValidationIssue[];
}

/**
 * Given a parsed sheet and the (user-approved) column definitions, produce
 * the typed rows plus any validation issues.
 *
 * Discarded columns are dropped from the row objects. Type mismatches and
 * empty-required cells produce ValidationIssues; the row still lands in
 * the result (with null for the failed cell) so the user can inspect
 * everything in one pass. That's a deliberate P1 choice — filtering bad
 * rows is P2/P3 concern.
 */
export function buildDataset(sheet: ParsedSheet, columns: Column[]): BuildDatasetResult {
  const activeColumns = columns.filter((c) => !c.discarded);
  const rows: Row[] = [];
  const issues: ValidationIssue[] = [];

  for (let r = 0; r < sheet.rows.length; r++) {
    const rawRow = sheet.rows[r];
    if (!rawRow) continue;
    const out: Row = {};
    for (const col of activeColumns) {
      // Column key is stable; source position is preserved by the header index.
      const sourceIndex = sheet.headers.indexOf(col.sourceHeader);
      const raw = sourceIndex >= 0 ? rawRow[sourceIndex] : null;
      const coerced = coerceCell(raw, col.type);

      if (coerced === null) {
        // Distinguish "empty" from "coercion failed".
        const wasEmpty = raw === null || raw === undefined || raw === '';
        if (wasEmpty) {
          if (col.required) {
            issues.push({
              rowIndex: r,
              columnKey: col.key,
              kind: 'empty_required',
              message: `${col.label} is required but empty.`,
              rawValue: raw,
            });
          }
        } else {
          issues.push({
            rowIndex: r,
            columnKey: col.key,
            kind: 'type_mismatch',
            message: `${col.label} expected ${col.type}, got ${describeValue(raw)}.`,
            rawValue: raw,
          });
        }
      }
      out[col.key] = coerced;
    }
    rows.push(out);
  }
  return { rows, issues };
}

function describeValue(v: unknown): string {
  if (v === null || v === undefined) return 'empty';
  if (typeof v === 'string') return `"${v.length > 32 ? v.slice(0, 32) + '…' : v}"`;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
