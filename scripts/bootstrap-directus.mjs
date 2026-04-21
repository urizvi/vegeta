#!/usr/bin/env node
/**
 * Bootstrap a fresh Directus instance with the collections Vegeta needs:
 *   - field_definitions
 *   - members
 *   - accounts   (with rep_id M2O -> members)
 *
 * Also creates a read-only "viewer" role, a user in that role, and prints
 * a static bearer token. Paste that token into .env.local as
 * NEXT_PUBLIC_DIRECTUS_TOKEN.
 *
 * Requires Node 18+ (native fetch). Run:
 *   node scripts/bootstrap-directus.mjs
 *
 * Env vars (optional, defaults match docker-compose.yml):
 *   DIRECTUS_URL, DIRECTUS_ADMIN_EMAIL, DIRECTUS_ADMIN_PASSWORD
 */

import { randomUUID } from 'node:crypto';

const URL = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD ?? 'admin';

async function api(token, method, path, body) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.errors?.[0]?.message ?? text;
    throw new Error(`${method} ${path} → ${res.status}: ${err}`);
  }
  return data?.data;
}

async function login() {
  const { access_token } = await api(null, 'POST', '/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
  return access_token;
}

// Wrapper that swallows "already exists" errors so the script is idempotent.
async function tryCreate(token, path, body, label) {
  try {
    await api(token, 'POST', path, body);
    console.log(`  ✓ created ${label}`);
  } catch (e) {
    if (/already exists|duplicate|record not unique|already has an associated relationship/i.test(e.message)) {
      console.log(`  ⟳ ${label} already exists — skipping`);
    } else {
      throw e;
    }
  }
}

// ── Collections ───────────────────────────────────────────────────────────

const FIELD_DEFINITIONS_COLLECTION = {
  collection: 'field_definitions',
  meta: { icon: 'settings_suggest', note: 'User-defined account fields', sort_field: 'sort' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'label',
      type: 'string',
      meta: { interface: 'input', required: true, width: 'full' },
    },
    {
      field: 'type',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        required: true,
        options: {
          choices: [
            { text: 'Categorical', value: 'categorical' },
            { text: 'Metric', value: 'metric' },
            { text: 'Text', value: 'text' },
          ],
        },
      },
    },
    {
      field: 'options',
      type: 'json',
      meta: {
        interface: 'tags',
        note: 'Used when type = categorical',
        options: { placeholder: 'Add option and press enter' },
      },
    },
    {
      field: 'is_currency',
      type: 'boolean',
      meta: { interface: 'boolean', note: 'Used when type = metric' },
      schema: { default_value: false },
    },
    {
      field: 'sort',
      type: 'integer',
      meta: { interface: 'input', hidden: true },
    },
  ],
};

const MEMBERS_COLLECTION = {
  collection: 'members',
  meta: { icon: 'person', note: 'Sales reps (read-only mirror from Next)' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    { field: 'name', type: 'string', meta: { interface: 'input', required: true } },
    { field: 'team_id', type: 'string', meta: { interface: 'input' } },
  ],
};

const ACCOUNTS_COLLECTION = {
  collection: 'accounts',
  meta: { icon: 'business', note: 'Sales accounts — canonical source of truth' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    { field: 'name', type: 'string', meta: { interface: 'input', required: true, width: 'full' } },
    {
      field: 'country',
      type: 'string',
      meta: { interface: 'input', required: true, note: 'ISO2 (e.g. "US")', width: 'half' },
    },
    {
      field: 'state',
      type: 'string',
      meta: { interface: 'input', note: 'Format "US:US-CA"', width: 'half' },
    },
    {
      field: 'rep_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'] },
    },
    {
      field: 'fields',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, note: 'Dynamic field values keyed by field_definitions.id' },
      schema: { default_value: '{}' },
    },
  ],
};

// ── Role + permissions + token ────────────────────────────────────────────

const VIEWER_ROLE_NAME = 'Vegeta Viewer';
const VIEWER_USER_EMAIL = 'viewer@example.com';

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`→ Logging in as ${EMAIL} on ${URL}`);
  const token = await login();

  console.log('→ Creating collections');
  await tryCreate(token, '/collections', FIELD_DEFINITIONS_COLLECTION, 'field_definitions');
  await tryCreate(token, '/collections', MEMBERS_COLLECTION, 'members');
  await tryCreate(token, '/collections', ACCOUNTS_COLLECTION, 'accounts');

  console.log('→ Creating relation: accounts.rep_id → members.id');
  await tryCreate(token, '/relations', {
    collection: 'accounts',
    field: 'rep_id',
    related_collection: 'members',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'accounts.rep_id → members');

  console.log('→ Creating viewer role');
  const existingRoles = await api(token, 'GET', `/roles?filter[name][_eq]=${encodeURIComponent(VIEWER_ROLE_NAME)}`);
  let viewerRoleId = existingRoles?.[0]?.id;
  if (!viewerRoleId) {
    const role = await api(token, 'POST', '/roles', {
      name: VIEWER_ROLE_NAME,
      icon: 'visibility',
      description: 'Read-only access to accounts, field_definitions, members',
      admin_access: false,
      app_access: false,
    });
    viewerRoleId = role.id;
    console.log(`  ✓ created role ${viewerRoleId}`);
  } else {
    console.log(`  ⟳ role already exists (${viewerRoleId})`);
  }

  console.log('→ Creating viewer policy');
  const existingPolicies = await api(token, 'GET', `/policies?filter[name][_eq]=${encodeURIComponent(VIEWER_ROLE_NAME)}`);
  let viewerPolicyId = existingPolicies?.[0]?.id;
  if (!viewerPolicyId) {
    const policy = await api(token, 'POST', '/policies', {
      name: VIEWER_ROLE_NAME,
      icon: 'visibility',
      description: 'Read-only access to accounts, field_definitions, members',
      admin_access: false,
      app_access: false,
    });
    viewerPolicyId = policy.id;
    console.log(`  ✓ created policy ${viewerPolicyId}`);
  } else {
    console.log(`  ⟳ policy already exists (${viewerPolicyId})`);
  }

  console.log('→ Linking policy to role');
  const existingAccess = await api(token, 'GET', `/access?filter[role][_eq]=${viewerRoleId}&filter[policy][_eq]=${viewerPolicyId}`);
  if (!existingAccess?.length) {
    await api(token, 'POST', '/access', { role: viewerRoleId, policy: viewerPolicyId });
    console.log('  ✓ linked');
  } else {
    console.log('  ⟳ already linked');
  }

  console.log('→ Granting read permissions');
  for (const collection of ['accounts', 'field_definitions', 'members']) {
    await tryCreate(token, '/permissions', {
      policy: viewerPolicyId,
      collection,
      action: 'read',
      fields: ['*'],
      permissions: {},
      validation: {},
    }, `read ${collection}`);
  }

  console.log('→ Creating viewer user + static token');
  const existingUsers = await api(token, 'GET', `/users?filter[email][_eq]=${encodeURIComponent(VIEWER_USER_EMAIL)}`);
  let viewerUser = existingUsers?.[0];
  const staticToken = viewerUser?.token ?? `vegeta-${randomUUID()}`;
  if (!viewerUser) {
    viewerUser = await api(token, 'POST', '/users', {
      email: VIEWER_USER_EMAIL,
      password: randomUUID(),
      role: viewerRoleId,
      token: staticToken,
      status: 'active',
    });
    console.log(`  ✓ created user ${viewerUser.id}`);
  } else {
    if (!viewerUser.token) {
      await api(token, 'PATCH', `/users/${viewerUser.id}`, { token: staticToken });
      console.log(`  ✓ issued new token for existing user`);
    } else {
      console.log(`  ⟳ user already exists with a token`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('✓ Bootstrap complete');
  console.log('─────────────────────────────────────────────────────────');
  console.log('\nPaste this into .env.local:\n');
  console.log(`NEXT_PUBLIC_DIRECTUS_URL=${URL}`);
  console.log(`NEXT_PUBLIC_DIRECTUS_TOKEN=${staticToken}`);
  console.log(`NEXT_PUBLIC_DIRECTUS_ADMIN_URL=${URL}/admin`);
  console.log('');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
