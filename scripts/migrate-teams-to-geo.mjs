#!/usr/bin/env node
/**
 * One-time migration: populate the geo_nodes Directus collection from an
 * existing Vegeta exportState() JSON dump.
 *
 * Idempotent — exits without writing if geo_nodes already has rows. Re-run is
 * safe; it will not duplicate.
 *
 * Mapping:
 *   - Each Sales Team        → root GeoNode  (id reused, color reused)
 *   - Each Subregion w/ team → child GeoNode under that team
 *                                (stateCodes carried over, color null = inherits)
 *   - Country assignments    → appended to the matching team's root countryCodes
 *   - State assignments not  → appended to the matching team's root stateCodes
 *     covered by a subregion
 *
 * Usage:
 *   node scripts/migrate-teams-to-geo.mjs <path/to/export.json>
 *
 * Env vars (optional, defaults match docker-compose.yml):
 *   DIRECTUS_URL, DIRECTUS_ADMIN_EMAIL, DIRECTUS_ADMIN_PASSWORD
 */

import { readFile } from 'node:fs/promises';

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

function buildGeoNodes(state) {
  const teams       = state.teams ?? {};
  const teamOrder   = state.teamOrder ?? Object.keys(teams);
  const subregions  = state.subregions ?? {};
  const subregionOrder = state.subregionOrder ?? Object.keys(subregions);
  const assignments = state.assignments ?? {};

  // 1. Root GeoNode per team (preserve id so accounts/repId references stay sane).
  const rows = [];
  let sort = 0;

  for (const tid of teamOrder) {
    const t = teams[tid];
    if (!t) continue;
    rows.push({
      id: t.id,
      name: t.name,
      color: t.color ?? null,
      parent_id: null,
      sort: sort++,
      country_codes: [],
      state_codes: [],
    });
  }

  // 2. Child GeoNode per subregion that has a team.
  // Track which (country,state) codes are now owned by a subregion — we won't
  // double-assign these to the team root.
  const stateCodesOwnedBySubregion = new Set();

  for (const sid of subregionOrder) {
    const sr = subregions[sid];
    if (!sr || !sr.teamId) continue;
    const parent = teams[sr.teamId];
    if (!parent) continue;

    rows.push({
      id: sr.id,
      name: sr.name,
      color: null, // inherits parent team's color
      parent_id: sr.teamId,
      sort: sort++,
      country_codes: [],
      state_codes: sr.stateCodes ?? [],
    });
    for (const code of sr.stateCodes ?? []) stateCodesOwnedBySubregion.add(code);
  }

  // 3. Direct assignments → onto the team root.
  const rowById = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const a of Object.values(assignments)) {
    if (!a.teamId) continue;
    const root = rowById[a.teamId];
    if (!root) continue;
    if (a.entityType === 'country') {
      if (!root.country_codes.includes(a.entityCode)) {
        root.country_codes.push(a.entityCode);
      }
    } else if (a.entityType === 'state') {
      if (
        !stateCodesOwnedBySubregion.has(a.entityCode) &&
        !root.state_codes.includes(a.entityCode)
      ) {
        root.state_codes.push(a.entityCode);
      }
    }
  }

  return rows;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/migrate-teams-to-geo.mjs <export.json>');
    process.exit(1);
  }

  console.log(`→ Logging in as ${EMAIL} on ${URL}`);
  const token = await login();

  // Idempotency guard.
  const existing = await api(token, 'GET', '/items/geo_nodes?limit=1');
  if (existing && existing.length > 0) {
    console.log('⟳ geo_nodes already populated — skipping migration. Drop the rows first to re-run.');
    process.exit(0);
  }

  const raw = await readFile(path, 'utf8');
  const state = JSON.parse(raw);
  const rows = buildGeoNodes(state);

  if (rows.length === 0) {
    console.log('No teams/subregions/assignments found in export — nothing to migrate.');
    return;
  }

  console.log(`→ Inserting ${rows.length} geo_nodes`);
  // Insert roots first (parent_id null), then children, to satisfy the FK.
  const roots = rows.filter((r) => r.parent_id === null);
  const children = rows.filter((r) => r.parent_id !== null);

  for (const r of roots) {
    await api(token, 'POST', '/items/geo_nodes', r);
    console.log(`  ✓ root  ${r.name}`);
  }
  for (const r of children) {
    await api(token, 'POST', '/items/geo_nodes', r);
    console.log(`  ✓ child ${r.name}`);
  }

  console.log('\n✓ Migration complete');
  console.log('  Open the app — the Geos sidebar should now show the migrated tree.');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
