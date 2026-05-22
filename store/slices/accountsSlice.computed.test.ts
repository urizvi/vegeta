import { describe, expect, it, vi } from 'vitest';
import { createAccountsSlice, type AccountsSlice } from './accountsSlice';
import type { TerritoryStore } from '../types';
import type { FieldDefinition } from '@/lib/accountFields';

vi.mock('@/lib/directus-write', () => {
  // Keep a per-call store so updateAccount echoes back name + fields from the latest call.
  const _store: Record<string, object> = {};
  const updateAccount = vi.fn((id: string, patch: unknown) => {
    const prev = _store[id] ?? { name: 'X' };
    const next = { id, repId: null, stageId: null, fields: {}, ...prev, ...(patch as object) };
    _store[id] = next;
    return Promise.resolve(next);
  });
  return {
    updateAccount,
    createAccount: vi.fn(async (input) => ({ id: 'new', repId: null, stageId: null, ...input, fields: input.fields ?? {} })),
    createAccountsBulk: vi.fn(async (inputs: unknown[]) => {
      const results = inputs.map((i, k) => ({ id: `b${k}`, repId: null, stageId: null, fields: {}, ...(i as object) }));
      // Seed the updateAccount store so subsequent updates preserve name.
      results.forEach((r) => { _store[r.id] = r; });
      return results;
    }),
    deleteAccount: vi.fn(),
    deleteAccounts: vi.fn(),
    createFieldDef: vi.fn(async (d: Omit<FieldDefinition, 'id'>, s: number) => ({ id: 'fd', ...d, sort: s } as FieldDefinition)),
    updateFieldDef: vi.fn(async (id: string, p: Partial<FieldDefinition>) => ({ id, ...p } as FieldDefinition)),
    deleteFieldDef: vi.fn(),
    reorderFieldDefs: vi.fn(),
  };
});

vi.mock('@/lib/directus', () => ({ getAccounts: vi.fn(async () => []) }));

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

function tierDef(): FieldDefinition {
  return {
    id: 'tier', label: 'Tier', type: 'computed', entity: 'account', outputType: 'text',
    formula: {
      kind: 'if',
      cond: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'arr' }, right: { kind: 'literal', valueType: 'number', value: 100 } },
      then: { kind: 'literal', valueType: 'text', value: 'Big' },
      else: { kind: 'literal', valueType: 'text', value: 'Small' },
    },
  };
}

function arrDef(): FieldDefinition {
  return { id: 'arr', label: 'ARR', type: 'metric', entity: 'account' };
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

  it('setAccountField recomputes computed fields', async () => {
    const { state, get } = makeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateFieldDefs([arrDef(), tierDef()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateAccounts([{ id: 'a1', name: 'Acme', repId: null, stageId: null, fields: {} }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state as any).setAccountField('a1', 'arr', 50);
    expect(get().accounts['a1'].fields.tier).toBe('Small');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state as any).setAccountField('a1', 'arr', 500);
    expect(get().accounts['a1'].fields.tier).toBe('Big');
  });

  it('addFieldDef with a computed def backfills every existing account', async () => {
    const { state, get } = makeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateFieldDefs([arrDef()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateAccounts([
      { id: 'a1', name: 'A', repId: null, stageId: null, fields: { arr: 50 } },
      { id: 'a2', name: 'B', repId: null, stageId: null, fields: { arr: 200 } },
    ]);
    // Override createFieldDef to return tierDef so the slice sees it as computed.
    const { createFieldDef } = await import('@/lib/directus-write');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createFieldDef as any).mockResolvedValueOnce(tierDef());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state as any).addFieldDef({ ...tierDef(), id: undefined });
    expect(get().accounts['a1'].fields.tier).toBe('Small');
    expect(get().accounts['a2'].fields.tier).toBe('Big');
  });

  it('removeFieldDef on a computed field cleans tier values from every account', async () => {
    const { state, get } = makeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateFieldDefs([arrDef(), tierDef()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateAccounts([
      { id: 'a1', name: 'A', repId: null, stageId: null, fields: { arr: 50, tier: 'Small' } },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state as any).removeFieldDef('tier');
    expect(get().accounts['a1'].fields.tier).toBeUndefined();
  });

  it('importAccounts triggers a single batched recompute', async () => {
    const { state, get } = makeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateFieldDefs([arrDef(), tierDef()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state as any).importAccounts([
      { name: 'New Co', fields: { arr: 50 } },
      { name: 'Big Co', fields: { arr: 500 } },
    ]);
    const accounts = Object.values(get().accounts) as Array<{ name: string; fields: { tier?: string } }>;
    const newCo = accounts.find((a) => a.name === 'New Co');
    const bigCo = accounts.find((a) => a.name === 'Big Co');
    expect(newCo?.fields.tier).toBe('Small');
    expect(bigCo?.fields.tier).toBe('Big');
  });

  it('removeFieldDef on a regular field does NOT erase orphaned data', async () => {
    const { state, get } = makeStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateFieldDefs([
      arrDef(),
      { id: 'notes', label: 'Notes', type: 'text', entity: 'account' },
      tierDef(),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state as any).hydrateAccounts([
      { id: 'a1', name: 'A', repId: null, stageId: null, fields: { arr: 50, notes: 'keep me', tier: 'Small' } },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (state as any).removeFieldDef('notes');
    // notes data is intentionally orphaned but preserved per the existing "delete field but keep data" flow.
    expect(get().accounts['a1'].fields.notes).toBe('keep me');
    // tier should still be present and correct.
    expect(get().accounts['a1'].fields.tier).toBe('Small');
  });
});
