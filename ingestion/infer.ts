import type { ColumnType } from './types';

const BOOLEAN_TRUE = new Set(['true', 't', 'yes', 'y', '1']);
const BOOLEAN_FALSE = new Set(['false', 'f', 'no', 'n', '0']);

// Matches YYYY-MM-DD, YYYY/MM/DD, M/D/YYYY, D-M-YYYY, and ISO datetimes.
// Deliberately narrow — vague strings shouldn't infer as dates.
const DATE_LIKE = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Infer a ColumnType from a column's raw cells. Prefers the most specific
 * type that ALL non-null cells satisfy, falling back to text on any mix.
 * Empty columns default to text.
 */
export function inferColumnType(cells: readonly unknown[]): ColumnType {
  const nonNull = cells.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'text';

  let couldBeBoolean = true;
  let couldBeNumber = true;
  let couldBeDate = true;

  for (const v of nonNull) {
    if (!isBooleanLike(v)) couldBeBoolean = false;
    if (!isNumberLike(v)) couldBeNumber = false;
    if (!isDateLike(v)) couldBeDate = false;
    if (!couldBeBoolean && !couldBeNumber && !couldBeDate) return 'text';
  }

  // Priority: date > number > boolean > text.
  // Rationale: dates are the most specific (narrow regex), numbers next,
  // booleans last (since "0"/"1" also match number, prefer number).
  if (couldBeDate) return 'date';
  if (couldBeNumber) return 'number';
  if (couldBeBoolean) return 'boolean';
  return 'text';
}

function isBooleanLike(v: unknown): boolean {
  if (typeof v === 'boolean') return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return BOOLEAN_TRUE.has(s) || BOOLEAN_FALSE.has(s);
  }
  return false;
}

function isNumberLike(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    if (s === '') return false;
    return Number.isFinite(Number(s));
  }
  return false;
}

function isDateLike(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v === 'string') return DATE_LIKE.test(v.trim());
  return false;
}

/** Coerce a single cell to the declared column type. Returns null on empty
 *  or on coercion failure — callers decide whether that's an issue. */
export function coerceCell(raw: unknown, type: ColumnType): string | number | boolean | Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (type) {
    case 'text':
      return typeof raw === 'string' ? raw : String(raw);
    case 'number': {
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      const s = String(raw).trim().replace(/,/g, '');
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const s = String(raw).trim().toLowerCase();
      if (BOOLEAN_TRUE.has(s)) return true;
      if (BOOLEAN_FALSE.has(s)) return false;
      return null;
    }
    case 'date': {
      if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
}
