/**
 * Workspace identity helpers.
 *
 * Phase 1.3 — Reads `directus_users.me.current_workspace` once and caches the
 * result. Writes inject `workspace_id` via `withWorkspace`. Reads filter by
 * `workspace_id` via `lib/directus.ts:fetchItems`. Phase 1.2 will add server
 * policies so even an un-injected request returns scoped data; this module is
 * the belt-and-suspenders client side.
 */

import { getSeedTemplate, type SeedTemplateId, type WorkspaceSettingsSeed } from './seedTemplates';

const BASE_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;

let cached: string | null = null;
let inflight: Promise<string> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
}

function requireBaseUrl(): string {
  if (!BASE_URL) throw new Error('NEXT_PUBLIC_DIRECTUS_URL is not set');
  return BASE_URL;
}

async function fetchUserWorkspace(): Promise<string | null> {
  const base = requireBaseUrl();
  const res = await fetch(`${base}/users/me?fields=current_workspace`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`users/me failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: { current_workspace: string | null } };
  return json.data?.current_workspace ?? null;
}

async function findDefaultWorkspaceId(): Promise<string | null> {
  const base = requireBaseUrl();
  const res = await fetch(`${base}/items/workspaces?filter[slug][_eq]=default&fields=id&limit=1`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ id: string }> };
  return json.data?.[0]?.id ?? null;
}

/**
 * Update the workspace_settings row for `workspaceId`. Looks up the row id
 * (1:1 with workspace) then PATCHes the supplied fields. Caller is responsible
 * for invalidating the `useWorkspaceSettings` cache afterwards.
 */
export async function updateWorkspaceSettings(
  workspaceId: string,
  patch: Partial<WorkspaceSettingsSeed> & { brand_color?: string | null },
): Promise<void> {
  const base = requireBaseUrl();
  const lookup = await fetch(
    `${base}/items/workspace_settings?filter[workspace_id][_eq]=${encodeURIComponent(workspaceId)}&fields=id&limit=1`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!lookup.ok) throw new Error(`workspace_settings lookup failed: ${lookup.status}`);
  const json = (await lookup.json()) as { data?: Array<{ id: string }> };
  const rowId = json.data?.[0]?.id;
  if (!rowId) throw new Error('workspace_settings row not found for current workspace');
  const res = await fetch(`${base}/items/workspace_settings/${encodeURIComponent(rowId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH workspace_settings failed: ${res.status}`);
}

/** Persist `current_workspace` on the logged-in user and update the local cache. */
export async function setCurrentWorkspaceId(id: string): Promise<void> {
  const base = requireBaseUrl();
  const res = await fetch(`${base}/users/me`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_workspace: id }),
  });
  if (!res.ok) throw new Error(`PATCH users/me failed: ${res.status} ${res.statusText}`);
  cached = id;
  notify();
}

/**
 * List workspaces the current user is a member of. Two-step lookup since
 * Directus doesn't easily filter `workspaces` by inverse relation in a
 * single REST call: first fetch my `workspace_members` rows (filtered to me
 * by the policy), then look up the matching workspaces by id.
 */
export async function getMyWorkspaces(): Promise<Workspace[]> {
  const base = requireBaseUrl();
  const memRes = await fetch(`${base}/items/workspace_members?fields=workspace_id&limit=-1`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!memRes.ok) return [];
  const memJson = (await memRes.json()) as { data?: Array<{ workspace_id: string | null }> };
  const ids = (memJson.data ?? []).map((m) => m.workspace_id).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return [];
  const filter = encodeURIComponent(JSON.stringify({ id: { _in: ids } }));
  const wsRes = await fetch(`${base}/items/workspaces?filter=${filter}&fields=id,name,slug&limit=-1&sort=sort,name`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!wsRes.ok) return [];
  const wsJson = (await wsRes.json()) as { data?: Workspace[] };
  return wsJson.data ?? [];
}

/**
 * Resolve the active workspace id. Reads from `users/me.current_workspace`;
 * if null, looks up the seeded `Default` workspace and assigns it to the user
 * (so existing single-tenant deployments transparently land in Default after
 * 1.1a/1.1b ship). Throws if neither is available — that means bootstrap
 * hasn't run.
 */
export async function getCurrentWorkspaceId(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const fromUser = await fetchUserWorkspace();
    if (fromUser) {
      cached = fromUser;
      return fromUser;
    }
    const fallback = await findDefaultWorkspaceId();
    if (!fallback) {
      throw new Error('No workspace available. Run scripts/bootstrap-directus.mjs to create the Default workspace.');
    }
    // Make sure the user is a member of Default before flipping, otherwise the
    // workspace-members-driven switcher in 1.5 won't list it.
    await ensureMembership(fallback, 'member').catch(() => {});
    await setCurrentWorkspaceId(fallback);
    return fallback;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Drop the cached workspace id (sign-out, workspace switch). */
export function clearWorkspaceCache(): void {
  cached = null;
  notify();
}

/** Subscribe to workspace-id changes (used by `useCurrentWorkspaceId`). */
export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot of the cached workspace id. May be null on first render. */
export function getWorkspaceSnapshot(): string | null {
  return cached;
}

/**
 * Inject `workspace_id` into a Directus write payload. Every create call in
 * `lib/directus-write.ts` runs its row payload through this helper before
 * POSTing. Updates and deletes target a specific row id and don't need it.
 */
export async function withWorkspace<T extends Record<string, unknown>>(
  body: T,
): Promise<T & { workspace_id: string }> {
  const workspace_id = await getCurrentWorkspaceId();
  return { ...body, workspace_id };
}

async function fetchMyUserId(): Promise<string> {
  const base = requireBaseUrl();
  const res = await fetch(`${base}/users/me?fields=id`, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`users/me failed: ${res.status}`);
  const json = (await res.json()) as { data?: { id: string } };
  if (!json.data?.id) throw new Error('users/me returned no id');
  return json.data.id;
}

async function ensureMembership(workspaceId: string, role: 'owner' | 'member' = 'member'): Promise<void> {
  const base = requireBaseUrl();
  const userId = await fetchMyUserId();
  const exists = await fetch(
    `${base}/items/workspace_members?filter[workspace_id][_eq]=${encodeURIComponent(workspaceId)}&fields=id&limit=1`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (exists.ok) {
    const json = (await exists.json()) as { data?: Array<unknown> };
    if (json.data?.length) return;
  }
  await fetch(`${base}/items/workspace_members`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId, user_id: userId, role }),
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'workspace';
}

/**
 * Create a new workspace, attach the current user as owner, seed the
 * default pipeline stages + hierarchy levels + settings row, and switch
 * the user's `current_workspace` to the new id. Returns the new workspace.
 *
 * Order matters: settings + members are written before the current_workspace
 * flip (so unscoped/permissive create rules apply); stages + levels are
 * written AFTER the flip so the policy preset auto-fills `workspace_id`.
 */
export async function createWorkspace(
  name: string,
  templateId: SeedTemplateId = 'blank',
  settingsOverrides?: Partial<WorkspaceSettingsSeed>,
): Promise<Workspace> {
  const base = requireBaseUrl();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Workspace name is required');
  const slug = slugify(trimmed);
  const template = getSeedTemplate(templateId);

  const wsRes = await fetch(`${base}/items/workspaces`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed, slug }),
  });
  if (!wsRes.ok) throw new Error(`POST /items/workspaces failed: ${wsRes.status}`);
  const wsJson = (await wsRes.json()) as { data: Workspace };
  const newId = wsJson.data.id;

  await ensureMembership(newId, 'owner');

  const settings: WorkspaceSettingsSeed = {
    ...template.settings,
    ...settingsOverrides,
    modules_enabled: {
      ...template.settings.modules_enabled,
      ...(settingsOverrides?.modules_enabled ?? {}),
    },
  };

  await fetch(`${base}/items/workspace_settings`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: newId, ...settings }),
  });

  await setCurrentWorkspaceId(newId);

  for (const stage of template.stages) {
    await fetch(`${base}/items/pipeline_stages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stage),
    });
  }
  for (const level of template.levels) {
    await fetch(`${base}/items/hierarchy_levels`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(level),
    });
  }
  for (let i = 0; i < template.fieldDefs.length; i++) {
    const def = template.fieldDefs[i];
    await fetch(`${base}/items/field_definitions`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: def.label,
        type: def.type,
        options: def.options ?? null,
        is_currency: def.isCurrency ?? false,
        entity: def.entity ?? 'account',
        aliases: def.aliases ?? null,
        sort: i,
      }),
    });
  }

  return wsJson.data;
}
