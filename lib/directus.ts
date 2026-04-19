import type { Account } from '@/types/account';
import type { FieldDefinition, FieldType } from '@/lib/accountFields';

const BASE_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const TOKEN = process.env.NEXT_PUBLIC_DIRECTUS_TOKEN;

/** Public deep-link base for the Directus admin UI (toolbar "Manage Accounts" link). */
export const DIRECTUS_ADMIN_URL =
  process.env.NEXT_PUBLIC_DIRECTUS_ADMIN_URL ?? `${BASE_URL ?? ''}/admin`;

// ── Row shapes (Directus REST snake_case) ────────────────────────────────

interface AccountRow {
  id: string;
  name: string;
  country: string;
  state: string | null;
  rep_id: string | null;
  fields: Record<string, string | number> | null;
}

interface FieldDefRow {
  id: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  is_currency: boolean | null;
  sort: number | null;
}

interface MemberRow {
  id: string;
  name: string;
  team_id: string | null;
}

// ── Low-level request ─────────────────────────────────────────────────────

async function fetchItems<T>(collection: string): Promise<T[]> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  if (!TOKEN) throw new Error('NEXT_PUBLIC_DIRECTUS_TOKEN is not set');
  const res = await fetch(`${BASE_URL}/items/${collection}?limit=-1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Directus ${collection}: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: T[] };
  return json.data;
}

// ── Typed loaders ─────────────────────────────────────────────────────────

export async function getAccounts(): Promise<Account[]> {
  const rows = await fetchItems<AccountRow>('accounts');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    state: r.state ?? undefined,
    repId: r.rep_id,
    fields: r.fields ?? {},
  }));
}

export async function getFieldDefinitions(): Promise<FieldDefinition[]> {
  const rows = await fetchItems<FieldDefRow>('field_definitions');
  return rows
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((r) => ({
      id: r.id,
      label: r.label,
      type: r.type,
      ...(r.options ? { options: r.options } : {}),
      ...(r.is_currency ? { isCurrency: true } : {}),
    }));
}

/** Members mirror — only used to keep the Next store's members map populated for reads. */
export async function getMembers(): Promise<Array<{ id: string; name: string; teamId: string | null }>> {
  const rows = await fetchItems<MemberRow>('members');
  return rows.map((r) => ({ id: r.id, name: r.name, teamId: r.team_id }));
}
