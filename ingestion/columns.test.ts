import { describe, expect, it } from 'vitest';
import { initialColumns } from './columns';
import type { ParsedSheet } from './types';

const sheet = (headers: string[], rows: unknown[][]): ParsedSheet => ({
  headers,
  rows: rows as ParsedSheet['rows'],
  otherSheets: [],
});

describe('initialColumns', () => {
  it('derives one column per header with slugified stable keys', () => {
    const cols = initialColumns(sheet(['Customer Name', 'ARR ($)'], [['Acme', 1000]]));
    expect(cols.map((c) => c.key)).toEqual(['customer_name', 'arr']);
    expect(cols.map((c) => c.sourceHeader)).toEqual(['Customer Name', 'ARR ($)']);
    expect(cols.map((c) => c.label)).toEqual(['Customer Name', 'ARR ($)']);
  });

  it('disambiguates duplicate slug collisions', () => {
    const cols = initialColumns(sheet(['Amount', 'amount'], [[1, 2]]));
    expect(cols.map((c) => c.key)).toEqual(['amount', 'amount_2']);
  });

  it('falls back to col_N when a header slugifies to empty', () => {
    const cols = initialColumns(sheet(['---', 'Name'], [['x', 'y']]));
    expect(cols[0]!.key).toBe('col_1');
  });

  it('infers each column type independently', () => {
    const cols = initialColumns(
      sheet(
        ['name', 'revenue', 'active', 'closed_on'],
        [
          ['Acme', 1000, 'yes', '2026-01-05'],
          ['Beta', 2500, 'no', '2026-02-14'],
        ],
      ),
    );
    expect(cols.map((c) => c.type)).toEqual(['text', 'number', 'boolean', 'date']);
  });

  it('defaults required=false and discarded=false', () => {
    const [col] = initialColumns(sheet(['x'], [[1]]));
    expect(col!.required).toBe(false);
    expect(col!.discarded).toBe(false);
  });
});
