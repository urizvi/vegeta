import type { Account } from '@/types/account';
import type { FieldDefinition, FieldType } from '@/lib/accountFields';

const BASE_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;

interface FieldDefRow {
  id: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  is_currency: boolean | null;
  sort: number | null;
}

function rowToFieldDef(r: FieldDefRow): FieldDefinition {
  return {
    id: r.id,
    label: r.label,
    type: r.type,
    ...(r.options ? { options: r.options } : {}),
    ...(r.is_currency ? { isCurrency: true } : {}),
  };
}

function fieldDefToRowPatch(input: Partial<Omit<FieldDefinition, 'id'>>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.type !== undefined) patch.type = input.type;
  if (input.options !== undefined) patch.options = input.options;
  if (input.isCurrency !== undefined) patch.is_currency = input.isCurrency;
  return patch;
}

interface AccountRow {
  id: string;
  name: string;
  country: string;
  state: string | null;
  rep_id: string | null;
  fields: Record<string, string | number> | null;
}

export interface AccountInput {
  name: string;
  country: string;
  state?: string;
  repId?: string | null;
  fields?: Record<string, string | number>;
}

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    country: r.country,
    state: r.state ?? undefined,
    repId: r.rep_id,
    fields: r.fields ?? {},
  };
}

function inputToRowPatch(input: Partial<AccountInput>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.country !== undefined) patch.country = input.country;
  if (input.state !== undefined) patch.state = input.state ?? null;
  if (input.repId !== undefined) patch.rep_id = input.repId ?? null;
  if (input.fields !== undefined) patch.fields = input.fields;
  return patch;
}

async function directusError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as
    | { errors?: Array<{ message?: string }> }
    | null;
  const message = body?.errors?.[0]?.message ?? `Directus ${res.status} ${res.statusText}`;
  return new Error(message);
}

export async function createAccount(input: AccountInput): Promise<Account> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/accounts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputToRowPatch(input)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: AccountRow };
  return rowToAccount(json.data);
}

export async function updateAccount(id: string, patch: Partial<AccountInput>): Promise<Account> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/accounts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputToRowPatch(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: AccountRow };
  return rowToAccount(json.data);
}

export async function deleteAccount(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/accounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

export async function deleteAccounts(ids: string[]): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  if (ids.length === 0) return;
  const res = await fetch(`${BASE_URL}/items/accounts`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: ids }),
  });
  if (!res.ok) throw await directusError(res);
}

/** Bulk-create accounts. Directus 11 accepts an array body on POST /items/<collection>. */
export async function createAccountsBulk(inputs: AccountInput[]): Promise<Account[]> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  if (inputs.length === 0) return [];
  const res = await fetch(`${BASE_URL}/items/accounts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs.map((i) => inputToRowPatch(i))),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: AccountRow[] };
  return json.data.map(rowToAccount);
}

// ── Field definitions ────────────────────────────────────────────────────

export async function createFieldDef(
  input: Omit<FieldDefinition, 'id'>,
  sort: number,
): Promise<FieldDefinition> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = { ...fieldDefToRowPatch(input), sort };
  const res = await fetch(`${BASE_URL}/items/field_definitions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: FieldDefRow };
  return rowToFieldDef(json.data);
}

export async function updateFieldDef(
  id: string,
  patch: Partial<Omit<FieldDefinition, 'id'>>,
): Promise<FieldDefinition> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/field_definitions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fieldDefToRowPatch(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: FieldDefRow };
  return rowToFieldDef(json.data);
}

export async function deleteFieldDef(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/field_definitions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

/** Persist sort positions matching the given id order. Sequential PATCHes (no bulk-by-keys for distinct values). */
export async function reorderFieldDefs(orderedIds: string[]): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  await Promise.all(
    orderedIds.map((id, idx) =>
      fetch(`${BASE_URL}/items/field_definitions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort: idx }),
      }).then(async (res) => {
        if (!res.ok) throw await directusError(res);
      }),
    ),
  );
}
