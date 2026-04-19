#!/usr/bin/env node
/**
 * Seed Directus collections from a Vegeta exportState() JSON dump.
 *
 * Usage:
 *   node scripts/seed-directus.mjs <path/to/export.json>
 *
 * The export is produced by calling `useTerritoryStore.getState().exportState()`
 * in the browser console and saving the resulting string.
 *
 * Env vars (optional, defaults match docker-compose.yml):
 *   DIRECTUS_URL, DIRECTUS_ADMIN_EMAIL, DIRECTUS_ADMIN_PASSWORD
 */

import { readFile } from 'node:fs/promises';

const URL = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? 'admin@vegeta.local';
const PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD ?? 'admin';

async function api(token, method, path, body) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
  const res = await fetch(`${URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const { data } = await res.json();
  return data.access_token;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/seed-directus.mjs <export.json>');
    process.exit(1);
  }

  const raw = await readFile(path, 'utf8');
  const state = JSON.parse(raw);
  const fieldDefs = state.fieldDefs ?? [];
  const members = state.members ?? {};
  const teams = state.teams ?? {};
  const accounts = state.accounts ?? {};
  const accountOrder = state.accountOrder ?? Object.keys(accounts);

  console.log(`→ Logging in as ${EMAIL} on ${URL}`);
  const token = await login();

  // Build a member → team map for the flat members mirror.
  const memberTeam = {};
  for (const teamId of Object.keys(teams)) {
    for (const mid of teams[teamId].memberIds ?? []) memberTeam[mid] = teamId;
  }

  console.log(`→ Seeding ${fieldDefs.length} field_definitions`);
  for (let i = 0; i < fieldDefs.length; i++) {
    const def = fieldDefs[i];
    await api(token, 'POST', '/items/field_definitions', {
      id: def.id,
      label: def.label,
      type: def.type,
      options: def.options ?? null,
      is_currency: !!def.isCurrency,
      sort: i,
    });
  }

  console.log(`→ Seeding ${Object.keys(members).length} members`);
  for (const m of Object.values(members)) {
    await api(token, 'POST', '/items/members', {
      id: m.id,
      name: m.name,
      team_id: memberTeam[m.id] ?? null,
    });
  }

  console.log(`→ Seeding ${accountOrder.length} accounts`);
  for (const aid of accountOrder) {
    const a = accounts[aid];
    if (!a) continue;
    await api(token, 'POST', '/items/accounts', {
      id: a.id,
      name: a.name,
      country: a.country,
      state: a.state ?? null,
      rep_id: a.repId ?? null,
      fields: a.fields ?? {},
    });
  }

  console.log('\n✓ Seed complete');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
