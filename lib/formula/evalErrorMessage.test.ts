import { describe, expect, it } from 'vitest';
import { evalErrorMessage } from './evalErrorMessage';
import type { FieldDefinition } from '@/lib/accountFields';

const defs: FieldDefinition[] = [{ id: 'f_arr', label: 'ARR', type: 'metric', entity: 'account' }];

describe('evalErrorMessage', () => {
  it('uses the field label for MISSING_VALUE', () => {
    expect(evalErrorMessage({ code: 'MISSING_VALUE', fieldId: 'f_arr' }, defs))
      .toBe('Field "ARR" has no value on this account.');
  });
  it('falls back to the id when the field is not in defs', () => {
    expect(evalErrorMessage({ code: 'MISSING_VALUE', fieldId: 'unknown' }, defs))
      .toBe('Field (unknown) has no value on this account.');
  });
  it('handles DIV_BY_ZERO', () => {
    expect(evalErrorMessage({ code: 'DIV_BY_ZERO' }, defs)).toBe('Divide by zero.');
  });
  it('handles MISSING_FIELD', () => {
    expect(evalErrorMessage({ code: 'MISSING_FIELD', fieldId: 'gone' }, defs))
      .toBe('Field referenced by this formula was deleted.');
  });
});
