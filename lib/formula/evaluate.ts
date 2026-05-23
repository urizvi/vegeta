import type { FormulaAst, EvalError, ValueType } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

export type EvalResult =
  | { ok: true;  value: number | string | boolean }
  | { ok: false; error: EvalError };

const ok  = (value: number | string | boolean): EvalResult => ({ ok: true, value });
const err = (error: EvalError): EvalResult => ({ ok: false, error });

function fieldTypeToValueType(t: FieldDefinition['type'], output?: ValueType): ValueType {
  if (t === 'metric') return 'number';
  if ((t as string) === 'computed') return output ?? 'number';
  return 'text'; // categorical & text both produce strings
}

function asNumber(r: EvalResult, who: string): EvalResult {
  if (!r.ok) return r;
  if (typeof r.value !== 'number') return err({ code: 'TYPE_MISMATCH', detail: `${who} expected number, got ${typeof r.value}` });
  return r;
}
function asBoolean(r: EvalResult, who: string): EvalResult {
  if (!r.ok) return r;
  if (typeof r.value !== 'boolean') return err({ code: 'TYPE_MISMATCH', detail: `${who} expected boolean, got ${typeof r.value}` });
  return r;
}

export function evaluate(
  ast: FormulaAst,
  account: Account,
  fieldDefs: FieldDefinition[],
): EvalResult {
  switch (ast.kind) {
    case 'literal':
      return ok(ast.value);

    case 'fieldRef': {
      const def = fieldDefs.find((d) => d.id === ast.fieldId);
      if (!def) return err({ code: 'MISSING_FIELD', fieldId: ast.fieldId });
      const raw = (account.fields as Record<string, string | number | boolean | undefined>)[ast.fieldId];
      if (raw === undefined || raw === null || raw === '') return err({ code: 'MISSING_VALUE', fieldId: ast.fieldId });
      // Coerce by declared type
      const vt = fieldTypeToValueType(def.type, (def as { outputType?: ValueType }).outputType);
      if (vt === 'number') {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) return err({ code: 'TYPE_MISMATCH', detail: `${def.label} is not numeric` });
        return ok(n);
      }
      if (vt === 'boolean') {
        if (typeof raw === 'boolean') return ok(raw);
        return err({ code: 'TYPE_MISMATCH', detail: `${def.label} is not boolean` });
      }
      return ok(String(raw));
    }

    case 'binaryOp': {
      const l = asNumber(evaluate(ast.left, account, fieldDefs), 'arithmetic LHS');
      if (!l.ok) return l;
      const r = asNumber(evaluate(ast.right, account, fieldDefs), 'arithmetic RHS');
      if (!r.ok) return r;
      const a = l.value as number;
      const b = r.value as number;
      switch (ast.op) {
        case '+': return ok(a + b);
        case '-': return ok(a - b);
        case '*': return ok(a * b);
        case '/': return b === 0 ? err({ code: 'DIV_BY_ZERO' }) : ok(a / b);
      }
      return err({ code: 'BAD_FORMULA', detail: 'unknown binaryOp' });
    }

    case 'compare': {
      const l = evaluate(ast.left,  account, fieldDefs); if (!l.ok) return l;
      const r = evaluate(ast.right, account, fieldDefs); if (!r.ok) return r;
      if (typeof l.value !== typeof r.value) {
        return err({ code: 'TYPE_MISMATCH', detail: `cannot compare ${typeof l.value} with ${typeof r.value}` });
      }
      if ((ast.op === '<' || ast.op === '>' || ast.op === '<=' || ast.op === '>=') && typeof l.value !== 'number') {
        return err({ code: 'TYPE_MISMATCH', detail: 'ordering requires numbers' });
      }
      switch (ast.op) {
        case '=':  return ok(l.value === r.value);
        case '!=': return ok(l.value !== r.value);
        case '<':  return ok((l.value as number) <  (r.value as number));
        case '>':  return ok((l.value as number) >  (r.value as number));
        case '<=': return ok((l.value as number) <= (r.value as number));
        case '>=': return ok((l.value as number) >= (r.value as number));
      }
      return err({ code: 'BAD_FORMULA', detail: 'unknown compare op' });
    }

    case 'logical': {
      const l = asBoolean(evaluate(ast.left, account, fieldDefs), 'logical LHS');
      if (!l.ok) return l;
      if (ast.op === 'and' && l.value === false) return ok(false);
      if (ast.op === 'or'  && l.value === true)  return ok(true);
      return asBoolean(evaluate(ast.right, account, fieldDefs), 'logical RHS');
    }

    case 'not': {
      const r = asBoolean(evaluate(ast.operand, account, fieldDefs), 'NOT operand');
      if (!r.ok) return r;
      return ok(!(r.value as boolean));
    }

    case 'if': {
      const c = asBoolean(evaluate(ast.cond, account, fieldDefs), 'IF condition');
      if (!c.ok) return c;
      return evaluate(c.value ? ast.then : ast.else, account, fieldDefs);
    }
  }
}
