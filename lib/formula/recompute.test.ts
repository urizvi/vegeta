import { describe, expect, it } from 'vitest';
import { topologicalFieldOrder, detectCycle, recomputeAccount } from './recompute';
import type { FormulaAst } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

const refArr: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
const refProb: FormulaAst = { kind: 'fieldRef', fieldId: 'f_prob' };

const baseDefs: FieldDefinition[] = ([
  { id: 'f_arr',  label: 'ARR',  type: 'metric', entity: 'account' },
  { id: 'f_prob', label: 'Prob', type: 'metric', entity: 'account' },
  { id: 'f_w',    label: 'Weighted', type: 'computed', entity: 'account', outputType: 'number',
    formula: { kind: 'binaryOp', op: '*', left: refArr, right: refProb } },
  { id: 'f_d',    label: 'Doubled',  type: 'computed', entity: 'account', outputType: 'number',
    formula: { kind: 'binaryOp', op: '*',
      left:  { kind: 'fieldRef', fieldId: 'f_w' },
      right: { kind: 'literal', valueType: 'number', value: 2 } } },
] as unknown) as FieldDefinition[];

describe('topologicalFieldOrder', () => {
  it('puts dependencies before dependents', () => {
    const order = topologicalFieldOrder(baseDefs);
    expect(order.indexOf('f_w')).toBeLessThan(order.indexOf('f_d'));
  });
  it('only returns computed field ids', () => {
    expect(topologicalFieldOrder(baseDefs).sort()).toEqual(['f_d', 'f_w']);
  });
});

describe('detectCycle', () => {
  it('returns null when no cycle', () => {
    expect(detectCycle(baseDefs)).toBeNull();
  });
  it('returns the cycling field id when present', () => {
    const cyclic: FieldDefinition[] = ([
      ...baseDefs,
      { id: 'f_x', label: 'X', type: 'computed', entity: 'account', outputType: 'number',
        formula: { kind: 'fieldRef', fieldId: 'f_y' } },
      { id: 'f_y', label: 'Y', type: 'computed', entity: 'account', outputType: 'number',
        formula: { kind: 'fieldRef', fieldId: 'f_x' } },
    ] as unknown) as FieldDefinition[];
    const c = detectCycle(cyclic);
    expect(c).not.toBeNull();
    expect(['f_x', 'f_y']).toContain(c);
  });
});

describe('recomputeAccount', () => {
  it('writes computed values into account.fields in topological order', () => {
    const acct: Account = { id: 'a1', name: 'Acme', repId: null, stageId: null, fields: { f_arr: 100, f_prob: 0.5 } };
    const next = recomputeAccount(acct, baseDefs);
    expect(next.fields.f_w).toBe(50);
    expect(next.fields.f_d).toBe(100);
  });
  it('leaves an erroring computed field undefined (not 0)', () => {
    const acct: Account = { id: 'a1', name: 'Acme', repId: null, stageId: null, fields: { f_arr: 100 } };
    const next = recomputeAccount(acct, baseDefs);
    expect(next.fields.f_w).toBeUndefined();
    expect(next.fields.f_d).toBeUndefined();
  });
});
