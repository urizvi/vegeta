/** Output type of a formula or sub-expression. */
export type ValueType = 'number' | 'text' | 'boolean';

/** Discriminated union for evaluator errors. */
export type EvalError =
  | { code: 'MISSING_FIELD';  fieldId: string }
  | { code: 'MISSING_VALUE';  fieldId: string }
  | { code: 'TYPE_MISMATCH';  detail: string }
  | { code: 'DIV_BY_ZERO' }
  | { code: 'BAD_FORMULA';    detail: string }
  | { code: 'CYCLE';          fieldId: string };

/** AST node union — all Tier 2 constructs. */
export type FormulaAst =
  | { kind: 'literal';  valueType: ValueType; value: number | string | boolean }
  | { kind: 'fieldRef'; fieldId: string }
  | { kind: 'binaryOp'; op: '+' | '-' | '*' | '/'; left: FormulaAst; right: FormulaAst }
  | { kind: 'compare';  op: '=' | '!=' | '<' | '>' | '<=' | '>='; left: FormulaAst; right: FormulaAst }
  | { kind: 'logical';  op: 'and' | 'or'; left: FormulaAst; right: FormulaAst }
  | { kind: 'not';      operand: FormulaAst }
  | { kind: 'if';       cond: FormulaAst; then: FormulaAst; else: FormulaAst };

export function isLiteral(n: FormulaAst): n is Extract<FormulaAst, { kind: 'literal' }> {
  return n.kind === 'literal';
}

export function isFieldRef(n: FormulaAst): n is Extract<FormulaAst, { kind: 'fieldRef' }> {
  return n.kind === 'fieldRef';
}

/** Walk the AST and call `visit` on every node (pre-order). */
export function walk(ast: FormulaAst, visit: (n: FormulaAst) => void): void {
  visit(ast);
  switch (ast.kind) {
    case 'literal':
    case 'fieldRef':
      return;
    case 'binaryOp':
    case 'compare':
    case 'logical':
      walk(ast.left, visit);
      walk(ast.right, visit);
      return;
    case 'not':
      walk(ast.operand, visit);
      return;
    case 'if':
      walk(ast.cond, visit);
      walk(ast.then, visit);
      walk(ast.else, visit);
      return;
  }
}

/** Collect the IDs of every field referenced by the AST (deduplicated, stable order). */
export function collectFieldRefs(ast: FormulaAst): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  walk(ast, (n) => {
    if (n.kind === 'fieldRef' && !seen.has(n.fieldId)) {
      seen.add(n.fieldId);
      out.push(n.fieldId);
    }
  });
  return out;
}
