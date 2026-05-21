import { describe, expect, it } from 'vitest';
import { evaluate, type EvalResult } from './evaluate';
import type { FormulaAst } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

const defs: FieldDefinition[] = [
  { id: 'f_arr',   label: 'ARR',         type: 'metric',      entity: 'account', isCurrency: true },
  { id: 'f_prob',  label: 'Probability', type: 'metric',      entity: 'account' },
  { id: 'f_stage', label: 'Stage',       type: 'categorical', entity: 'account', options: ['Demo', 'Won'] },
  { id: 'f_name',  label: 'Notes',       type: 'text',        entity: 'account' },
];

function acct(fields: Record<string, string | number | boolean>): Account {
  return { id: 'a1', name: 'Acme', repId: null, stageId: null, fields: fields as Account['fields'] };
}

const OK = (r: EvalResult, v: number | string | boolean) => {
  expect(r).toEqual({ ok: true, value: v });
};

describe('evaluate — arithmetic', () => {
  it('adds two metric fields', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'f_arr' },
      right: { kind: 'fieldRef', fieldId: 'f_prob' },
    };
    OK(evaluate(ast, acct({ f_arr: 100, f_prob: 50 }), defs), 150);
  });
  it('reports DIV_BY_ZERO', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '/',
      left:  { kind: 'literal', valueType: 'number', value: 10 },
      right: { kind: 'fieldRef', fieldId: 'f_prob' },
    };
    expect(evaluate(ast, acct({ f_prob: 0 }), defs)).toEqual({ ok: false, error: { code: 'DIV_BY_ZERO' } });
  });
});

describe('evaluate — missing values', () => {
  it('returns MISSING_VALUE when a referenced field is unset', () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
    const r = evaluate(ast, acct({}), defs);
    expect(r).toEqual({ ok: false, error: { code: 'MISSING_VALUE', fieldId: 'f_arr' } });
  });
  it("treats '' as missing", () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
    expect(evaluate(ast, acct({ f_arr: '' }), defs)).toMatchObject({ ok: false, error: { code: 'MISSING_VALUE' } });
  });
  it('returns MISSING_FIELD when the AST references a deleted field', () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_gone' };
    expect(evaluate(ast, acct({}), defs)).toEqual({ ok: false, error: { code: 'MISSING_FIELD', fieldId: 'f_gone' } });
  });
});

describe('evaluate — type rules', () => {
  it('rejects text in arithmetic with TYPE_MISMATCH', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'f_name' },
      right: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(evaluate(ast, acct({ f_name: 'hi' }), defs)).toMatchObject({ ok: false, error: { code: 'TYPE_MISMATCH' } });
  });
});

describe('evaluate — IF / AND / OR', () => {
  it('IF picks the then branch when cond is true', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'compare', op: '>',
        left: { kind: 'fieldRef', fieldId: 'f_arr' },
        right: { kind: 'literal', valueType: 'number', value: 100000 } },
      then: { kind: 'literal', valueType: 'text', value: 'Ent' },
      else: { kind: 'literal', valueType: 'text', value: 'SMB' },
    };
    OK(evaluate(ast, acct({ f_arr: 200000 }), defs), 'Ent');
  });
  it('AND short-circuits — does not evaluate RHS when LHS is false', () => {
    // RHS would divide by zero; if AND short-circuits we never hit it.
    const ast: FormulaAst = {
      kind: 'logical', op: 'and',
      left:  { kind: 'literal', valueType: 'boolean', value: false },
      right: { kind: 'compare', op: '>',
        left:  { kind: 'binaryOp', op: '/',
          left:  { kind: 'literal', valueType: 'number', value: 1 },
          right: { kind: 'literal', valueType: 'number', value: 0 } },
        right: { kind: 'literal', valueType: 'number', value: 0 } },
    };
    OK(evaluate(ast, acct({}), defs), false);
  });
  it('OR short-circuits — does not evaluate RHS when LHS is true', () => {
    const ast: FormulaAst = {
      kind: 'logical', op: 'or',
      left:  { kind: 'literal', valueType: 'boolean', value: true },
      right: { kind: 'binaryOp', op: '/',
        left:  { kind: 'literal', valueType: 'number', value: 1 },
        right: { kind: 'literal', valueType: 'number', value: 0 } },
    };
    OK(evaluate(ast, acct({}), defs), true);
  });
});

describe('evaluate — missing-value short-circuit inside IF', () => {
  it('missing value in cond propagates as MISSING_VALUE, not 0', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'compare', op: '>',
        left: { kind: 'fieldRef', fieldId: 'f_arr' },
        right: { kind: 'literal', valueType: 'number', value: 100 } },
      then: { kind: 'literal', valueType: 'text', value: 'big' },
      else: { kind: 'literal', valueType: 'text', value: 'small' },
    };
    expect(evaluate(ast, acct({}), defs)).toMatchObject({ ok: false, error: { code: 'MISSING_VALUE' } });
  });
});
