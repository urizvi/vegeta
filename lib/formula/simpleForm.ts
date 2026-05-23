import type { FormulaAst } from './ast';

export type ArithOp = '+' | '-' | '*' | '/';
export type CompareOp = '=' | '!=' | '<' | '>' | '<=' | '>=';

export type ArithTerm =
  | { kind: 'field'; fieldId: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; op: ArithOp };

export interface ArithmeticShape {
  shape: 'arithmetic';
  terms: ArithTerm[]; // alternating value/op; length is odd ≥ 1
}

export interface BucketShape {
  shape: 'bucket';
  fieldId: string;
  op: CompareOp;
  tiers: Array<{ threshold: number; label: string }>;
  otherwise: string;
}

export interface FlagShape {
  shape: 'flag';
  join: 'and' | 'or';
  conditions: Array<{ fieldId: string; op: CompareOp; value: number | string | boolean }>;
}

export type SimpleFormConfig = ArithmeticShape | BucketShape | FlagShape;

// ── simpleToAst ──────────────────────────────────────────────────────────────

export function simpleToAst(cfg: SimpleFormConfig): FormulaAst {
  if (cfg.shape === 'arithmetic') return arithToAst(cfg);
  if (cfg.shape === 'bucket')     return bucketToAst(cfg);
  return flagToAst(cfg);
}

function termToAst(t: ArithTerm): FormulaAst {
  if (t.kind === 'field')  return { kind: 'fieldRef', fieldId: t.fieldId };
  if (t.kind === 'number') return { kind: 'literal', valueType: 'number', value: t.value };
  throw new Error('op term cannot be a value');
}

function arithToAst(cfg: ArithmeticShape): FormulaAst {
  type Item = { ast: FormulaAst } | { op: ArithOp };
  const flat: Item[] = cfg.terms.map((t) =>
    t.kind === 'op' ? { op: t.op } : { ast: termToAst(t) },
  );
  // First pass: collapse * and / left-to-right.
  let i = 1;
  while (i < flat.length) {
    const opItem = flat[i];
    if ('op' in opItem && (opItem.op === '*' || opItem.op === '/')) {
      const left  = flat[i - 1] as { ast: FormulaAst };
      const right = flat[i + 1] as { ast: FormulaAst };
      flat.splice(i - 1, 3, { ast: { kind: 'binaryOp', op: opItem.op, left: left.ast, right: right.ast } });
    } else {
      i += 2;
    }
  }
  // Second pass: left-fold + and -.
  let acc = (flat[0] as { ast: FormulaAst }).ast;
  for (let j = 1; j < flat.length; j += 2) {
    const op = (flat[j] as { op: ArithOp }).op;
    const next = (flat[j + 1] as { ast: FormulaAst }).ast;
    acc = { kind: 'binaryOp', op, left: acc, right: next };
  }
  return acc;
}

function bucketToAst(cfg: BucketShape): FormulaAst {
  let acc: FormulaAst = { kind: 'literal', valueType: 'text', value: cfg.otherwise };
  for (let i = cfg.tiers.length - 1; i >= 0; i--) {
    const t = cfg.tiers[i];
    acc = {
      kind: 'if',
      cond: { kind: 'compare', op: cfg.op,
        left:  { kind: 'fieldRef', fieldId: cfg.fieldId },
        right: { kind: 'literal', valueType: 'number', value: t.threshold } },
      then: { kind: 'literal', valueType: 'text', value: t.label },
      else: acc,
    };
  }
  return acc;
}

function flagToAst(cfg: FlagShape): FormulaAst {
  const conds: FormulaAst[] = cfg.conditions.map((c) => ({
    kind: 'compare', op: c.op,
    left:  { kind: 'fieldRef', fieldId: c.fieldId },
    right: { kind: 'literal',
             valueType: typeof c.value === 'number' ? 'number' : typeof c.value === 'boolean' ? 'boolean' : 'text',
             value: c.value },
  }));
  let acc = conds[0];
  for (let i = 1; i < conds.length; i++) {
    acc = { kind: 'logical', op: cfg.join, left: acc, right: conds[i] };
  }
  return acc;
}

// ── astToSimple ──────────────────────────────────────────────────────────────

export function astToSimple(ast: FormulaAst): SimpleFormConfig | null {
  return tryArith(ast) ?? tryBucket(ast) ?? tryFlag(ast);
}

function tryArith(ast: FormulaAst): ArithmeticShape | null {
  const terms: ArithTerm[] = [];
  function walk(n: FormulaAst): boolean {
    if (n.kind === 'fieldRef') { terms.push({ kind: 'field', fieldId: n.fieldId }); return true; }
    if (n.kind === 'literal' && n.valueType === 'number') {
      terms.push({ kind: 'number', value: n.value as number }); return true;
    }
    if (n.kind === 'binaryOp') {
      if (!walk(n.left)) return false;
      terms.push({ kind: 'op', op: n.op });
      if (n.right.kind === 'fieldRef') terms.push({ kind: 'field', fieldId: n.right.fieldId });
      else if (n.right.kind === 'literal' && n.right.valueType === 'number')
        terms.push({ kind: 'number', value: n.right.value as number });
      else return false;
      return true;
    }
    return false;
  }
  if (!walk(ast)) return null;
  return { shape: 'arithmetic', terms };
}

function tryBucket(ast: FormulaAst): BucketShape | null {
  if (ast.kind !== 'if') return null;
  const tiers: BucketShape['tiers'] = [];
  let fieldId: string | null = null;
  let op: CompareOp | null = null;
  let node: FormulaAst = ast;
  while (node.kind === 'if') {
    if (node.cond.kind !== 'compare') return null;
    if (node.cond.left.kind !== 'fieldRef') return null;
    if (node.cond.right.kind !== 'literal' || node.cond.right.valueType !== 'number') return null;
    if (node.then.kind !== 'literal' || node.then.valueType !== 'text') return null;
    fieldId ??= node.cond.left.fieldId;
    op ??= node.cond.op;
    if (node.cond.left.fieldId !== fieldId || node.cond.op !== op) return null;
    tiers.push({ threshold: node.cond.right.value as number, label: node.then.value as string });
    node = node.else;
  }
  if (node.kind !== 'literal' || node.valueType !== 'text') return null;
  return { shape: 'bucket', fieldId: fieldId!, op: op!, tiers, otherwise: node.value as string };
}

function tryFlag(ast: FormulaAst): FlagShape | null {
  if (ast.kind !== 'logical' && ast.kind !== 'compare') return null;
  const conds: FlagShape['conditions'] = [];
  let join: 'and' | 'or' | null = null;
  function walk(n: FormulaAst): boolean {
    if (n.kind === 'logical') {
      if (join !== null && n.op !== join) return false;
      join = n.op;
      if (!walk(n.left)) return false;
      if (n.right.kind !== 'compare') return false;
      return walk(n.right);
    }
    if (n.kind === 'compare') {
      if (n.left.kind !== 'fieldRef') return false;
      if (n.right.kind !== 'literal') return false;
      conds.push({ fieldId: n.left.fieldId, op: n.op, value: n.right.value as number | string | boolean });
      return true;
    }
    return false;
  }
  if (!walk(ast)) return null;
  return { shape: 'flag', join: join ?? 'and', conditions: conds };
}

export function isExpressibleInSimple(ast: FormulaAst): boolean {
  return astToSimple(ast) !== null;
}
