#!/usr/bin/env node
/**
 * One-time migration: legacy slug-PK schema → multi-tenant uuid-PK schema.
 *
 * Why: pipeline_stages.id and hierarchy_levels.id used to be string slugs
 * ("prospect", "ic", …). In multi-tenant mode two workspaces both want to
 * own the slug "prospect", which can't share a global PK. We migrate the
 * PKs to uuids and demote the slug to a regular column (unique per
 * workspace, app-enforced).
 *
 * This script DOES NOT modify your database. It reads the current data via
 * Directus REST, generates `migration-1.1c.sql` in the project root, and
 * prints next-step instructions. You review the SQL, back up the database,
 * and apply it via psql.
 *
 * Run:
 *   node scripts/migrate-to-multitenant.mjs
 *
 * Env vars (optional, defaults match docker-compose.yml):
 *   DIRECTUS_URL, DIRECTUS_ADMIN_EMAIL, DIRECTUS_ADMIN_PASSWORD
 */

import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD ?? 'admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SQL_OUT = resolve(PROJECT_ROOT, 'migration-1.1c.sql');

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
  const { access_token } = await api(null, 'POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  return access_token;
}

function quote(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  console.log(`→ Logging in as ${EMAIL} on ${URL}`);
  const token = await login();

  // Detect schema version. If pipeline_stages.id is already uuid, abort.
  const stageIdField = await api(token, 'GET', '/fields/pipeline_stages/id').catch(() => null);
  const levelIdField = await api(token, 'GET', '/fields/hierarchy_levels/id').catch(() => null);
  if (!stageIdField || !levelIdField) {
    console.error('✗ pipeline_stages or hierarchy_levels not found. Run bootstrap-directus.mjs first.');
    process.exit(1);
  }
  if (stageIdField.type !== 'string' && levelIdField.type !== 'string') {
    console.log('✓ Already on v2 schema (uuid PKs). Nothing to migrate.');
    process.exit(0);
  }

  console.log('→ Reading current data');
  const stages = await api(token, 'GET', '/items/pipeline_stages?fields=id,label,workspace_id&limit=-1') ?? [];
  const levels = await api(token, 'GET', '/items/hierarchy_levels?fields=id,label,workspace_id&limit=-1') ?? [];
  const accounts = await api(token, 'GET', '/items/accounts?fields=id,stage_id&limit=-1') ?? [];
  const members  = await api(token, 'GET', '/items/members?fields=id,level&limit=-1') ?? [];

  console.log(`  ${stages.length} pipeline_stages, ${levels.length} hierarchy_levels`);
  console.log(`  ${accounts.length} accounts (${accounts.filter((a) => a.stage_id).length} with stage_id)`);
  console.log(`  ${members.length} members (${members.filter((m) => m.level).length} with level)`);

  const stageMap = new Map(); // oldSlug → newUuid
  const levelMap = new Map();
  for (const s of stages) stageMap.set(s.id, randomUUID());
  for (const l of levels) levelMap.set(l.id, randomUUID());

  // Detect dangling references (account/member points at a slug that doesn't exist).
  const danglingStages = accounts.filter((a) => a.stage_id && !stageMap.has(a.stage_id));
  const danglingLevels = members.filter((m) => m.level && !levelMap.has(m.level));
  if (danglingStages.length || danglingLevels.length) {
    console.warn(`⚠ ${danglingStages.length} account(s) reference unknown stage_id (will be set NULL).`);
    console.warn(`⚠ ${danglingLevels.length} member(s) reference unknown level (will be set NULL).`);
  }

  // Build the SQL.
  const lines = [];
  lines.push('-- migration-1.1c.sql — slug-PK → uuid-PK migration for multi-tenancy');
  lines.push(`-- Generated ${new Date().toISOString()} from ${URL}`);
  lines.push('-- Apply via psql against the Directus database. Wrap in BEGIN/COMMIT (already done below).');
  lines.push('-- BACK UP THE DATABASE FIRST: pg_dump -Fc <db> > backup.dump');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  lines.push('-- 1. Drop FK constraints we will rebuild after the column-type swap.');
  lines.push('--    Constraint names follow Directus/Knex defaults; adjust if your DB differs.');
  lines.push('ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_stage_id_foreign;');
  lines.push('ALTER TABLE members  DROP CONSTRAINT IF EXISTS members_level_foreign;');
  lines.push('');

  lines.push('-- 2. Add staging columns: new_id (uuid PK target) + slug (string carried forward).');
  lines.push('ALTER TABLE pipeline_stages  ADD COLUMN IF NOT EXISTS new_id uuid;');
  lines.push('ALTER TABLE pipeline_stages  ADD COLUMN IF NOT EXISTS slug   varchar(255);');
  lines.push('ALTER TABLE hierarchy_levels ADD COLUMN IF NOT EXISTS new_id uuid;');
  lines.push('ALTER TABLE hierarchy_levels ADD COLUMN IF NOT EXISTS slug   varchar(255);');
  lines.push('');

  lines.push('-- 3. Backfill new_id and slug per row (one UPDATE per legacy slug).');
  for (const s of stages) {
    lines.push(`UPDATE pipeline_stages  SET new_id = ${quote(stageMap.get(s.id))}::uuid, slug = ${quote(s.id)} WHERE id = ${quote(s.id)};`);
  }
  for (const l of levels) {
    lines.push(`UPDATE hierarchy_levels SET new_id = ${quote(levelMap.get(l.id))}::uuid, slug = ${quote(l.id)} WHERE id = ${quote(l.id)};`);
  }
  lines.push('');

  lines.push('-- 4. Convert FK columns from text to uuid via a CASE-WHEN mapping.');
  lines.push('--    Rows pointing at unknown slugs land in NULL.');
  if (stages.length) {
    const cases = stages.map((s) => `WHEN stage_id = ${quote(s.id)} THEN ${quote(stageMap.get(s.id))}::uuid`).join('\n    ');
    lines.push('ALTER TABLE accounts ALTER COLUMN stage_id TYPE uuid USING (');
    lines.push('  CASE');
    lines.push(`    ${cases}`);
    lines.push('    ELSE NULL');
    lines.push('  END');
    lines.push(');');
  } else {
    lines.push('ALTER TABLE accounts ALTER COLUMN stage_id TYPE uuid USING (NULL::uuid);');
  }
  lines.push('');
  if (levels.length) {
    const cases = levels.map((l) => `WHEN level = ${quote(l.id)} THEN ${quote(levelMap.get(l.id))}::uuid`).join('\n    ');
    lines.push('ALTER TABLE members ALTER COLUMN level TYPE uuid USING (');
    lines.push('  CASE');
    lines.push(`    ${cases}`);
    lines.push('    ELSE NULL');
    lines.push('  END');
    lines.push(');');
  } else {
    lines.push('ALTER TABLE members ALTER COLUMN level TYPE uuid USING (NULL::uuid);');
  }
  lines.push('');

  lines.push('-- 5. Swap PKs: drop old constraint + column, rename new_id → id, recreate PK.');
  lines.push('ALTER TABLE pipeline_stages DROP CONSTRAINT pipeline_stages_pkey;');
  lines.push('ALTER TABLE pipeline_stages DROP COLUMN id;');
  lines.push('ALTER TABLE pipeline_stages RENAME COLUMN new_id TO id;');
  lines.push('ALTER TABLE pipeline_stages ALTER COLUMN id SET NOT NULL;');
  lines.push('ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);');
  lines.push('');
  lines.push('ALTER TABLE hierarchy_levels DROP CONSTRAINT hierarchy_levels_pkey;');
  lines.push('ALTER TABLE hierarchy_levels DROP COLUMN id;');
  lines.push('ALTER TABLE hierarchy_levels RENAME COLUMN new_id TO id;');
  lines.push('ALTER TABLE hierarchy_levels ALTER COLUMN id SET NOT NULL;');
  lines.push('ALTER TABLE hierarchy_levels ADD CONSTRAINT hierarchy_levels_pkey PRIMARY KEY (id);');
  lines.push('');

  lines.push('-- 6. Recreate FK constraints (now uuid → uuid).');
  lines.push('ALTER TABLE accounts ADD CONSTRAINT accounts_stage_id_foreign');
  lines.push('  FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;');
  lines.push('ALTER TABLE members  ADD CONSTRAINT members_level_foreign');
  lines.push('  FOREIGN KEY (level)    REFERENCES hierarchy_levels(id) ON DELETE SET NULL;');
  lines.push('');

  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- After applying:');
  lines.push('--   1. Re-run scripts/bootstrap-directus.mjs so Directus introspects the new column types.');
  lines.push('--      The legacy-schema warning should no longer appear.');
  lines.push('--   2. Re-deploy the app — mappers / writers will be updated in Phase 1.3 to read');
  lines.push('--      `slug` and treat stage_id / members.level as uuids.');

  writeFileSync(SQL_OUT, lines.join('\n') + '\n', 'utf8');

  console.log(`\n✓ Wrote ${SQL_OUT}`);
  console.log('\nNext steps:');
  console.log('  1. Back up the Directus database:');
  console.log('       pg_dump -Fc <database> > backup-pre-1.1c.dump');
  console.log('  2. Review migration-1.1c.sql carefully (constraint names may differ if your');
  console.log('     instance was created with a non-default Knex setup).');
  console.log('  3. Apply: psql -d <database> -f migration-1.1c.sql');
  console.log('  4. Re-run: node scripts/bootstrap-directus.mjs');
  console.log('     Verify the legacy-schema warning is gone.');
  console.log('  5. Phase 1.3 will update the app code (mappers, writers) to use the new shape.');
  console.log('');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
