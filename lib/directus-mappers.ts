import type { Account } from '@/types/account';
import type { GeoNode, SalesTeam, Member, HierarchyLevel, HierarchyLevelDef, PipelineStage } from '@/types/territory';
import type { FieldDefinition, FieldEntity, FieldType } from '@/lib/accountFields';
import type { Contact, Activity, ActivityKind, Task } from '@/types/crm';

// Row shapes mirror Directus REST snake_case payloads.

export interface AccountRow {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  geo_node_id?: string | null; // populated once Directus collection column lands
  rep_id: string | null;
  stage_id?: string | null;
  fields: Record<string, string | number> | null;
}

export interface PipelineStageRow {
  id: string;
  slug: string | null;
  label: string;
  color: string | null;
  sort: number | null;
  is_won: boolean | null;
  is_lost: boolean | null;
}

export interface FieldDefRow {
  id: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  is_currency: boolean | null;
  entity: FieldEntity | null;
  aliases: string[] | null;
  sort: number | null;
}

export interface LevelRow {
  id: string;
  slug: string | null;
  label: string;
  color: string | null;
  sort: number | null;
}

export interface TeamRow {
  id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  lead_member_id: string | null;
  sort: number | null;
}

export interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  level: HierarchyLevel | null;
  team_id: string | null;
}

export interface GeoNodeRow {
  id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  sort: number | null;
  country_codes: string[] | null;
  state_codes: string[] | null;
}

export interface AccountInput {
  name: string;
  country?: string;
  state?: string;
  geoNodeId?: string | null;
  repId?: string | null;
  stageId?: string | null;
  fields?: Record<string, string | number>;
}

export function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    country: r.country ?? undefined,
    state: r.state ?? undefined,
    geoNodeId: r.geo_node_id ?? null,
    repId: r.rep_id,
    stageId: r.stage_id ?? null,
    fields: r.fields ?? {},
  };
}

export function rowToFieldDef(r: FieldDefRow): FieldDefinition {
  return {
    id: r.id,
    label: r.label,
    type: r.type,
    entity: r.entity ?? 'account',
    ...(r.options ? { options: r.options } : {}),
    ...(r.is_currency ? { isCurrency: true } : {}),
    ...(r.aliases?.length ? { aliases: r.aliases } : {}),
  };
}

export function accountInputToRow(input: Partial<AccountInput>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.country !== undefined) patch.country = input.country || null;
  if (input.state !== undefined) patch.state = input.state ?? null;
  if (input.geoNodeId !== undefined) patch.geo_node_id = input.geoNodeId ?? null;
  if (input.repId !== undefined) patch.rep_id = input.repId ?? null;
  if (input.stageId !== undefined) patch.stage_id = input.stageId ?? null;
  if (input.fields !== undefined) patch.fields = input.fields;
  return patch;
}

export function rowToGeoNode(r: GeoNodeRow): GeoNode {
  return {
    id: r.id,
    name: r.name,
    color: r.color ?? null,
    parentId: r.parent_id ?? null,
    countryCodes: r.country_codes ?? [],
    stateCodes: r.state_codes ?? [],
  };
}

export function geoNodeToRow(n: Partial<GeoNode> & { sort?: number }): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (n.id !== undefined) row.id = n.id;
  if (n.name !== undefined) row.name = n.name;
  if (n.color !== undefined) row.color = n.color;
  if (n.parentId !== undefined) row.parent_id = n.parentId;
  if (n.countryCodes !== undefined) row.country_codes = n.countryCodes;
  if (n.stateCodes !== undefined) row.state_codes = n.stateCodes;
  if (n.sort !== undefined) row.sort = n.sort;
  return row;
}

export function rowToLevel(r: LevelRow): HierarchyLevelDef {
  return {
    id: r.id,
    slug: r.slug ?? r.id,
    label: r.label,
    color: r.color ?? '#e5e7eb',
    sort: r.sort ?? 0,
  };
}

export function levelToRow(l: Partial<HierarchyLevelDef>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (l.id !== undefined) row.id = l.id;
  if (l.slug !== undefined) row.slug = l.slug;
  if (l.label !== undefined) row.label = l.label;
  if (l.color !== undefined) row.color = l.color;
  if (l.sort !== undefined) row.sort = l.sort;
  return row;
}

export function rowToStage(r: PipelineStageRow): PipelineStage {
  return {
    id: r.id,
    slug: r.slug ?? r.id,
    label: r.label,
    color: r.color ?? '#e5e7eb',
    sort: r.sort ?? 0,
    isWon: r.is_won ?? false,
    isLost: r.is_lost ?? false,
  };
}

export function stageToRow(s: Partial<PipelineStage>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (s.id !== undefined) row.id = s.id;
  if (s.slug !== undefined) row.slug = s.slug;
  if (s.label !== undefined) row.label = s.label;
  if (s.color !== undefined) row.color = s.color;
  if (s.sort !== undefined) row.sort = s.sort;
  if (s.isWon !== undefined) row.is_won = s.isWon;
  if (s.isLost !== undefined) row.is_lost = s.isLost;
  return row;
}

export function rowToTeam(r: TeamRow): SalesTeam {
  return {
    id: r.id,
    name: r.name,
    color: r.color ?? '#3b82f6',
    memberIds: [],
    parentId: r.parent_id ?? null,
    leadMemberId: r.lead_member_id ?? null,
  };
}

export function teamToRow(t: Partial<SalesTeam> & { sort?: number }): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.id !== undefined) row.id = t.id;
  if (t.name !== undefined) row.name = t.name;
  if (t.color !== undefined) row.color = t.color;
  if (t.parentId !== undefined) row.parent_id = t.parentId;
  if (t.leadMemberId !== undefined) row.lead_member_id = t.leadMemberId;
  if (t.sort !== undefined) row.sort = t.sort;
  return row;
}

export function rowToMember(r: MemberRow): Member {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? '',
    role: r.role ?? '',
    level: r.level ?? '',
  };
}

export function memberToRow(
  m: Partial<Member> & { teamId?: string | null },
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (m.id !== undefined) row.id = m.id;
  if (m.name !== undefined) row.name = m.name;
  if (m.email !== undefined) row.email = m.email;
  if (m.role !== undefined) row.role = m.role;
  if (m.level !== undefined) row.level = m.level;
  if (m.teamId !== undefined) row.team_id = m.teamId;
  return row;
}

export function fieldDefToRow(input: Partial<Omit<FieldDefinition, 'id'>>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.type !== undefined) patch.type = input.type;
  if (input.options !== undefined) patch.options = input.options;
  if (input.isCurrency !== undefined) patch.is_currency = input.isCurrency;
  if (input.entity !== undefined) patch.entity = input.entity;
  if (input.aliases !== undefined) patch.aliases = input.aliases;
  return patch;
}

// ── Contacts / Activities / Tasks ────────────────────────────────────────

export interface ContactRow {
  id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean | null;
  fields: Record<string, string | number> | null;
  sort: number | null;
}

export interface ActivityRow {
  id: string;
  account_id: string;
  contact_id: string | null;
  kind: ActivityKind;
  body: string | null;
  occurred_at: string | null;
  created_by: string | null;
  fields: Record<string, string | number> | null;
}

export interface TaskRow {
  id: string;
  account_id: string | null;
  title: string;
  due_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  fields: Record<string, string | number> | null;
}

export function rowToContact(r: ContactRow): Contact {
  return {
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    title: r.title,
    isPrimary: Boolean(r.is_primary),
    fields: r.fields ?? {},
  };
}

export function rowToActivity(r: ActivityRow): Activity {
  return {
    id: r.id,
    accountId: r.account_id,
    contactId: r.contact_id,
    kind: r.kind,
    body: r.body,
    occurredAt: r.occurred_at,
    createdBy: r.created_by,
    fields: r.fields ?? {},
  };
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    accountId: r.account_id,
    title: r.title,
    dueAt: r.due_at,
    completedAt: r.completed_at,
    assigneeId: r.assignee_id,
    fields: r.fields ?? {},
  };
}

export function contactToRow(c: Partial<Contact>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.id !== undefined)        row.id = c.id;
  if (c.accountId !== undefined) row.account_id = c.accountId;
  if (c.name !== undefined)      row.name = c.name;
  if (c.email !== undefined)     row.email = c.email;
  if (c.phone !== undefined)     row.phone = c.phone;
  if (c.title !== undefined)     row.title = c.title;
  if (c.isPrimary !== undefined) row.is_primary = c.isPrimary;
  if (c.fields !== undefined)    row.fields = c.fields;
  return row;
}

export function activityToRow(a: Partial<Activity>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (a.id !== undefined)         row.id = a.id;
  if (a.accountId !== undefined)  row.account_id = a.accountId;
  if (a.contactId !== undefined)  row.contact_id = a.contactId;
  if (a.kind !== undefined)       row.kind = a.kind;
  if (a.body !== undefined)       row.body = a.body;
  if (a.occurredAt !== undefined) row.occurred_at = a.occurredAt;
  if (a.createdBy !== undefined)  row.created_by = a.createdBy;
  if (a.fields !== undefined)     row.fields = a.fields;
  return row;
}

export function taskToRow(t: Partial<Task>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.id !== undefined)          row.id = t.id;
  if (t.accountId !== undefined)   row.account_id = t.accountId;
  if (t.title !== undefined)       row.title = t.title;
  if (t.dueAt !== undefined)       row.due_at = t.dueAt;
  if (t.completedAt !== undefined) row.completed_at = t.completedAt;
  if (t.assigneeId !== undefined)  row.assignee_id = t.assigneeId;
  if (t.fields !== undefined)      row.fields = t.fields;
  return row;
}
