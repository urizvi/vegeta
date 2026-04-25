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

// ── Roles + policies ──────────────────────────────────────────────────────

const ROLE_DEFS = [
  {
    name: 'Viewer',
    icon: 'visibility',
    description: 'Read-only access to accounts, field_definitions, members',
    app_access: false,
    actions: ['read'],
  },
  {
    name: 'Editor',
    icon: 'edit',
    description: 'Full CRUD on accounts, field_definitions, members',
    app_access: true,
    actions: ['create', 'read', 'update', 'delete'],
  },
];

async function ensureRole(token, def) {
  const existing = await api(token, 'GET', `/roles?filter[name][_eq]=${encodeURIComponent(def.name)}`);
  if (existing?.[0]) {
    console.log(`  ⟳ role "${def.name}" exists (${existing[0].id})`);
    return existing[0].id;
  }
  const created = await api(token, 'POST', '/roles', {
    name: def.name,
    icon: def.icon,
    description: def.description,
  });
  console.log(`  ✓ created role "${def.name}" (${created.id})`);
  return created.id;
}

async function ensurePolicy(token, def) {
  const existing = await api(token, 'GET', `/policies?filter[name][_eq]=${encodeURIComponent(def.name)}`);
  if (existing?.[0]) {
    console.log(`  ⟳ policy "${def.name}" exists (${existing[0].id})`);
    return existing[0].id;
  }
  const created = await api(token, 'POST', '/policies', {
    name: def.name,
    icon: def.icon,
    description: def.description,
    admin_access: false,
    app_access: def.app_access,
  });
  console.log(`  ✓ created policy "${def.name}" (${created.id})`);
  return created.id;
}

async function linkRoleToPolicy(token, roleId, policyId, label) {
  const existing = await api(token, 'GET', `/access?filter[role][_eq]=${roleId}&filter[policy][_eq]=${policyId}`);
  if (existing?.length) {
    console.log(`  ⟳ ${label} already linked`);
    return;
  }
  await api(token, 'POST', '/access', { role: roleId, policy: policyId });
  console.log(`  ✓ linked ${label}`);
}

async function grantPermissions(token, policyId, collections, actions, label) {
  for (const collection of collections) {
    for (const action of actions) {
      await tryCreate(token, '/permissions', {
        policy: policyId,
        collection,
        action,
        fields: ['*'],
        permissions: {},
        validation: {},
      }, `${label}: ${action} ${collection}`);
    }
  }
}

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

  const COLLECTIONS = ['accounts', 'field_definitions', 'members'];

  for (const def of ROLE_DEFS) {
    console.log(`→ Ensuring role + policy: ${def.name}`);
    const roleId = await ensureRole(token, def);
    const policyId = await ensurePolicy(token, def);
    await linkRoleToPolicy(token, roleId, policyId, def.name);
    await grantPermissions(token, policyId, COLLECTIONS, def.actions, def.name);
  }

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('✓ Bootstrap complete');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`\nAdmin UI:  ${URL}/admin`);
  console.log(`Admin:     ${EMAIL} / ${PASSWORD}`);
  console.log('\nNext steps:');
  console.log(`  1. Open ${URL}/admin and sign in as ${EMAIL}.`);
  console.log('  2. Under User Directory → Create User. Assign role "Viewer" or "Editor".');
  console.log('  3. Set a password; share credentials with that user.');
  console.log('  4. They can now log in at the Next app\'s /login page.');
  console.log('');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
