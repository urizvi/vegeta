import { describe, expect, it } from 'vitest';
import { isLiteral, isFieldRef, type FormulaAst } from './ast';

describe('AST type guards', () => {
  it('isLiteral matches a literal node', () => {
    const n: FormulaAst = { kind: 'literal', valueType: 'number', value: 7 };
    expect(isLiteral(n)).toBe(true);
    expect(isFieldRef(n)).toBe(false);
  });
  it('isFieldRef matches a field reference', () => {
    const n: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
    expect(isFieldRef(n)).toBe(true);
    expect(isLiteral(n)).toBe(false);
  });
});

import { walk, collectFieldRefs } from './ast';

describe('walk', () => {
  it('visits every node pre-order', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'a' },
      right: { kind: 'fieldRef', fieldId: 'b' },
    };
    const kinds: string[] = [];
    walk(ast, (n) => kinds.push(n.kind));
    expect(kinds).toEqual(['binaryOp', 'fieldRef', 'fieldRef']);
  });
});

describe('collectFieldRefs', () => {
  it('returns unique field ids in pre-order', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'a' }, right: { kind: 'literal', valueType: 'number', value: 0 } },
      then: { kind: 'fieldRef', fieldId: 'b' },
      else: { kind: 'fieldRef', fieldId: 'a' },
    };
    expect(collectFieldRefs(ast)).toEqual(['a', 'b']);
  });
});
