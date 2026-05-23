import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Account } from '@/types/territory';
import type { FieldDefinition } from '@/lib/accountFields';
import * as directusWrite from '@/lib/directus-write';
import { getAccounts as fetchAccounts } from '@/lib/directus';
import { recomputeAccount } from '@/lib/formula/recompute';

interface AccountInput {
  name: string;
  country?: string;
  state?: string;
  geoNodeId?: string | null;
  repId?: string | null;
  fields?: Record<string, string | number | boolean>;
}

function normalizeName(s: string): string {
  return s.toLowerCase().trim();
}

/** Returns a copy of `account` with computed fields refreshed against the current fieldDefs. */
function withComputedRefresh(account: Account, defs: FieldDefinition[]): Account {
  return recomputeAccount(account, defs);
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
      const refreshed = withComputedRefresh(created, get().fieldDefs);
      if (Object.keys(refreshed.fields).length !== Object.keys(created.fields).length) {
        await directusWrite.updateAccount(created.id, { fields: refreshed.fields });
      }
      set((s) => ({
        accounts: { ...s.accounts, [created.id]: refreshed },
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
      const refreshed = withComputedRefresh(updated, get().fieldDefs);
      if (JSON.stringify(refreshed.fields) !== JSON.stringify(updated.fields)) {
        await directusWrite.updateAccount(id, { fields: refreshed.fields });
      }
      set((s) => ({ accounts: { ...s.accounts, [id]: refreshed } }));
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
      const refreshed = withComputedRefresh(updated, get().fieldDefs);
      if (JSON.stringify(refreshed.fields) !== JSON.stringify(updated.fields)) {
        await directusWrite.updateAccount(accountId, { fields: refreshed.fields });
      }
      set((s) => ({ accounts: { ...s.accounts, [accountId]: refreshed } }));
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
      let [created, updated] = await Promise.all([
        toCreate.length > 0 ? directusWrite.createAccountsBulk(toCreate) : Promise.resolve([]),
        Promise.all(toUpdate.map((u) => directusWrite.updateAccount(u.id, u.patch))),
      ]);

      const computedIds = defs.filter((d) => d.type === 'computed').map((d) => d.id);
      if (computedIds.length > 0) {
        const allAccounts = [...created, ...updated];
        const refreshed = await Promise.all(allAccounts.map(async (a) => {
          const r = recomputeAccount(a, defs);
          if (JSON.stringify(r.fields) !== JSON.stringify(a.fields)) {
            return directusWrite.updateAccount(a.id, { fields: r.fields });
          }
          return a;
        }));
        const byId = new Map(refreshed.map((a) => [a.id, a]));
        created = created.map((a) => byId.get(a.id) ?? a);
        updated = updated.map((a) => byId.get(a.id) ?? a);
      }

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
      if (created.type === 'computed') {
        await refreshAllAccountsForComputed(get, set);
      }
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
      if (updated.type === 'computed') {
        await refreshAllAccountsForComputed(get, set);
      }
    } catch (err) {
      console.error('updateFieldDef failed; reverting', err);
      set((s) => ({ fieldDefs: s.fieldDefs.map((d) => (d.id === id ? prev : d)) }));
      throw err;
    }
  },

  async removeFieldDef(id) {
    const prev = get().fieldDefs;
    const removedDef = prev.find((d) => d.id === id);
    set((s) => ({ fieldDefs: s.fieldDefs.filter((d) => d.id !== id) }));
    try {
      await directusWrite.deleteFieldDef(id);
      if (removedDef?.type === 'computed') {
        // Sweep the now-orphaned computed-field key out of every account's fields.
        const accounts = Object.values(get().accounts);
        await Promise.all(accounts.map(async (a) => {
          if (id in a.fields) {
            const nextFields = { ...a.fields };
            delete nextFields[id];
            await directusWrite.updateAccount(a.id, { fields: nextFields });
            set((s) => ({ accounts: { ...s.accounts, [a.id]: { ...s.accounts[a.id], fields: nextFields } } }));
          }
        }));
        await refreshAllAccountsForComputed(get, set);
      }
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

async function refreshAllAccountsForComputed(
  get: () => TerritoryStore,
  set: (partial: Partial<TerritoryStore> | ((s: TerritoryStore) => Partial<TerritoryStore>)) => void,
): Promise<void> {
  const defs = get().fieldDefs;
  const accounts = Object.values(get().accounts);
  const computedIds = new Set(defs.filter((d) => d.type === 'computed').map((d) => d.id));
  const nextById: Record<string, Account> = {};
  await Promise.all(accounts.map(async (a) => {
    // Strip ONLY the current set of computed-field keys so recompute writes fresh values.
    // Do NOT touch other keys — they may be orphaned non-computed field data the user
    // intentionally preserved via the "delete field but keep data" flow.
    const cleanedFields: Account['fields'] = { ...a.fields };
    for (const id of computedIds) delete cleanedFields[id];
    const refreshed = recomputeAccount({ ...a, fields: cleanedFields }, defs);
    if (JSON.stringify(refreshed.fields) !== JSON.stringify(a.fields)) {
      const persisted = await directusWrite.updateAccount(a.id, { fields: refreshed.fields });
      nextById[a.id] = persisted;
    } else {
      nextById[a.id] = a;
    }
  }));
  set((s) => ({ accounts: { ...s.accounts, ...nextById } }));
}
