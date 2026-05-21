import { describe, expect, it } from 'vitest';
import { parse, prettyPrint } from './parse';
import type { FormulaAst } from './ast';

const refs = { ARR: 'f_arr', Score: 'f_score', Stage: 'f_stage', Probability: 'f_prob' };

function parseOk(src: string): FormulaAst {
  const r = parse(src, { nameToId: refs });
  if (!r.ok) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
  return r.ast;
}

describe('parse — literals', () => {
  it('parses a number', () => {
    expect(parseOk('42')).toEqual({ kind: 'literal', valueType: 'number', value: 42 });
  });
  it('parses a negative number', () => {
    expect(parseOk('-3.5')).toEqual({ kind: 'literal', valueType: 'number', value: -3.5 });
  });
  it('parses a single-quoted string', () => {
    expect(parseOk("'Enterprise'")).toEqual({ kind: 'literal', valueType: 'text', value: 'Enterprise' });
  });
  it('parses booleans', () => {
    expect(parseOk('true')).toEqual({ kind: 'literal', valueType: 'boolean', value: true });
    expect(parseOk('false')).toEqual({ kind: 'literal', valueType: 'boolean', value: false });
  });
});

describe('parse — field refs', () => {
  it('resolves {ARR} to its field id', () => {
    expect(parseOk('{ARR}')).toEqual({ kind: 'fieldRef', fieldId: 'f_arr' });
  });
  it('errors on an unknown field name', () => {
    const r = parse('{Nope}', { nameToId: refs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'UNKNOWN_FIELD', name: 'Nope' });
  });
});

describe('parse — arithmetic precedence', () => {
  it('multiplies before adding', () => {
    const ast = parseOk('{ARR} + {Probability} * 2');
    expect(ast).toMatchObject({
      kind: 'binaryOp', op: '+',
      right: { kind: 'binaryOp', op: '*' },
    });
  });
  it('parentheses override precedence', () => {
    const ast = parseOk('({ARR} + {Probability}) * 2');
    expect(ast).toMatchObject({ kind: 'binaryOp', op: '*' });
  });
});

describe('parse — IF / AND / OR / NOT / comparisons', () => {
  it('parses a nested IF', () => {
    const ast = parseOk("IF({ARR} > 100000, 'Ent', IF({ARR} > 10000, 'Mid', 'SMB'))");
    expect(ast).toMatchObject({
      kind: 'if',
      cond: { kind: 'compare', op: '>' },
      else: { kind: 'if' },
    });
  });
  it('AND has lower precedence than comparisons', () => {
    const ast = parseOk('{Score} > 70 AND {Stage} = \'Demo\'');
    expect(ast).toMatchObject({
      kind: 'logical', op: 'and',
      left:  { kind: 'compare', op: '>' },
      right: { kind: 'compare', op: '=' },
    });
  });
  it('NOT applies to the next term', () => {
    const ast = parseOk('NOT ({Score} > 70)');
    expect(ast).toMatchObject({ kind: 'not', operand: { kind: 'compare', op: '>' } });
  });
});

describe('parse — error reporting', () => {
  it('reports a parse error with position', () => {
    const r = parse('{ARR} + ', { nameToId: refs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'UNEXPECTED_EOF' });
  });
  it('reports a stray token with column', () => {
    const r = parse('{ARR} ** 2', { nameToId: refs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'UNEXPECTED_TOKEN', col: 6 });
  });
});

describe('prettyPrint', () => {
  const idToName = Object.fromEntries(Object.entries(refs).map(([n, id]) => [id, n]));
  it('round-trips a simple AST', () => {
    const src = '{ARR} * {Probability}';
    const ast = parseOk(src);
    expect(prettyPrint(ast, { idToName })).toBe(src);
  });
  it('preserves nesting via parentheses where precedence requires it', () => {
    const src = '({ARR} + 1) * 2';
    expect(prettyPrint(parseOk(src), { idToName })).toBe(src);
  });
});
