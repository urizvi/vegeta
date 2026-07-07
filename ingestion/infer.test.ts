import { describe, expect, it } from 'vitest';
import { inferColumnType, coerceCell } from './infer';

describe('inferColumnType', () => {
  it('infers number for clean numeric columns', () => {
    expect(inferColumnType([1, 2, 3])).toBe('number');
    expect(inferColumnType(['1', '2.5', '3'])).toBe('number');
    expect(inferColumnType(['1,000', '2,500'])).toBe('number');
  });

  it('infers date for ISO-ish strings and Date objects', () => {
    expect(inferColumnType(['2026-01-05', '2026-02-14'])).toBe('date');
    expect(inferColumnType([new Date('2026-01-05'), new Date('2026-02-14')])).toBe('date');
    expect(inferColumnType(['1/5/2026', '2/14/2026'])).toBe('date');
  });

  it('infers boolean for true/false-like strings', () => {
    expect(inferColumnType(['yes', 'no', 'YES'])).toBe('boolean');
    expect(inferColumnType([true, false, true])).toBe('boolean');
  });

  it('falls back to text on mixed types', () => {
    expect(inferColumnType(['1', 'not-a-number', '3'])).toBe('text');
    expect(inferColumnType(['2026-01-05', 'unknown'])).toBe('text');
  });

  it('treats empty/null cells as skippable', () => {
    expect(inferColumnType([null, '', 1, 2, null])).toBe('number');
  });

  it('defaults empty columns to text', () => {
    expect(inferColumnType([])).toBe('text');
    expect(inferColumnType([null, '', null])).toBe('text');
  });

  it('prefers number over boolean when 0/1 could be either', () => {
    expect(inferColumnType(['0', '1', '1', '0'])).toBe('number');
  });

  it('rejects vague strings as dates', () => {
    // "January 2026" style — DATE_LIKE regex is intentionally narrow.
    expect(inferColumnType(['January 2026', 'February 2026'])).toBe('text');
  });
});

describe('coerceCell', () => {
  it('coerces numbers, stripping commas', () => {
    expect(coerceCell('1,234.5', 'number')).toBe(1234.5);
    expect(coerceCell(42, 'number')).toBe(42);
  });

  it('returns null on empty', () => {
    expect(coerceCell(null, 'number')).toBeNull();
    expect(coerceCell('', 'text')).toBeNull();
  });

  it('returns null on coercion failure (not throwing)', () => {
    expect(coerceCell('not-a-number', 'number')).toBeNull();
    expect(coerceCell('maybe', 'boolean')).toBeNull();
    expect(coerceCell('not-a-date', 'date')).toBeNull();
  });

  it('coerces booleans via truthy/falsy synonyms', () => {
    expect(coerceCell('YES', 'boolean')).toBe(true);
    expect(coerceCell('no', 'boolean')).toBe(false);
    expect(coerceCell(true, 'boolean')).toBe(true);
  });

  it('coerces dates from strings and passes through Date', () => {
    const d = coerceCell('2026-01-05', 'date');
    expect(d).toBeInstanceOf(Date);
    const existing = new Date('2026-01-05');
    expect(coerceCell(existing, 'date')).toBe(existing);
  });

  it('coerces text by stringifying non-strings', () => {
    expect(coerceCell(42, 'text')).toBe('42');
    expect(coerceCell(true, 'text')).toBe('true');
  });
});
