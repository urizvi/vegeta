import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Account } from '@/types/territory';
import type { FieldDefinition } from '@/lib/accountFields';
import * as directusWrite from '@/lib/directus-write';
import { getAccounts as fetchAccounts } from '@/lib/directus';

interface AccountInput {
  name: string;
  country?: string;
  state?: string;
  geoNodeId?: string | null;
  repId?: string | null;
  fields?: Record<string, string | number>;
}

function normalizeName(s: string): string {
  return s.toLowerCase().trim();
}

export interface AccountsSlice {
  accounts: Record<string, Account>;
  accountOrder: string[];
  fieldDefs: FieldDefinition[];

  addAccount: (data: AccountInput) => Promise<void>;
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id'>>) => Promise<void>;
  setAccountField: (accountId: string, fieldId: string, value: string | number) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  deleteAccounts: (ids: string[]) => Promise<void>;
  importAccounts: (rows: AccountInput[]) => Promise<void>;

  addFieldDef: (def: Omit<FieldDefinition, 'id'>) => Promise<void>;
  updateFieldDef: (id: string, patch: Partial<Omit<FieldDefinition, 'id'>>) => Promise<void>;
  removeFieldDef: (id: string) => Promise<void>;
  reorderFieldDefs: (orderedIds: string[]) => Promise<void>;

  hydrateAccounts: (accounts: Account[]) => void;
  hydrateFieldDefs: (defs: FieldDefinition[]) => void;
}

export const accountsPersistKeys = ['accounts', 'accountOrder', 'fieldDefs'] as const satisfies readonly (keyof AccountsSlice)[];

export const createAccountsSlice: StateCreator<TerritoryStore, [], [], AccountsSlice> = (set, get) => ({
  accounts: {},
  accountOrder: [],
  fieldDefs: [],

  hydrateAccounts(incoming) {
    const accounts: Record<string, Account> = {};
    const accountOrder: string[] = [];
    incoming.forEach((a) => {
      accounts[a.id] = a;
      accountOrder.push(a.id);
    });
    set({ accounts, accountOrder });
  },

  hydrateFieldDefs(defs) {
    set({ fieldDefs: defs });
  },

  // Account writes — optimistic with rollback on failure.
  async addAccount(data) {
    const key = normalizeName(data.name);
    if (!key) throw new Error('Name is required.');
    const dup = Object.values(get().accounts).find((a) => normalizeName(a.name) === key);
    if (dup) throw new Error(`An account named "${data.name}" already exists.`);
    try {
      const created = await directusWrite.createAccount({
        name: data.name,
        country: data.country,
        state: data.state,
        geoNodeId: data.geoNodeId ?? null,
        repId: data.repId ?? null,
        fields: data.fields ?? {},
      });
      set((s) => ({
        accounts: { ...s.accounts, [created.id]: created },
        accountOrder: [...s.accountOrder, created.id],
      }));
    } catch (err) {
      console.error('addAccount failed', err);
      throw err;
    }
  },

  async updateAccount(id, patch) {
    const prev = get().accounts[id];
    if (!prev) return;
    if (patch.name !== undefined) {
      const key = normalizeName(patch.name);
      if (!key) throw new Error('Name is required.');
      const dup = Object.values(get().accounts).find(
        (a) => a.id !== id && normalizeName(a.name) === key,
      );
      if (dup) throw new Error(`An account named "${patch.name}" already exists.`);
    }
    set((s) => ({ accounts: { ...s.accounts, [id]: { ...prev, ...patch } } }));
    try {
      const updated = await directusWrite.updateAccount(id, patch);
      set((s) => ({ accounts: { ...s.accounts, [id]: updated } }));
    } catch (err) {
      console.error('updateAccount failed; reverting', err);
      set((s) => ({ accounts: { ...s.accounts, [id]: prev } }));
      throw err;
    }
  },

  async setAccountField(accountId, fieldId, value) {
    const prev = get().accounts[accountId];
    if (!prev) return;
    const nextFields = { ...prev.fields, [fieldId]: value };
    set((s) => ({ accounts: { ...s.accounts, [accountId]: { ...prev, fields: nextFields } } }));
    try {
      const updated = await directusWrite.updateAccount(accountId, { fields: nextFields });
      set((s) => ({ accounts: { ...s.accounts, [accountId]: updated } }));
    } catch (err) {
      console.error('setAccountField failed; reverting', err);
      set((s) => ({ accounts: { ...s.accounts, [accountId]: prev } }));
      throw err;
    }
  },

  async deleteAccount(id) {
    const prev = get().accounts[id];
    const prevOrder = get().accountOrder;
    if (!prev) return;
    set((s) => {
      const accounts = { ...s.accounts };
      delete accounts[id];
      return { accounts, accountOrder: s.accountOrder.filter((aid) => aid !== id) };
    });
    try {
      await directusWrite.deleteAccount(id);
    } catch (err) {
      console.error('deleteAccount failed; reverting', err);
      set({ accounts: { ...get().accounts, [id]: prev }, accountOrder: prevOrder });
      throw err;
    }
  },

  async deleteAccounts(ids) {
    const idSet = new Set(ids);
    const prevAccounts = get().accounts;
    const prevOrder = get().accountOrder;
    set((s) => {
      const accounts = { ...s.accounts };
      ids.forEach((id) => delete accounts[id]);
      return { accounts, accountOrder: s.accountOrder.filter((id) => !idSet.has(id)) };
    });
    try {
      await directusWrite.deleteAccounts(ids);
    } catch (err) {
      console.error('deleteAccounts failed; refetching to reconcile', err);
      try {
        const fresh = await fetchAccounts();
        get().hydrateAccounts(fresh);
      } catch {
        set({ accounts: prevAccounts, accountOrder: prevOrder });
      }
      throw err;
    }
  },

  async importAccounts(rows) {
    const defs = get().fieldDefs;
    const defaults: Record<string, string | number> = {};
    defs.forEach((d) => {
      if (d.type === 'metric') defaults[d.id] = 0;
      else if (d.type === 'categorical' && d.options?.length) defaults[d.id] = d.options[0];
      else defaults[d.id] = '';
    });

    const existing = get().accounts;
    const idByName: Record<string, string> = {};
    Object.values(existing).forEach((a) => { idByName[normalizeName(a.name)] = a.id; });

    const toCreate: AccountInput[] = [];
    const toUpdate: { id: string; patch: Partial<AccountInput> }[] = [];

    rows.forEach((r) => {
      const key = normalizeName(r.name);
      if (!key) return;
      const merged: AccountInput = {
        name: r.name.trim(),
        country: r.country,
        state: r.state,
        geoNodeId: r.geoNodeId ?? null,
        repId: r.repId ?? null,
        fields: { ...defaults, ...(r.fields ?? {}) },
      };
      const existingId = idByName[key];
      if (existingId) toUpdate.push({ id: existingId, patch: merged });
      else toCreate.push(merged);
    });

    try {
      const [created, updated] = await Promise.all([
        toCreate.length > 0 ? directusWrite.createAccountsBulk(toCreate) : Promise.resolve([]),
        Promise.all(toUpdate.map((u) => directusWrite.updateAccount(u.id, u.patch))),
      ]);
      set((s) => {
        const accounts = { ...s.accounts };
        const accountOrder = [...s.accountOrder];
        created.forEach((a) => {
          accounts[a.id] = a;
          accountOrder.push(a.id);
        });
        updated.forEach((a) => { accounts[a.id] = a; });
        return { accounts, accountOrder };
      });
    } catch (err) {
      console.error('importAccounts failed', err);
      throw err;
    }
  },

  async addFieldDef(def) {
    try {
      const sort = get().fieldDefs.length;
      const created = await directusWrite.createFieldDef(def, sort);
      set((s) => ({ fieldDefs: [...s.fieldDefs, created] }));
    } catch (err) {
      console.error('addFieldDef failed', err);
      throw err;
    }
  },

  async updateFieldDef(id, patch) {
    const prev = get().fieldDefs.find((d) => d.id === id);
    if (!prev) return;
    set((s) => ({ fieldDefs: s.fieldDefs.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
    try {
      const updated = await directusWrite.updateFieldDef(id, patch);
      set((s) => ({ fieldDefs: s.fieldDefs.map((d) => (d.id === id ? updated : d)) }));
    } catch (err) {
      console.error('updateFieldDef failed; reverting', err);
      set((s) => ({ fieldDefs: s.fieldDefs.map((d) => (d.id === id ? prev : d)) }));
      throw err;
    }
  },

  async removeFieldDef(id) {
    const prev = get().fieldDefs;
    set((s) => ({ fieldDefs: s.fieldDefs.filter((d) => d.id !== id) }));
    try {
      await directusWrite.deleteFieldDef(id);
    } catch (err) {
      console.error('removeFieldDef failed; reverting', err);
      set({ fieldDefs: prev });
      throw err;
    }
  },

  async reorderFieldDefs(orderedIds) {
    const prev = get().fieldDefs;
    const map = Object.fromEntries(prev.map((d) => [d.id, d]));
    const next = orderedIds.map((id) => map[id]).filter(Boolean);
    set({ fieldDefs: next });
    try {
      await directusWrite.reorderFieldDefs(orderedIds);
    } catch (err) {
      console.error('reorderFieldDefs failed; reverting', err);
      set({ fieldDefs: prev });
      throw err;
    }
  },
});
