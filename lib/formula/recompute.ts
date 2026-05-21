import { collectFieldRefs, type FormulaAst } from './ast';
import { evaluate } from './evaluate';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

/** IDs of computed fields, in dependency order (dependencies before dependents). */
export function topologicalFieldOrder(defs: FieldDefinition[]): string[] {
  const computed = defs.filter((d) => (d as { type: string }).type === 'computed' && (d as { formula?: FormulaAst }).formula);
  const idSet = new Set(computed.map((d) => d.id));
  const indeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  computed.forEach((d) => { indeg[d.id] = 0; adj[d.id] = []; });
  computed.forEach((d) => {
    const formula = (d as { formula?: FormulaAst }).formula!;
    for (const ref of collectFieldRefs(formula)) {
      if (idSet.has(ref)) {
        adj[ref].push(d.id);
        indeg[d.id] = (indeg[d.id] ?? 0) + 1;
      }
    }
  });
  const q: string[] = computed.filter((d) => indeg[d.id] === 0).map((d) => d.id);
  const out: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    for (const next of adj[id]) {
      indeg[next] -= 1;
      if (indeg[next] === 0) q.push(next);
    }
  }
  return out;
}

/** Returns the id of any field involved in a cycle, or null. */
export function detectCycle(defs: FieldDefinition[]): string | null {
  const computed = defs.filter((d) => (d as { type: string }).type === 'computed' && (d as { formula?: FormulaAst }).formula);
  const ordered = new Set(topologicalFieldOrder(defs));
  const stranded = computed.find((d) => !ordered.has(d.id));
  return stranded ? stranded.id : null;
}

/** Returns a copy of `account` with every computed field's value written into `fields`. */
export function recomputeAccount(account: Account, defs: FieldDefinition[]): Account {
  const order = topologicalFieldOrder(defs);
  const nextFields = { ...(account.fields as Record<string, string | number | boolean | undefined>) };
  // Strip stale computed values so an erroring formula clears the slot.
  for (const id of order) delete nextFields[id];
  const byId = new Map(defs.map((d) => [d.id, d]));
  for (const id of order) {
    const def = byId.get(id);
    const formula = (def as undefined | { formula?: FormulaAst })?.formula;
    if (!def || !formula) continue;
    const r = evaluate(formula, { ...account, fields: nextFields as Account['fields'] }, defs);
    if (r.ok) nextFields[id] = r.value;
  }
  return { ...account, fields: nextFields as Account['fields'] };
}

/** Bulk variant for import paths. Pure; caller decides whether to set() the result. */
export function recomputeAccounts(accounts: Account[], defs: FieldDefinition[]): Account[] {
  return accounts.map((a) => recomputeAccount(a, defs));
}
