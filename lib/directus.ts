import { getCurrentWorkspaceId } from '@/lib/workspace';
import type { Account } from '@/types/account';
import type { GeoNode, SalesTeam, Member, HierarchyLevelDef, PipelineStage } from '@/types/territory';
import type { Contact, Activity, Task } from '@/types/crm';
import type { FieldDefinition } from '@/lib/accountFields';
import {
  rowToAccount,
  rowToFieldDef,
  rowToGeoNode,
  rowToTeam,
  rowToMember,
  rowToLevel,
  rowToStage,
  rowToContact,
  rowToActivity,
  rowToTask,
  type AccountRow,
  type FieldDefRow,
  type GeoNodeRow,
  type LevelRow,
  type MemberRow,
  type PipelineStageRow,
  type TeamRow,
  type ContactRow,
  type ActivityRow,
  type TaskRow,
} from '@/lib/directus-mappers';

const BASE_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;

/** Public deep-link base for the Directus admin UI (toolbar "Manage Accounts" link). */
export const DIRECTUS_ADMIN_URL =
  process.env.NEXT_PUBLIC_DIRECTUS_ADMIN_URL ?? `${BASE_URL ?? ''}/admin`;

async function fetchItems<T>(collection: string): Promise<T[]> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const wid = await getCurrentWorkspaceId();
  const url = `${BASE_URL}/items/${collection}?limit=-1&filter[workspace_id][_eq]=${encodeURIComponent(wid)}`;
  const res = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) {
    throw new Error(`Directus ${collection}: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: T[] };
  return json.data;
}

export async function getAccounts(): Promise<Account[]> {
  const rows = await fetchItems<AccountRow>('accounts');
  return rows.map(rowToAccount);
}

export async function getFieldDefinitions(): Promise<FieldDefinition[]> {
  const rows = await fetchItems<FieldDefRow>('field_definitions');
  return rows
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map(rowToFieldDef);
}

export async function getMembers(): Promise<Array<Member & { teamId: string | null }>> {
  const rows = await fetchItems<MemberRow>('members');
  return rows.map((r) => ({ ...rowToMember(r), teamId: r.team_id }));
}

export async function getPipelineStages(): Promise<{ stages: PipelineStage[]; order: string[] }> {
  const rows = await fetchItems<PipelineStageRow>('pipeline_stages');
  const sorted = rows.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return {
    stages: sorted.map(rowToStage),
    order: sorted.map((r) => r.id),
  };
}

export async function getHierarchyLevels(): Promise<{ levels: HierarchyLevelDef[]; order: string[] }> {
  const rows = await fetchItems<LevelRow>('hierarchy_levels');
  const sorted = rows.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return {
    levels: sorted.map(rowToLevel),
    order: sorted.map((r) => r.id),
  };
}

export async function getTeams(): Promise<{ teams: SalesTeam[]; order: string[] }> {
  const rows = await fetchItems<TeamRow>('teams');
  const sorted = rows.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return {
    teams: sorted.map(rowToTeam),
    order: sorted.map((r) => r.id),
  };
}

export async function getContacts(): Promise<Contact[]> {
  const rows = await fetchItems<ContactRow>('contacts');
  return rows
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map(rowToContact);
}

export async function getActivities(): Promise<Activity[]> {
  const rows = await fetchItems<ActivityRow>('activities');
  return rows.map(rowToActivity);
}

export async function getTasks(): Promise<Task[]> {
  const rows = await fetchItems<TaskRow>('tasks');
  return rows.map(rowToTask);
}

export async function getGeoNodes(): Promise<{ nodes: GeoNode[]; order: string[] }> {
  const rows = await fetchItems<GeoNodeRow>('geo_nodes');
  const sorted = rows.slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return {
    nodes: sorted.map(rowToGeoNode),
    order: sorted.map((r) => r.id),
  };
}
