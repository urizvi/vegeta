import type { FormulaAst, EvalError, ValueType } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';

export type InferResult =
  | { ok: true; type: ValueType }
  | { ok: false; error: EvalError };

const ok = (type: ValueType): InferResult => ({ ok: true, type });
const err = (error: EvalError): InferResult => ({ ok: false, error });

export function inferType(ast: FormulaAst, defs: FieldDefinition[]): InferResult {
  switch (ast.kind) {
    case 'literal':
      return ok(ast.valueType);

    case 'fieldRef': {
      const d = defs.find((x) => x.id === ast.fieldId);
      if (!d) return err({ code: 'MISSING_FIELD', fieldId: ast.fieldId });
      const t = (d as { type: string }).type;
      const outputType = (d as { outputType?: ValueType }).outputType;
      if (t === 'metric') return ok('number');
      if (t === 'text' || t === 'categorical') return ok('text');
      if (t === 'computed') return ok(outputType ?? 'number');
      return err({ code: 'BAD_FORMULA', detail: 'unknown field type' });
    }

    case 'binaryOp': {
      const l = inferType(ast.left, defs);
      if (!l.ok) return l;
      const r = inferType(ast.right, defs);
      if (!r.ok) return r;
      if (l.type !== 'number' || r.type !== 'number')
        return err({ code: 'TYPE_MISMATCH', detail: 'arithmetic requires numbers' });
      return ok('number');
    }

    case 'compare': {
      const l = inferType(ast.left, defs);
      if (!l.ok) return l;
      const r = inferType(ast.right, defs);
      if (!r.ok) return r;
      if (l.type !== r.type)
        return err({ code: 'TYPE_MISMATCH', detail: 'compare operands differ' });
      if ((ast.op === '<' || ast.op === '>' || ast.op === '<=' || ast.op === '>=') && l.type !== 'number')
        return err({ code: 'TYPE_MISMATCH', detail: 'ordering requires numbers' });
      return ok('boolean');
    }

    case 'logical': {
      const l = inferType(ast.left, defs);
      if (!l.ok) return l;
      const r = inferType(ast.right, defs);
      if (!r.ok) return r;
      if (l.type !== 'boolean' || r.type !== 'boolean')
        return err({ code: 'TYPE_MISMATCH', detail: 'AND/OR require booleans' });
      return ok('boolean');
    }

    case 'not': {
      const r = inferType(ast.operand, defs);
      if (!r.ok) return r;
      if (r.type !== 'boolean') return err({ code: 'TYPE_MISMATCH', detail: 'NOT requires boolean' });
      return ok('boolean');
    }

    case 'if': {
      const c = inferType(ast.cond, defs);
      if (!c.ok) return c;
      if (c.type !== 'boolean') return err({ code: 'TYPE_MISMATCH', detail: 'IF condition must be boolean' });
      const t = inferType(ast.then, defs);
      if (!t.ok) return t;
      const e = inferType(ast.else, defs);
      if (!e.ok) return e;
      if (t.type !== e.type) return err({ code: 'TYPE_MISMATCH', detail: 'IF branches must match' });
      return ok(t.type);
    }
  }
}
