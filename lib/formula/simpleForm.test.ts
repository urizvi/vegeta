import { describe, expect, it } from 'vitest';
import { simpleToAst, astToSimple, isExpressibleInSimple, type SimpleFormConfig } from './simpleForm';
import type { FormulaAst } from './ast';

describe('arithmetic shape', () => {
  const cfg: SimpleFormConfig = {
    shape: 'arithmetic',
    terms: [
      { kind: 'field', fieldId: 'f_arr' },
      { kind: 'op', op: '*' },
      { kind: 'field', fieldId: 'f_prob' },
    ],
  };
  it('compiles to a binaryOp AST', () => {
    expect(simpleToAst(cfg)).toMatchObject({ kind: 'binaryOp', op: '*' });
  });
  it('round-trips back via astToSimple', () => {
    const ast = simpleToAst(cfg);
    expect(astToSimple(ast)).toEqual(cfg);
  });
});

describe('bucket shape', () => {
  const cfg: SimpleFormConfig = {
    shape: 'bucket',
    fieldId: 'f_arr',
    op: '>',
    tiers: [
      { threshold: 100000, label: 'Enterprise' },
      { threshold: 10000,  label: 'Mid' },
    ],
    otherwise: 'SMB',
  };
  it('compiles to nested IF', () => {
    const ast = simpleToAst(cfg);
    expect(ast).toMatchObject({ kind: 'if', else: { kind: 'if' } });
  });
  it('round-trips back', () => {
    const ast = simpleToAst(cfg);
    expect(astToSimple(ast)).toEqual(cfg);
  });
});

describe('flag shape', () => {
  const cfg: SimpleFormConfig = {
    shape: 'flag',
    join: 'and',
    conditions: [
      { fieldId: 'f_score', op: '>', value: 70 },
      { fieldId: 'f_stage', op: '=', value: 'Demo' },
    ],
  };
  it('compiles to chained AND', () => {
    expect(simpleToAst(cfg)).toMatchObject({ kind: 'logical', op: 'and' });
  });
  it('round-trips back', () => {
    const ast = simpleToAst(cfg);
    expect(astToSimple(ast)).toEqual(cfg);
  });
});

describe('isExpressibleInSimple', () => {
  it('returns false for mixed AND/OR', () => {
    const ast: FormulaAst = {
      kind: 'logical', op: 'or',
      left:  { kind: 'logical', op: 'and',
        left:  { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'a' }, right: { kind: 'literal', valueType: 'number', value: 1 } },
        right: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'b' }, right: { kind: 'literal', valueType: 'number', value: 2 } } },
      right: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'c' }, right: { kind: 'literal', valueType: 'number', value: 3 } },
    };
    expect(isExpressibleInSimple(ast)).toBe(false);
  });
  it('returns false for NOT', () => {
    const ast: FormulaAst = { kind: 'not', operand: { kind: 'literal', valueType: 'boolean', value: true } };
    expect(isExpressibleInSimple(ast)).toBe(false);
  });
});
