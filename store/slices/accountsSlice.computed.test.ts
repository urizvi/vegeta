import { describe, expect, it, vi } from 'vitest';
import { createAccountsSlice, type AccountsSlice } from './accountsSlice';
import type { TerritoryStore } from '../types';
import type { FieldDefinition } from '@/lib/accountFields';

vi.mock('@/lib/directus-write', () => {
  const updateAccount = vi.fn((id: string, patch: unknown) => Promise.resolve({ id, name: 'X', repId: null, stageId: null, fields: {}, ...(patch as object) }));
  return {
    updateAccount,
    createAccount: vi.fn(async (input) => ({ id: 'new', repId: null, stageId: null, ...input, fields: input.fields ?? {} })),
    createAccountsBulk: vi.fn(async (inputs: unknown[]) => inputs.map((i, k) => ({ id: `b${k}`, repId: null, stageId: null, fields: {}, ...(i as object) }))),
    deleteAccount: vi.fn(),
    deleteAccounts: vi.fn(),
    createFieldDef: vi.fn(async (d, s) => ({ id: 'fd', ...d, sort: s })),
    updateFieldDef: vi.fn(async (id, p) => ({ id, ...p } as FieldDefinition)),
    deleteFieldDef: vi.fn(),
    reorderFieldDefs: vi.fn(),
  };
});

vi.mock('@/lib/directus', () => ({ getAccounts: vi.fn(async () => []) }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStore() {
  let state: Partial<TerritoryStore> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set: any = (p: any) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get: any = () => state;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createAccountsSlice(set, get, {} as any) as AccountsSlice;
  Object.assign(state, slice);
  return { state, set, get };
}

describe('accountsSlice — computed recompute', () => {
  it('updateAccount recomputes computed fields', async () => {
    const { state, get } = makeStore();
    const defs: FieldDefinition[] = [
      { id: 'arr', label: 'ARR', type: 'metric', entity: 'account' },
      { id: 'tier', label: 'Tier', type: 'computed', entity: 'account', outputType: 'text',
        formula: { kind: 'if',
          cond: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'arr' }, right: { kind: 'literal', valueType: 'number', value: 100 } },
          then: { kind: 'literal', valueType: 'text', value: 'Big' },
          else: { kind: 'literal', valueType: 'text', value: 'Small' } } },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateFieldDefs(defs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateAccounts([{ id: 'a1', name: 'Acme', repId: null, stageId: null, fields: {} }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state as any).updateAccount('a1', { fields: { arr: 200 } });
    expect(get().accounts['a1'].fields.tier).toBe('Big');
  });
});
