import { describe, expect, it } from 'vitest';
import { inferType } from './typeCheck';
import type { FormulaAst } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';

const defs: FieldDefinition[] = (
  [
    { id: 'f_arr', label: 'ARR', type: 'metric', entity: 'account' },
    { id: 'f_name', label: 'Name', type: 'text', entity: 'account' },
    { id: 'f_tier', label: 'Tier', type: 'computed', entity: 'account', outputType: 'text' },
  ] as unknown
) as FieldDefinition[];

describe('inferType', () => {
  it('infers number for arithmetic on metric fields', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp',
      op: '+',
      left: { kind: 'fieldRef', fieldId: 'f_arr' },
      right: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(inferType(ast, defs)).toEqual({ ok: true, type: 'number' });
  });

  it('rejects text + number with TYPE_MISMATCH', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp',
      op: '+',
      left: { kind: 'fieldRef', fieldId: 'f_name' },
      right: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(inferType(ast, defs)).toMatchObject({ ok: false, error: { code: 'TYPE_MISMATCH' } });
  });

  it('infers text from IF returning two text literals', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: {
        kind: 'compare',
        op: '>',
        left: { kind: 'fieldRef', fieldId: 'f_arr' },
        right: { kind: 'literal', valueType: 'number', value: 0 },
      },
      then: { kind: 'literal', valueType: 'text', value: 'a' },
      else: { kind: 'literal', valueType: 'text', value: 'b' },
    };
    expect(inferType(ast, defs)).toEqual({ ok: true, type: 'text' });
  });

  it('rejects IF with mismatched branch types', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'literal', valueType: 'boolean', value: true },
      then: { kind: 'literal', valueType: 'text', value: 'a' },
      else: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(inferType(ast, defs)).toMatchObject({ ok: false, error: { code: 'TYPE_MISMATCH' } });
  });

  it('reads outputType from a referenced computed field', () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_tier' };
    expect(inferType(ast, defs)).toEqual({ ok: true, type: 'text' });
  });
});
