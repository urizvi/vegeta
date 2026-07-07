import { describe, expect, it } from 'vitest';
import { buildDataset } from './validate';
import type { Column, ParsedSheet } from './types';

const col = (over: Partial<Column>): Column => ({
  key: 'x',
  sourceHeader: 'x',
  label: 'x',
  type: 'text',
  required: false,
  discarded: false,
  ...over,
});

const sheet = (headers: string[], rows: unknown[][]): ParsedSheet => ({
  headers,
  rows: rows as ParsedSheet['rows'],
  otherSheets: [],
});

describe('buildDataset', () => {
  it('coerces rows to typed row objects keyed by column.key', () => {
    const s = sheet(['Amount'], [['1,000'], ['2500']]);
    const cols = [col({ key: 'amount', sourceHeader: 'Amount', label: 'Amount', type: 'number' })];
    const { rows, issues } = buildDataset(s, cols);
    expect(rows).toEqual([{ amount: 1000 }, { amount: 2500 }]);
    expect(issues).toEqual([]);
  });

  it('emits type_mismatch when a non-empty cell fails coercion', () => {
    const s = sheet(['Amount'], [['1000'], ['N/A']]);
    const cols = [col({ key: 'amount', sourceHeader: 'Amount', label: 'Amount', type: 'number' })];
    const { rows, issues } = buildDataset(s, cols);
    expect(rows).toEqual([{ amount: 1000 }, { amount: null }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      rowIndex: 1,
      columnKey: 'amount',
      kind: 'type_mismatch',
    });
    expect(issues[0]!.message).toContain('Amount expected number');
  });

  it('emits empty_required only when column.required is true', () => {
    const s = sheet(['Name'], [[null], ['Acme']]);
    const notRequired = buildDataset(s, [col({ key: 'name', sourceHeader: 'Name', label: 'Name' })]);
    expect(notRequired.issues).toEqual([]);

    const required = buildDataset(s, [
      col({ key: 'name', sourceHeader: 'Name', label: 'Name', required: true }),
    ]);
    expect(required.issues).toHaveLength(1);
    expect(required.issues[0]!.kind).toBe('empty_required');
  });

  it('drops discarded columns from row output but still walks source data', () => {
    const s = sheet(['A', 'B'], [[1, 2]]);
    const cols = [
      col({ key: 'a', sourceHeader: 'A', label: 'A', type: 'number' }),
      col({ key: 'b', sourceHeader: 'B', label: 'B', type: 'number', discarded: true }),
    ];
    const { rows } = buildDataset(s, cols);
    expect(rows).toEqual([{ a: 1 }]);
  });

  it('handles missing source columns gracefully (nulls, not crashes)', () => {
    const s = sheet(['A'], [[1]]);
    const cols = [
      col({ key: 'a', sourceHeader: 'A', label: 'A', type: 'number' }),
      col({ key: 'b', sourceHeader: 'MISSING', label: 'Missing', type: 'number' }),
    ];
    const { rows, issues } = buildDataset(s, cols);
    expect(rows).toEqual([{ a: 1, b: null }]);
    expect(issues).toEqual([]);
  });
});
