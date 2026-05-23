#!/usr/bin/env node
/**
 * Bootstrap a fresh Directus instance with the collections Vegeta needs:
 *   - field_definitions
 *   - teams
 *   - members    (with team_id M2O -> teams)
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

// Add a single field to an existing collection (idempotent).
async function tryCreateField(token, collection, fieldDef) {
  await tryCreate(token, `/fields/${collection}`, fieldDef, `${collection}.${fieldDef.field}`);
}

// ── Collections ───────────────────────────────────────────────────────────

const ENTITLEMENT_MIRROR_NOTE = {
  tasks_entitled_until:     'Enforcement mirror: tasks entitled until this instant (null = denied). Derived from workspace_entitlements.',
  territory_entitled_until: 'Enforcement mirror: territory entitled until this instant (null = denied). Derived from workspace_entitlements.',
};

const WORKSPACES_COLLECTION = {
  collection: 'workspaces',
  meta: { icon: 'workspaces_outline', note: 'Tenants — each workspace owns its own accounts/teams/geos/etc.', sort_field: 'sort' },
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
      field: 'slug',
      type: 'string',
      meta: { interface: 'input', required: true, note: 'URL-safe identifier, unique across the instance' },
    },
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true } },
    {
      field: 'created_at',
      type: 'timestamp',
      meta: { interface: 'datetime', readonly: true, special: ['date-created'] },
    },
    {
      field: 'tasks_entitled_until',
      type: 'timestamp',
      meta: { interface: 'datetime', note: ENTITLEMENT_MIRROR_NOTE.tasks_entitled_until },
    },
    {
      field: 'territory_entitled_until',
      type: 'timestamp',
      meta: { interface: 'datetime', note: ENTITLEMENT_MIRROR_NOTE.territory_entitled_until },
    },
  ],
};

const WORKSPACE_MEMBERS_COLLECTION = {
  collection: 'workspace_members',
  meta: { icon: 'group', note: 'Links directus_users to workspaces with a workspace-level role' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'workspace_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], required: true },
    },
    {
      field: 'user_id',
      type: 'uuid',
      meta: {
        interface: 'select-dropdown-m2o',
        options: { template: '{{first_name}} {{last_name}}' },
        special: ['m2o'],
        required: true,
      },
    },
    {
      field: 'role',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        required: true,
        options: {
          choices: [
            { text: 'Owner', value: 'owner' },
            { text: 'Admin', value: 'admin' },
            { text: 'Member', value: 'member' },
          ],
        },
      },
      schema: { default_value: 'member' },
    },
  ],
};

const WORKSPACE_SETTINGS_COLLECTION = {
  collection: 'workspace_settings',
  meta: { icon: 'tune', note: 'Per-workspace customization (entity noun, owner noun, enabled modules, branding) — 1:1 with workspaces' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'workspace_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], required: true, note: '1:1 — exactly one settings row per workspace' },
    },
    {
      field: 'entity_noun_singular',
      type: 'string',
      meta: { interface: 'input', note: 'e.g. Account, Client, Patient, Property' },
      schema: { default_value: 'Account' },
    },
    {
      field: 'entity_noun_plural',
      type: 'string',
      meta: { interface: 'input' },
      schema: { default_value: 'Accounts' },
    },
    {
      field: 'owner_noun',
      type: 'string',
      meta: { interface: 'input', note: 'e.g. Owner, Rep, Agent, Case Manager' },
      schema: { default_value: 'Owner' },
    },
    {
      field: 'modules_enabled',
      type: 'json',
      meta: {
        interface: 'input-code',
        options: { language: 'json' },
        note: 'Toggle major modules on/off, e.g. {"territory":true,"contacts":true,"activities":true,"tasks":true}',
      },
      schema: { default_value: '{"territory":true,"contacts":true,"activities":true,"tasks":true}' },
    },
    {
      field: 'brand_color',
      type: 'string',
      meta: { interface: 'select-color', note: 'Hex (#RRGGBB)' },
    },
  ],
};

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
      field: 'entity',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        required: true,
        note: 'Which entity these custom fields apply to',
        options: {
          choices: [
            { text: 'Account', value: 'account' },
            { text: 'Contact', value: 'contact' },
            { text: 'Activity', value: 'activity' },
            { text: 'Task', value: 'task' },
          ],
        },
      },
      schema: { default_value: 'account' },
    },
    {
      field: 'aliases',
      type: 'json',
      meta: {
        interface: 'tags',
        note: 'Lowercased CSV header strings that should auto-map to this field on import',
        options: { placeholder: 'e.g. "annual revenue"' },
      },
    },
    {
      field: 'sort',
      type: 'integer',
      meta: { interface: 'input', hidden: true },
    },
  ],
};

const HIERARCHY_LEVELS_COLLECTION = {
  collection: 'hierarchy_levels',
  meta: { icon: 'workspaces', note: 'User-managed sales-org levels (IC, Manager, VP, …) referenced by members.level', sort_field: 'sort' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'slug',
      type: 'string',
      meta: { interface: 'input', note: 'Human-readable slug (e.g. "ic", "manager") — unique per workspace, app-enforced' },
    },
    { field: 'label', type: 'string', meta: { interface: 'input', required: true, width: 'full' } },
    {
      field: 'color',
      type: 'string',
      meta: { interface: 'select-color', note: 'Hex (#RRGGBB)', width: 'half' },
    },
    {
      field: 'sort',
      type: 'integer',
      meta: { interface: 'input', hidden: true },
    },
  ],
};

const PIPELINE_STAGES_COLLECTION = {
  collection: 'pipeline_stages',
  meta: { icon: 'view_kanban', note: 'User-managed pipeline stages used by accounts.stage_id', sort_field: 'sort' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'slug',
      type: 'string',
      meta: { interface: 'input', note: 'Human-readable slug (e.g. "prospect", "customer") — unique per workspace, app-enforced' },
    },
    { field: 'label', type: 'string', meta: { interface: 'input', required: true, width: 'full' } },
    { field: 'color', type: 'string', meta: { interface: 'select-color', note: 'Hex (#RRGGBB)', width: 'half' } },
    {
      field: 'sort',
      type: 'integer',
      meta: { interface: 'input', hidden: true },
    },
    { field: 'is_won',  type: 'boolean', meta: { interface: 'boolean', note: 'Terminal "won" stage' }, schema: { default_value: false } },
    { field: 'is_lost', type: 'boolean', meta: { interface: 'boolean', note: 'Terminal "lost" stage' }, schema: { default_value: false } },
  ],
};

// Mirror of lib/seedTemplates.ts. Keep both lists in sync — `.mjs` can't
// import the `.ts` module at runtime, and the same shape feeds both the
// bootstrap script (here) and app-side `createWorkspace`.
const SEED_TEMPLATES = {
  blank: {
    settings: {
      entity_noun_singular: 'Record',
      entity_noun_plural: 'Records',
      owner_noun: 'Owner',
      modules_enabled: { territory: false, contacts: true, activities: true, tasks: true },
    },
    stages: [
      { slug: 'active',   label: 'Active',   color: '#dbeafe', sort: 0, is_won: false, is_lost: false },
      { slug: 'archived', label: 'Archived', color: '#e5e7eb', sort: 1, is_won: false, is_lost: false },
    ],
    levels: [
      { slug: 'ic',      label: 'IC',      color: '#e5e7eb', sort: 0 },
      { slug: 'manager', label: 'Manager', color: '#e0e7ff', sort: 1 },
    ],
    fieldDefs: [],
  },
  sales: {
    settings: {
      entity_noun_singular: 'Account',
      entity_noun_plural: 'Accounts',
      owner_noun: 'Rep',
      modules_enabled: { territory: true, contacts: true, activities: true, tasks: true },
    },
    stages: [
      { slug: 'prospect',    label: 'Prospect',    color: '#e5e7eb', sort: 0, is_won: false, is_lost: false },
      { slug: 'lead',        label: 'Lead',        color: '#dbeafe', sort: 1, is_won: false, is_lost: false },
      { slug: 'opportunity', label: 'Opportunity', color: '#fef3c7', sort: 2, is_won: false, is_lost: false },
      { slug: 'customer',    label: 'Customer',    color: '#dcfce7', sort: 3, is_won: true,  is_lost: false },
      { slug: 'churned',     label: 'Churned',     color: '#fee2e2', sort: 4, is_won: false, is_lost: true  },
    ],
    levels: [
      { slug: 'ic',       label: 'IC',       color: '#e5e7eb', sort: 0 },
      { slug: 'lead',     label: 'Lead',     color: '#dbeafe', sort: 1 },
      { slug: 'manager',  label: 'Manager',  color: '#e0e7ff', sort: 2 },
      { slug: 'director', label: 'Director', color: '#ede9fe', sort: 3 },
      { slug: 'vp',       label: 'VP',       color: '#fef3c7', sort: 4 },
      { slug: 'cro',      label: 'CRO',      color: '#fee2e2', sort: 5 },
    ],
    fieldDefs: [
      { label: 'Segment',   type: 'categorical', options: ['SMB', 'Mid-Market', 'Enterprise'], aliases: ['market segment', 'customer segment', 'company segment'] },
      { label: 'Industry',  type: 'categorical', options: ['SaaS', 'FinTech', 'Healthcare', 'E-commerce', 'Manufacturing', 'Education', 'Media', 'Government', 'Other'], aliases: ['vertical', 'sector', 'industry vertical'] },
      { label: 'Tier',      type: 'categorical', options: ['Tier 1', 'Tier 2', 'Tier 3', 'Untiered'], aliases: ['account tier', 'priority tier', 'customer tier'] },
      { label: 'ARR',       type: 'metric',      isCurrency: true, aliases: ['annual revenue', 'annual_revenue', 'contract value', 'acv', 'annual contract value'] },
      { label: 'MRR',       type: 'metric',      isCurrency: true, aliases: ['monthly revenue', 'monthly_revenue', 'monthly recurring revenue'] },
      { label: 'Headcount', type: 'metric', aliases: ['employees', 'head count', 'employee count', 'num employees', 'company size'] },
    ],
  },
  agency: {
    settings: {
      entity_noun_singular: 'Client',
      entity_noun_plural: 'Clients',
      owner_noun: 'Account Manager',
      modules_enabled: { territory: false, contacts: true, activities: true, tasks: true },
    },
    stages: [
      { slug: 'prospect',  label: 'Prospect',  color: '#e5e7eb', sort: 0, is_won: false, is_lost: false },
      { slug: 'pitching',  label: 'Pitching',  color: '#fef3c7', sort: 1, is_won: false, is_lost: false },
      { slug: 'active',    label: 'Active',    color: '#dcfce7', sort: 2, is_won: true,  is_lost: false },
      { slug: 'paused',    label: 'Paused',    color: '#fee2e2', sort: 3, is_won: false, is_lost: false },
      { slug: 'completed', label: 'Completed', color: '#dbeafe', sort: 4, is_won: true,  is_lost: false },
    ],
    levels: [
      { slug: 'am',       label: 'Account Manager', color: '#e5e7eb', sort: 0 },
      { slug: 'director', label: 'Director',        color: '#e0e7ff', sort: 1 },
      { slug: 'partner',  label: 'Partner',         color: '#fef3c7', sort: 2 },
    ],
    fieldDefs: [
      { label: 'Industry',     type: 'categorical', options: ['SaaS', 'CPG', 'Financial Services', 'Healthcare', 'Retail', 'Other'] },
      { label: 'Service Type', type: 'categorical', options: ['Branding', 'Performance', 'Creative', 'Strategy', 'Full-service'] },
      { label: 'Retainer',     type: 'metric',      isCurrency: true },
    ],
  },
  'real-estate': {
    settings: {
      entity_noun_singular: 'Property',
      entity_noun_plural: 'Properties',
      owner_noun: 'Agent',
      modules_enabled: { territory: true, contacts: true, activities: true, tasks: true },
    },
    stages: [
      { slug: 'listed',         label: 'Listed',         color: '#dbeafe', sort: 0, is_won: false, is_lost: false },
      { slug: 'showing',        label: 'Showing',        color: '#fef3c7', sort: 1, is_won: false, is_lost: false },
      { slug: 'under-contract', label: 'Under Contract', color: '#e0e7ff', sort: 2, is_won: false, is_lost: false },
      { slug: 'sold',           label: 'Sold',           color: '#dcfce7', sort: 3, is_won: true,  is_lost: false },
      { slug: 'withdrawn',      label: 'Withdrawn',      color: '#fee2e2', sort: 4, is_won: false, is_lost: true  },
    ],
    levels: [
      { slug: 'agent',  label: 'Agent',  color: '#e5e7eb', sort: 0 },
      { slug: 'broker', label: 'Broker', color: '#e0e7ff', sort: 1 },
      { slug: 'owner',  label: 'Owner',  color: '#fef3c7', sort: 2 },
    ],
    fieldDefs: [
      { label: 'Property Type', type: 'categorical', options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Commercial', 'Land'] },
      { label: 'List Price',    type: 'metric',      isCurrency: true },
      { label: 'Bedrooms',      type: 'metric' },
      { label: 'Bathrooms',     type: 'metric' },
      { label: 'Square Feet',   type: 'metric' },
    ],
  },
};

const TEAMS_COLLECTION = {
  collection: 'teams',
  meta: { icon: 'groups', note: 'Sales teams — hierarchical (parent_id) with a designated lead member', sort_field: 'sort' },
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
      field: 'color',
      type: 'string',
      meta: { interface: 'select-color', note: 'Hex (#RRGGBB)', width: 'half' },
    },
    {
      field: 'parent_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'null = root team' },
    },
    {
      field: 'lead_member_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'Member designated as the team lead' },
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
  meta: { icon: 'person', note: 'Sales reps' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    { field: 'name', type: 'string', meta: { interface: 'input', required: true } },
    { field: 'email', type: 'string', meta: { interface: 'input' } },
    { field: 'role', type: 'string', meta: { interface: 'input' } },
    {
      field: 'level',
      type: 'uuid',
      meta: {
        interface: 'select-dropdown-m2o',
        options: { template: '{{label}}' },
        special: ['m2o'],
        note: 'FK to hierarchy_levels.id (uuid)',
      },
    },
    {
      field: 'team_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'] },
    },
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
      field: 'geo_node_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'Optional Geo assignment — overrides country/state for map coloring' },
    },
    {
      field: 'rep_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'] },
    },
    {
      field: 'stage_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{label}}' }, special: ['m2o'], note: 'FK to pipeline_stages.id (uuid)' },
    },
    {
      field: 'fields',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, note: 'Dynamic field values keyed by field_definitions.id' },
      schema: { default_value: '{}' },
    },
  ],
};

const GEO_NODES_COLLECTION = {
  collection: 'geo_nodes',
  meta: { icon: 'public', note: 'Hierarchical territory groups — own countries/states + provide map colors', sort_field: 'sort' },
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
      field: 'color',
      type: 'string',
      meta: { interface: 'select-color', note: 'Hex (#RRGGBB) — null inherits the nearest ancestor with a color', width: 'half' },
    },
    {
      field: 'parent_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'null = root' },
    },
    {
      field: 'sort',
      type: 'integer',
      meta: { interface: 'input', hidden: true },
    },
    {
      field: 'country_codes',
      type: 'json',
      meta: { interface: 'tags', note: 'ISO2 country codes directly assigned to this node', options: { placeholder: 'e.g. US' } },
      schema: { default_value: '[]' },
    },
    {
      field: 'state_codes',
      type: 'json',
      meta: { interface: 'tags', note: 'State codes ("US:US-CA") directly assigned to this node', options: { placeholder: 'e.g. US:US-CA' } },
      schema: { default_value: '[]' },
    },
  ],
};

const CONTACTS_COLLECTION = {
  collection: 'contacts',
  meta: { icon: 'person', note: 'People associated with an account', sort_field: 'sort' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'account_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], required: true },
    },
    { field: 'name',  type: 'string', meta: { interface: 'input', required: true, width: 'full' } },
    { field: 'email', type: 'string', meta: { interface: 'input', width: 'half' } },
    { field: 'phone', type: 'string', meta: { interface: 'input', width: 'half' } },
    { field: 'title', type: 'string', meta: { interface: 'input', note: 'Job title / role' } },
    {
      field: 'is_primary',
      type: 'boolean',
      meta: { interface: 'boolean', note: 'Primary contact for the account' },
      schema: { default_value: false },
    },
    {
      field: 'fields',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, note: 'Dynamic field values keyed by field_definitions.id (entity=contact)' },
      schema: { default_value: '{}' },
    },
    { field: 'sort', type: 'integer', meta: { interface: 'input', hidden: true } },
  ],
};

const ACTIVITIES_COLLECTION = {
  collection: 'activities',
  meta: { icon: 'history', note: 'Notes, calls, emails, meetings logged on an account', sort_field: 'occurred_at' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'account_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], required: true },
    },
    {
      field: 'contact_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'Optional — pin activity to a specific contact' },
    },
    {
      field: 'kind',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        required: true,
        options: {
          choices: [
            { text: 'Note',    value: 'note' },
            { text: 'Call',    value: 'call' },
            { text: 'Email',   value: 'email' },
            { text: 'Meeting', value: 'meeting' },
          ],
        },
      },
      schema: { default_value: 'note' },
    },
    { field: 'body', type: 'text', meta: { interface: 'input-multiline' } },
    {
      field: 'occurred_at',
      type: 'timestamp',
      meta: { interface: 'datetime', note: 'When the activity happened (not row-create time)' },
    },
    {
      field: 'created_by',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'Member who logged this activity' },
    },
    {
      field: 'fields',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, note: 'Dynamic field values keyed by field_definitions.id (entity=activity)' },
      schema: { default_value: '{}' },
    },
  ],
};

const WORKSPACE_ENTITLEMENTS_COLLECTION = {
  collection: 'workspace_entitlements',
  meta: { icon: 'verified', note: 'Per-workspace module entitlements — default-deny: no row means no access to the add-on collection' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'workspace_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], required: true },
    },
    {
      field: 'module',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        required: true,
        note: 'The sellable module this entitlement covers (tasks | territory)',
        options: {
          choices: [
            { text: 'Tasks',     value: 'tasks' },
            { text: 'Territory', value: 'territory' },
          ],
        },
      },
    },
    {
      field: 'status',
      type: 'string',
      meta: {
        interface: 'select-dropdown',
        required: true,
        note: 'active | trial | disabled',
        options: {
          choices: [
            { text: 'Active',   value: 'active' },
            { text: 'Trial',    value: 'trial' },
            { text: 'Disabled', value: 'disabled' },
          ],
        },
      },
      schema: { default_value: 'disabled' },
    },
    {
      field: 'expires_at',
      type: 'timestamp',
      meta: { interface: 'datetime', note: 'null = never expires; set for trial/time-limited entitlements' },
    },
  ],
};

const TASKS_COLLECTION = {
  collection: 'tasks',
  meta: { icon: 'check_box', note: 'To-dos — optionally pinned to an account', sort_field: 'due_at' },
  schema: {},
  fields: [
    {
      field: 'id',
      type: 'uuid',
      meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
      schema: { is_primary_key: true, has_auto_increment: false },
    },
    {
      field: 'account_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'Optional — tasks can be standalone' },
    },
    { field: 'title', type: 'string', meta: { interface: 'input', required: true, width: 'full' } },
    {
      field: 'due_at',
      type: 'timestamp',
      meta: { interface: 'datetime', width: 'half' },
    },
    {
      field: 'completed_at',
      type: 'timestamp',
      meta: { interface: 'datetime', note: 'null = open, set = done', width: 'half' },
    },
    {
      field: 'assignee_id',
      type: 'uuid',
      meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'Member assigned to this task' },
    },
    {
      field: 'fields',
      type: 'json',
      meta: { interface: 'input-code', options: { language: 'json' }, note: 'Dynamic field values keyed by field_definitions.id (entity=task)' },
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

// Upsert a single permission row. Unlike `tryCreate`, this PATCHes existing
// rows so re-running bootstrap actually applies new filters/presets to live
// instances (otherwise the legacy "no filter" permission silently sticks).
async function ensurePermission(token, policyId, collection, action, opts = {}) {
  const label = `${opts.label ?? 'permission'}: ${action} ${collection}`;
  const body = {
    policy: policyId,
    collection,
    action,
    fields: ['*'],
    permissions: {},
    validation: {},
    presets: null,
  };
  if (opts.scopedByWorkspace) {
    const wsFilter = { workspace_id: { _eq: '$CURRENT_USER.current_workspace' } };
    if (action === 'create') {
      body.validation = wsFilter;
      body.presets = { workspace_id: '$CURRENT_USER.current_workspace' };
    } else if (opts.entitlementModule) {
      // Directus-11-valid gate: traverse the M2O workspace_id to the scalar
      // enforcement mirror column workspaces.<module>_entitled_until and
      // require it to be strictly after $NOW. null (disabled/none) fails
      // _gt → deny. Perpetual = far-future sentinel. Trial expiry self-
      // enforces at query time (no scheduler). The mirror is kept in sync by
      // lib/entitlementsAdmin.setEntitlement + the recompute pass below.
      body.permissions = {
        _and: [
          wsFilter,
          {
            workspace_id: {
              [`${opts.entitlementModule}_entitled_until`]: { _gt: '$NOW' },
            },
          },
        ],
      };
    } else {
      body.permissions = wsFilter;
    }
  } else if (opts.scopedByUser) {
    // workspace_members: each user sees / mutates only their own membership row.
    // Create accepts any workspace_id (so onboarding can land you in a new ws),
    // but user_id is force-set via preset and the validation still requires
    // it to equal $CURRENT_USER as a defense in depth.
    const filter = { user_id: { _eq: '$CURRENT_USER' } };
    if (action === 'create') {
      body.validation = filter;
      body.presets = { user_id: '$CURRENT_USER' };
    } else {
      body.permissions = filter;
    }
  } else if (opts.scopedBySettingsWorkspace) {
    // workspace_settings: read/update/delete restricted to the current
    // workspace's settings row. Create is left open so the onboarding flow
    // can write the settings row before flipping current_workspace.
    if (action !== 'create') {
      body.permissions = { workspace_id: { _eq: '$CURRENT_USER.current_workspace' } };
    }
  }
  // Idempotent: collapse to exactly one rule per (policy, collection, action).
  // Historical bootstrap runs accumulated duplicate rows (including
  // unrestricted `{}` reads that nullified the gate AND workspace isolation);
  // delete all then write one canonical rule.
  // A mid-loop failure leaves fewer duplicates and no canonical rule; a re-run converges (the same accepted brief zero-rule window).
  const existing = await api(
    token,
    'GET',
    `/permissions?filter[policy][_eq]=${policyId}&filter[collection][_eq]=${encodeURIComponent(collection)}&filter[action][_eq]=${action}&fields=id&limit=-1`,
  );
  for (const row of existing ?? []) {
    await api(token, 'DELETE', `/permissions/${row.id}`);
  }
  await api(token, 'POST', '/permissions', body);
  const removed = (existing ?? []).length;
  console.log(`  ✓ set ${label}${removed ? ` (removed ${removed} prior rule(s))` : ''}`);
}

// Workspace-scoped collections: every read/update/delete is filtered to the
// user's current workspace; every create injects workspace_id automatically.
const WORKSPACE_SCOPED_COLLECTIONS = [
  'accounts',
  'field_definitions',
  'pipeline_stages',
  'hierarchy_levels',
  'members',
  'teams',
  'geo_nodes',
  'contacts',
  'activities',
  'tasks',
  // workspace_entitlements is intentionally here: the non-admin policy needs
  // workspace-scoped READ on it so the app can read its own entitlements.
  // The generic Phase 1.1b loop also attempts to add its workspace_id
  // field/relation (with on_delete: SET NULL), but the EXPLICIT relation block
  // above runs first and wins with CASCADE — do NOT remove the explicit block
  // in favour of the generic loop, which would silently downgrade to SET NULL.
  'workspace_entitlements',
];

// Add-on collections that require an active entitlement row in
// workspace_entitlements to be readable.  Map: collection → module name.
const ADDON_COLLECTION_MODULE = {
  tasks:             'tasks',
  geo_nodes:         'territory',
  teams:             'territory',
  hierarchy_levels:  'territory',
};

async function grantPolicyPermissions(token, policyId, actions, label) {
  for (const collection of WORKSPACE_SCOPED_COLLECTIONS) {
    for (const action of actions) {
      const addonModule = ADDON_COLLECTION_MODULE[collection];
      // For add-on collections, gate READ with an entitlement check.
      // All other actions (create/update/delete) remain workspace-scoped only
      // (server enforces entitlement for reads; write access is handled
      // separately by app-level guards).
      const opts = { scopedByWorkspace: true, label };
      if (addonModule && action === 'read') {
        opts.entitlementModule = addonModule;
      }
      await ensurePermission(token, policyId, collection, action, opts);
    }
  }
  for (const action of actions) {
    // workspaces: open read so the switcher can resolve names; create open so
    // any Editor can stand up a new workspace via onboarding. Update/delete on
    // the workspace itself stay open for now (refining ownership semantics is
    // out of scope here).
    await ensurePermission(token, policyId, 'workspaces', action, { label });
    await ensurePermission(token, policyId, 'workspace_members', action, { scopedByUser: true, label });
    await ensurePermission(token, policyId, 'workspace_settings', action, { scopedBySettingsWorkspace: true, label });
  }
}

// Idempotent per-workspace seed: ensures the workspace has a settings row +
// pipeline_stages + hierarchy_levels + field_definitions matching the chosen
// template. Re-running is a no-op once the workspace is fully seeded.
//
// `opts.template` selects a SEED_TEMPLATES key (default 'sales' so existing
// bootstrapped instances still get the same starter kit). New workspaces
// created from the app via createWorkspace default to 'blank' instead.
async function seedWorkspaceDefaults(token, workspaceId, opts = {}) {
  const templateId = opts.template ?? 'sales';
  const template = SEED_TEMPLATES[templateId];
  if (!template) throw new Error(`Unknown seed template: ${templateId}`);

  const settings = await api(token, 'GET', `/items/workspace_settings?filter[workspace_id][_eq]=${workspaceId}&limit=1`);
  if (settings?.[0]) {
    console.log(`  ⟳ workspace_settings for ${workspaceId} already exists`);
  } else {
    await api(token, 'POST', '/items/workspace_settings', {
      workspace_id: workspaceId,
      ...template.settings,
    });
    console.log(`  ✓ seeded workspace_settings (${templateId}) for ${workspaceId}`);
  }

  const stages = await api(token, 'GET', `/items/pipeline_stages?filter[workspace_id][_eq]=${workspaceId}&fields=id&limit=1`);
  if (stages?.length) {
    console.log(`  ⟳ pipeline_stages already seeded in ${workspaceId}`);
  } else {
    for (const stg of template.stages) {
      await api(token, 'POST', '/items/pipeline_stages', { ...stg, workspace_id: workspaceId });
    }
    console.log(`  ✓ seeded ${template.stages.length} pipeline_stages in ${workspaceId}`);
  }

  const levels = await api(token, 'GET', `/items/hierarchy_levels?filter[workspace_id][_eq]=${workspaceId}&fields=id&limit=1`);
  if (levels?.length) {
    console.log(`  ⟳ hierarchy_levels already seeded in ${workspaceId}`);
  } else {
    for (const lvl of template.levels) {
      await api(token, 'POST', '/items/hierarchy_levels', { ...lvl, workspace_id: workspaceId });
    }
    console.log(`  ✓ seeded ${template.levels.length} hierarchy_levels in ${workspaceId}`);
  }

  const defs = await api(token, 'GET', `/items/field_definitions?filter[workspace_id][_eq]=${workspaceId}&fields=id&limit=1`);
  if (defs?.length) {
    console.log(`  ⟳ field_definitions already seeded in ${workspaceId}`);
  } else if (template.fieldDefs.length === 0) {
    console.log(`  ⟳ template ${templateId} has no field_definitions to seed`);
  } else {
    for (let i = 0; i < template.fieldDefs.length; i++) {
      const def = template.fieldDefs[i];
      await api(token, 'POST', '/items/field_definitions', {
        workspace_id: workspaceId,
        label: def.label,
        type: def.type,
        options: def.options ?? null,
        is_currency: def.isCurrency ?? false,
        entity: def.entity ?? 'account',
        aliases: def.aliases ?? null,
        sort: i,
      });
    }
    console.log(`  ✓ seeded ${template.fieldDefs.length} field_definitions in ${workspaceId}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`→ Logging in as ${EMAIL} on ${URL}`);
  const token = await login();

  console.log('→ Creating workspace collections');
  await tryCreate(token, '/collections', WORKSPACES_COLLECTION, 'workspaces');
  await tryCreate(token, '/collections', WORKSPACE_MEMBERS_COLLECTION, 'workspace_members');
  await tryCreate(token, '/collections', WORKSPACE_SETTINGS_COLLECTION, 'workspace_settings');
  await tryCreate(token, '/collections', WORKSPACE_ENTITLEMENTS_COLLECTION, 'workspace_entitlements');

  console.log('→ Creating collections');
  await tryCreate(token, '/collections', FIELD_DEFINITIONS_COLLECTION, 'field_definitions');
  await tryCreate(token, '/collections', HIERARCHY_LEVELS_COLLECTION, 'hierarchy_levels');
  await tryCreate(token, '/collections', PIPELINE_STAGES_COLLECTION, 'pipeline_stages');
  await tryCreate(token, '/collections', TEAMS_COLLECTION, 'teams');
  await tryCreate(token, '/collections', MEMBERS_COLLECTION, 'members');
  await tryCreate(token, '/collections', ACCOUNTS_COLLECTION, 'accounts');
  await tryCreate(token, '/collections', GEO_NODES_COLLECTION, 'geo_nodes');
  await tryCreate(token, '/collections', CONTACTS_COLLECTION, 'contacts');
  await tryCreate(token, '/collections', ACTIVITIES_COLLECTION, 'activities');
  await tryCreate(token, '/collections', TASKS_COLLECTION, 'tasks');

  // Backfill field_definitions.entity for instances bootstrapped before
  // Phase 3. Existing rows default to 'account' via the column default.
  console.log('→ Ensuring field_definitions.entity field');
  await tryCreateField(token, 'field_definitions', {
    field: 'entity',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      note: 'Which entity these custom fields apply to',
      options: {
        choices: [
          { text: 'Account',  value: 'account' },
          { text: 'Contact',  value: 'contact' },
          { text: 'Activity', value: 'activity' },
          { text: 'Task',     value: 'task' },
        ],
      },
    },
    schema: { default_value: 'account' },
  });
  console.log('→ Ensuring field_definitions.aliases field');
  await tryCreateField(token, 'field_definitions', {
    field: 'aliases',
    type: 'json',
    meta: {
      interface: 'tags',
      note: 'Lowercased CSV header strings that should auto-map to this field on import',
      options: { placeholder: 'e.g. "annual revenue"' },
    },
  });
  // Backfill any null rows on existing instances.
  const orphanDefs = await api(token, 'GET', '/items/field_definitions?filter[entity][_null]=true&fields=id&limit=-1');
  if (orphanDefs?.length) {
    for (const row of orphanDefs) {
      await api(token, 'PATCH', `/items/field_definitions/${row.id}`, { entity: 'account' });
    }
    console.log(`  ✓ field_definitions: backfilled ${orphanDefs.length} row(s) to entity='account'`);
  } else {
    console.log('  ⟳ field_definitions: no rows needing entity backfill');
  }

  // Backfill accounts.stage_id for instances bootstrapped before pipeline_stages existed.
  // Type is uuid post-1.1c. Existing string columns on legacy instances stay untouched
  // (tryCreateField is a no-op on existing fields); they get migrated by
  // scripts/migrate-to-multitenant.mjs.
  console.log('→ Ensuring accounts.stage_id field');
  await tryCreateField(token, 'accounts', {
    field: 'stage_id',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      options: { template: '{{label}}' },
      special: ['m2o'],
      note: 'FK to pipeline_stages.id (uuid)',
    },
  });

  // Backfill member columns for instances bootstrapped before teams existed.
  console.log('→ Ensuring member fields');
  await tryCreateField(token, 'members', { field: 'email', type: 'string', meta: { interface: 'input' } });
  await tryCreateField(token, 'members', { field: 'role', type: 'string', meta: { interface: 'input' } });
  // members.level is a uuid M2O to hierarchy_levels.id post-1.1c. Existing string
  // columns on legacy instances stay untouched (tryCreateField is a no-op on existing
  // fields); they get migrated by scripts/migrate-to-multitenant.mjs.
  await tryCreateField(token, 'members', {
    field: 'level',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', options: { template: '{{label}}' }, special: ['m2o'] },
  });
  // members.team_id was originally created as a string; re-creating as uuid so
  // the FK to teams works. Existing string columns must be deleted manually
  // (DELETE /fields/members/team_id) before re-running bootstrap to upgrade.
  await tryCreateField(token, 'members', {
    field: 'team_id',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'] },
  });

  // Backfill team hierarchy fields for instances bootstrapped before nesting landed.
  console.log('→ Ensuring team hierarchy fields');
  await tryCreateField(token, 'teams', {
    field: 'parent_id',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'null = root team' },
  });
  await tryCreateField(token, 'teams', {
    field: 'lead_member_id',
    type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', options: { template: '{{name}}' }, special: ['m2o'], note: 'Member designated as the team lead' },
  });

  // Backfill geo_node_id for instances bootstrapped before Geo landed.
  console.log('→ Ensuring accounts.geo_node_id field');
  await tryCreateField(token, 'accounts', {
    field: 'geo_node_id',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      options: { template: '{{name}}' },
      special: ['m2o'],
      note: 'Optional Geo assignment — overrides country/state for map coloring',
    },
  });

  console.log('→ Creating relations');
  await tryCreate(token, '/relations', {
    collection: 'accounts',
    field: 'rep_id',
    related_collection: 'members',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'accounts.rep_id → members');

  await tryCreate(token, '/relations', {
    collection: 'accounts',
    field: 'geo_node_id',
    related_collection: 'geo_nodes',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'accounts.geo_node_id → geo_nodes');

  await tryCreate(token, '/relations', {
    collection: 'geo_nodes',
    field: 'parent_id',
    related_collection: 'geo_nodes',
    meta: { one_field: null, sort_field: 'sort', one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'geo_nodes.parent_id → geo_nodes (self)');

  await tryCreate(token, '/relations', {
    collection: 'members',
    field: 'team_id',
    related_collection: 'teams',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'members.team_id → teams');

  await tryCreate(token, '/relations', {
    collection: 'teams',
    field: 'parent_id',
    related_collection: 'teams',
    meta: { one_field: null, sort_field: 'sort', one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'teams.parent_id → teams (self)');

  await tryCreate(token, '/relations', {
    collection: 'teams',
    field: 'lead_member_id',
    related_collection: 'members',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'teams.lead_member_id → members');

  await tryCreate(token, '/relations', {
    collection: 'accounts',
    field: 'stage_id',
    related_collection: 'pipeline_stages',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'accounts.stage_id → pipeline_stages');

  await tryCreate(token, '/relations', {
    collection: 'members',
    field: 'level',
    related_collection: 'hierarchy_levels',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'members.level → hierarchy_levels');

  await tryCreate(token, '/relations', {
    collection: 'contacts',
    field: 'account_id',
    related_collection: 'accounts',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  }, 'contacts.account_id → accounts');

  await tryCreate(token, '/relations', {
    collection: 'activities',
    field: 'account_id',
    related_collection: 'accounts',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  }, 'activities.account_id → accounts');

  await tryCreate(token, '/relations', {
    collection: 'activities',
    field: 'contact_id',
    related_collection: 'contacts',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'activities.contact_id → contacts');

  await tryCreate(token, '/relations', {
    collection: 'activities',
    field: 'created_by',
    related_collection: 'members',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'activities.created_by → members');

  await tryCreate(token, '/relations', {
    collection: 'tasks',
    field: 'account_id',
    related_collection: 'accounts',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  }, 'tasks.account_id → accounts');

  await tryCreate(token, '/relations', {
    collection: 'tasks',
    field: 'assignee_id',
    related_collection: 'members',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'tasks.assignee_id → members');

  console.log('→ Creating workspace relations');
  await tryCreate(token, '/relations', {
    collection: 'workspace_members',
    field: 'workspace_id',
    related_collection: 'workspaces',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  }, 'workspace_members.workspace_id → workspaces');

  await tryCreate(token, '/relations', {
    collection: 'workspace_members',
    field: 'user_id',
    related_collection: 'directus_users',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  }, 'workspace_members.user_id → directus_users');

  await tryCreate(token, '/relations', {
    collection: 'workspace_settings',
    field: 'workspace_id',
    related_collection: 'workspaces',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  }, 'workspace_settings.workspace_id → workspaces');

  // AUTHORITATIVE relation for workspace_entitlements — uses CASCADE and sets
  // the named O2M alias required by the permission filter.  The generic
  // Phase 1.1b loop also touches this relation (on_delete: SET NULL) but this
  // explicit block runs first and wins.  Do NOT remove this in favour of the
  // generic loop or the on_delete will silently downgrade to SET NULL.
  await tryCreate(token, '/relations', {
    collection: 'workspace_entitlements',
    field: 'workspace_id',
    related_collection: 'workspaces',
    // one_field MUST be named: the add-on read permission filter traverses
    // workspaces → workspace_entitlements; a null alias silently disables the
    // entitlement gate.
    meta: { one_field: 'workspace_entitlements', sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'CASCADE' },
  }, 'workspace_entitlements.workspace_id → workspaces');

  // ── MANUAL VERIFICATION CHECKLIST (workspace_entitlements + default-deny) ─
  //
  //  ENTITLEMENT ENFORCEMENT — manual verification (Directus 11)
  //  Prereq: a non-admin user (e.g. viewer-test@example.com) whose
  //  current_workspace = the target workspace.
  //  1. After bootstrap, in Directus Admin → Data Model → workspaces, confirm
  //     columns tasks_entitled_until and territory_entitled_until exist.
  //  2. As the non-admin user with territory active:
  //     GET /items/geo_nodes, /items/teams, /items/hierarchy_levels → 200 w/ rows.
  //  3. Set the workspace's territory entitlement disabled via the owner panel
  //     (or PATCH workspace_entitlements then re-run bootstrap), then repeat (2)
  //     → HTTP 200 with data: [] (NOT 500, NOT other-workspace rows).
  //  4. tasks parity: toggle tasks entitlement, GET /items/tasks → 200 rows ↔ 200 [].
  //  5. Trial: set territory trial with expires_at in the FUTURE → reads allowed;
  //     set it in the PAST → reads denied (no scheduler involved).
  //  6. Core isolation: GET /items/accounts as the non-admin → exactly the
  //     workspace's own rows; in Directus Admin → Policies, each
  //     policy+collection+action has exactly ONE permission rule (no {} dupes).
  //  7. Idempotency: run `node scripts/bootstrap-directus.mjs` twice → still
  //     one rule per policy+collection+action; mirror columns unchanged.
  //  8. Admin (admin@example.com) is unaffected (bypasses policies).
  // ─────────────────────────────────────────────────────────────────────────

  console.log('→ Ensuring directus_users.current_workspace field');
  await tryCreateField(token, 'directus_users', {
    field: 'current_workspace',
    type: 'uuid',
    meta: {
      interface: 'select-dropdown-m2o',
      options: { template: '{{name}}' },
      special: ['m2o'],
      note: 'The workspace this user is actively viewing — set on workspace switch',
    },
  });
  await tryCreate(token, '/relations', {
    collection: 'directus_users',
    field: 'current_workspace',
    related_collection: 'workspaces',
    meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
    schema: { on_delete: 'SET NULL' },
  }, 'directus_users.current_workspace → workspaces');

  // Enforcement mirror columns (idempotent for already-existing instances).
  // The Directus-11 add-on read permission filter gates on
  // workspaces.<module>_entitled_until _gt $NOW (see ensurePermission).
  // Must run BEFORE the ROLE_DEFS loop so the columns exist when
  // grantPolicyPermissions writes the filter that references them.
  console.log('→ Ensuring workspace entitlement mirror columns');
  for (const field of ['tasks_entitled_until', 'territory_entitled_until']) {
    await tryCreateField(token, 'workspaces', {
      field,
      type: 'timestamp',
      meta: { interface: 'datetime', note: ENTITLEMENT_MIRROR_NOTE[field] },
    });
  }

  for (const def of ROLE_DEFS) {
    console.log(`→ Ensuring role + policy: ${def.name}`);
    const roleId = await ensureRole(token, def);
    const policyId = await ensurePolicy(token, def);
    await linkRoleToPolicy(token, roleId, policyId, def.name);
    await grantPolicyPermissions(token, policyId, def.actions, def.name);
  }

  // Ensure a "Default" workspace exists so legacy single-tenant data has a home
  // once Phase 1.1b lands (which adds workspace_id to existing collections).
  // Idempotent: looks up by slug 'default' before inserting.
  console.log('→ Ensuring Default workspace');
  const existingDefault = await api(token, 'GET', '/items/workspaces?filter[slug][_eq]=default&limit=1');
  let defaultWorkspaceId;
  if (existingDefault?.[0]) {
    defaultWorkspaceId = existingDefault[0].id;
    console.log(`  ⟳ Default workspace exists (${defaultWorkspaceId})`);
  } else {
    const created = await api(token, 'POST', '/items/workspaces', {
      name: 'Default',
      slug: 'default',
      sort: 0,
    });
    defaultWorkspaceId = created.id;
    console.log(`  ✓ created Default workspace (${defaultWorkspaceId})`);
  }

  // ── Phase 1.1b — workspace_id on every existing collection + backfill ──
  // Add `workspace_id` (uuid M2O → workspaces) to every workspace-scoped
  // collection. Existing instances get the column via tryCreateField and
  // their legacy rows backfilled to the Default workspace below. Fresh
  // instances seed with workspace_id pre-set (see seeding blocks).
  console.log('→ Adding workspace_id to existing collections (idempotent)');
  for (const col of WORKSPACE_SCOPED_COLLECTIONS) {
    await tryCreateField(token, col, {
      field: 'workspace_id',
      type: 'uuid',
      meta: {
        interface: 'select-dropdown-m2o',
        options: { template: '{{name}}' },
        special: ['m2o'],
        note: 'Tenant scope — every row belongs to exactly one workspace',
      },
    });
    await tryCreate(token, '/relations', {
      collection: col,
      field: 'workspace_id',
      related_collection: 'workspaces',
      meta: { one_field: null, sort_field: null, one_deselect_action: 'nullify' },
      schema: { on_delete: 'SET NULL' },
    }, `${col}.workspace_id → workspaces`);
  }

  console.log('→ Backfilling legacy rows to Default workspace');
  for (const col of WORKSPACE_SCOPED_COLLECTIONS) {
    const orphans = await api(token, 'GET', `/items/${col}?filter[workspace_id][_null]=true&fields=id&limit=-1`);
    if (!orphans || orphans.length === 0) {
      console.log(`  ⟳ ${col}: no orphans to backfill`);
      continue;
    }
    for (const row of orphans) {
      await api(token, 'PATCH', `/items/${col}/${row.id}`, { workspace_id: defaultWorkspaceId });
    }
    console.log(`  ✓ ${col}: assigned ${orphans.length} legacy row(s) to Default`);
  }

  // Seed default settings + stages + levels into Default workspace, idempotent.
  // Must run AFTER workspace_id columns exist on pipeline_stages /
  // hierarchy_levels (added by the 1.1b loop above). The same helper is
  // invoked from app-side onboarding (createWorkspace) — the app code
  // duplicates the data shape but keeps the same behavior.
  await seedWorkspaceDefaults(token, defaultWorkspaceId, { template: 'sales' });

  // ── Recompute entitlement mirror columns from the source of truth ──
  // workspaces.<module>_entitled_until is what the add-on read permission
  // filter gates on. This repairs drift / first rollout / direct-DB edits.
  // Projection MUST match lib/entitlements.ts:entitledUntil:
  //   disabled → null ; active|trial → expires_at ?? sentinel ; absent row → null
  const PERPETUAL = '9999-12-31T00:00:00.000Z';
  const entUntil = (status, expiresAt) =>
    status === 'disabled' ? null : (expiresAt ?? PERPETUAL);
  console.log('→ Recomputing workspace entitlement mirror columns');
  const allWorkspaces = await api(token, 'GET', '/items/workspaces?fields=id&limit=-1');
  for (const ws of allWorkspaces ?? []) {
    const rows = await api(
      token,
      'GET',
      `/items/workspace_entitlements?filter[workspace_id][_eq]=${ws.id}&fields=module,status,expires_at&limit=-1`,
    );
    // One entitlement row per (workspace, module) is expected (setEntitlement upserts by that key); on accidental duplicates, last row wins.
    const byModule = Object.fromEntries((rows ?? []).map((r) => [r.module, r]));
    const patch = {};
    for (const mod of ['tasks', 'territory']) {
      const r = byModule[mod];
      patch[`${mod}_entitled_until`] = r ? entUntil(r.status, r.expires_at) : null;
    }
    await api(token, 'PATCH', `/items/workspaces/${ws.id}`, patch);
  }
  console.log(`  ✓ recomputed mirrors for ${(allWorkspaces ?? []).length} workspace(s)`);

  // Backfill workspace_members: every existing Directus user gets a member
  // row in Default so they don't lose visibility after the workspace_members-
  // driven switcher lands. Idempotent: skips users who already have a row
  // in Default.
  console.log('→ Backfilling workspace_members for existing users');
  const allUsers = await api(token, 'GET', '/users?fields=id&limit=-1');
  for (const u of allUsers ?? []) {
    const exists = await api(
      token,
      'GET',
      `/items/workspace_members?filter[user_id][_eq]=${u.id}&filter[workspace_id][_eq]=${defaultWorkspaceId}&limit=1`,
    );
    if (exists?.[0]) continue;
    await api(token, 'POST', '/items/workspace_members', {
      workspace_id: defaultWorkspaceId,
      user_id: u.id,
      role: 'member',
    });
    console.log(`  ✓ added user ${u.id} to Default`);
  }

  // Detect legacy slug-PK schema and warn (Phase 1.1c.i). On legacy instances,
  // pipeline_stages.id and hierarchy_levels.id are strings; on v2 they are uuids.
  // Legacy instances continue to work with single-workspace data, but creating a
  // second workspace will collide on the slug PK — so prompt the user to migrate
  // before they need multi-workspace.
  const stageIdField = await api(token, 'GET', '/fields/pipeline_stages/id').catch(() => null);
  const levelIdField = await api(token, 'GET', '/fields/hierarchy_levels/id').catch(() => null);
  const stagePkType  = stageIdField?.type ?? null;
  const levelPkType  = levelIdField?.type ?? null;
  const isLegacy = stagePkType === 'string' || levelPkType === 'string';
  if (isLegacy) {
    console.log('\n⚠ Detected legacy slug-PK schema:');
    if (stagePkType === 'string') console.log('    pipeline_stages.id is "string" (expected "uuid")');
    if (levelPkType === 'string') console.log('    hierarchy_levels.id is "string" (expected "uuid")');
    console.log('  Existing data continues to work in single-workspace mode, but');
    console.log('  creating a second workspace will fail because slug PKs collide');
    console.log('  across workspaces. Run scripts/migrate-to-multitenant.mjs to upgrade.\n');
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
