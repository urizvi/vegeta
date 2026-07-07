import { withWorkspace, getCurrentWorkspaceId } from '@/lib/workspace';
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
  accountInputToRow as inputToRowPatch,
  fieldDefToRowPatch,
  geoNodeToRow,
  teamToRow,
  memberToRow,
  levelToRow,
  stageToRow,
  contactToRow,
  activityToRow,
  taskToRow,
  type AccountRow,
  type FieldDefRow,
  type GeoNodeRow,
  type LevelRow,
  type PipelineStageRow,
  type TeamRow,
  type MemberRow,
  type ContactRow,
  type ActivityRow,
  type TaskRow,
  type AccountInput,
} from '@/lib/directus-mappers';

export type { AccountInput };

const BASE_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;

async function directusError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as
    | { errors?: Array<{ message?: string }> }
    | null;
  const message = body?.errors?.[0]?.message ?? `Directus ${res.status} ${res.statusText}`;
  return new Error(message);
}

export async function createAccount(input: AccountInput): Promise<Account> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace(inputToRowPatch(input));
  const res = await fetch(`${BASE_URL}/items/accounts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  const wid = await getCurrentWorkspaceId();
  const res = await fetch(`${BASE_URL}/items/accounts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs.map((i) => ({ ...inputToRowPatch(i), workspace_id: wid }))),
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
  const body = await withWorkspace({ ...fieldDefToRowPatch(input), sort });
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

// ── Geo nodes ────────────────────────────────────────────────────────────

export async function createGeoNode(node: GeoNode, sort: number): Promise<GeoNode> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace({ ...geoNodeToRow(node), sort });
  const res = await fetch(`${BASE_URL}/items/geo_nodes`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: GeoNodeRow };
  return rowToGeoNode(json.data);
}

export async function updateGeoNodeRemote(id: string, patch: Partial<GeoNode>): Promise<GeoNode> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/geo_nodes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geoNodeToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: GeoNodeRow };
  return rowToGeoNode(json.data);
}

export async function deleteGeoNodes(ids: string[]): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  if (ids.length === 0) return;
  const res = await fetch(`${BASE_URL}/items/geo_nodes`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: ids }),
  });
  if (!res.ok) throw await directusError(res);
}

// ── Pipeline stages ──────────────────────────────────────────────────────

export async function createStage(stage: PipelineStage): Promise<PipelineStage> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace(stageToRow(stage));
  const res = await fetch(`${BASE_URL}/items/pipeline_stages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: PipelineStageRow };
  return rowToStage(json.data);
}

export async function updateStageRemote(
  id: string,
  patch: Partial<Pick<PipelineStage, 'label' | 'color' | 'sort' | 'isWon' | 'isLost'>>,
): Promise<PipelineStage> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/pipeline_stages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stageToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: PipelineStageRow };
  return rowToStage(json.data);
}

export async function deleteStage(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/pipeline_stages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

export async function reorderStages(orderedIds: string[]): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  await Promise.all(
    orderedIds.map((id, idx) =>
      fetch(`${BASE_URL}/items/pipeline_stages/${encodeURIComponent(id)}`, {
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

// ── Hierarchy levels ─────────────────────────────────────────────────────

export async function createLevel(level: HierarchyLevelDef): Promise<HierarchyLevelDef> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace(levelToRow(level));
  const res = await fetch(`${BASE_URL}/items/hierarchy_levels`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: LevelRow };
  return rowToLevel(json.data);
}

export async function updateLevelRemote(
  id: string,
  patch: Partial<Pick<HierarchyLevelDef, 'label' | 'color' | 'sort'>>,
): Promise<HierarchyLevelDef> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/hierarchy_levels/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(levelToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: LevelRow };
  return rowToLevel(json.data);
}

export async function deleteLevel(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/hierarchy_levels/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

/** Persist sort positions matching the given id order. Sequential PATCHes (mirror reorderFieldDefs). */
export async function reorderLevels(orderedIds: string[]): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  await Promise.all(
    orderedIds.map((id, idx) =>
      fetch(`${BASE_URL}/items/hierarchy_levels/${encodeURIComponent(id)}`, {
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

/** Persist sort positions matching the given id order for geo_nodes. */
export async function reorderGeoNodes(orderedIds: string[]): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  await Promise.all(
    orderedIds.map((id, idx) =>
      fetch(`${BASE_URL}/items/geo_nodes/${encodeURIComponent(id)}`, {
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

// ── Teams ────────────────────────────────────────────────────────────────

export async function createTeam(team: SalesTeam, sort: number): Promise<SalesTeam> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace({ ...teamToRow(team), sort });
  const res = await fetch(`${BASE_URL}/items/teams`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: TeamRow };
  return rowToTeam(json.data);
}

export async function updateTeamRemote(
  id: string,
  patch: Partial<Pick<SalesTeam, 'name' | 'color' | 'parentId' | 'leadMemberId'>>,
): Promise<SalesTeam> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/teams/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teamToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: TeamRow };
  return rowToTeam(json.data);
}

export async function deleteTeam(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/teams/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

// ── Members ──────────────────────────────────────────────────────────────

export async function createMember(
  member: Member & { teamId: string | null },
): Promise<Member & { teamId: string | null }> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace(memberToRow(member));
  const res = await fetch(`${BASE_URL}/items/members`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: MemberRow };
  return { ...rowToMember(json.data), teamId: json.data.team_id };
}

export async function updateMemberRemote(
  id: string,
  patch: Partial<Member> & { teamId?: string | null },
): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/members/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memberToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
}

export async function deleteMember(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/members/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

// ── Contacts ─────────────────────────────────────────────────────────────

export async function createContact(c: Contact): Promise<Contact> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace(contactToRow(c));
  const res = await fetch(`${BASE_URL}/items/contacts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: ContactRow };
  return rowToContact(json.data);
}

export async function updateContactRemote(id: string, patch: Partial<Contact>): Promise<Contact> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/contacts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contactToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: ContactRow };
  return rowToContact(json.data);
}

export async function deleteContact(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/contacts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

// ── Activities ───────────────────────────────────────────────────────────

export async function createActivity(a: Activity): Promise<Activity> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace(activityToRow(a));
  const res = await fetch(`${BASE_URL}/items/activities`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: ActivityRow };
  return rowToActivity(json.data);
}

export async function updateActivityRemote(id: string, patch: Partial<Activity>): Promise<Activity> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/activities/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activityToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: ActivityRow };
  return rowToActivity(json.data);
}

export async function deleteActivity(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/activities/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw await directusError(res);
}

// ── Tasks ────────────────────────────────────────────────────────────────

export async function createTask(t: Task): Promise<Task> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const body = await withWorkspace(taskToRow(t));
  const res = await fetch(`${BASE_URL}/items/tasks`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: TaskRow };
  return rowToTask(json.data);
}

export async function updateTaskRemote(id: string, patch: Partial<Task>): Promise<Task> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskToRow(patch)),
  });
  if (!res.ok) throw await directusError(res);
  const json = (await res.json()) as { data: TaskRow };
  return rowToTask(json.data);
}

export async function deleteTask(id: string): Promise<void> {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  const res = await fetch(`${BASE_URL}/items/tasks/${encodeURIComponent(id)}`, {
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
