import type { EvalError } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';

/** Human-readable message for an evaluator error, suitable for a cell hover title. */
export function evalErrorMessage(err: EvalError, defs: FieldDefinition[]): string {
  switch (err.code) {
    case 'MISSING_VALUE': {
      const d = defs.find((x) => x.id === err.fieldId);
      return `Field ${d ? `"${d.label}"` : `(${err.fieldId})`} has no value on this account.`;
    }
    case 'MISSING_FIELD':
      return 'Field referenced by this formula was deleted.';
    case 'TYPE_MISMATCH':
      return err.detail
        ? `Type error: ${err.detail}.`
        : 'Type error in formula.';
    case 'DIV_BY_ZERO':
      return 'Divide by zero.';
    case 'BAD_FORMULA':
      return 'Formula has a syntax error — edit in Manage Fields.';
    case 'CYCLE':
      return 'Field depends on itself.';
  }
}
