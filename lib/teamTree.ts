import type { SalesTeam } from '@/types/territory';

export function isTeamAncestor(
  teams: Record<string, SalesTeam>,
  candidateAncestorId: string,
  descendantId: string,
): boolean {
  let cur: string | null = descendantId;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return false; // defensive against existing cycles
    seen.add(cur);
    if (cur === candidateAncestorId) return true;
    cur = teams[cur]?.parentId ?? null;
  }
  return false;
}

export function teamDescendantsOf(
  teams: Record<string, SalesTeam>,
  rootId: string,
): Set<string> {
  const out = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of Object.values(teams)) {
        if (t.parentId === id && !out.has(t.id)) {
          out.add(t.id);
          next.push(t.id);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export function teamAncestorsOf(
  teams: Record<string, SalesTeam>,
  id: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = teams[id]?.parentId ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = teams[cur]?.parentId ?? null;
  }
  return out;
}

export function teamChildrenOf(
  teams: Record<string, SalesTeam>,
  order: string[],
  parentId: string | null,
): string[] {
  return order.filter((id) => (teams[id]?.parentId ?? null) === parentId);
}

export interface FlatTeamOption {
  id: string;
  label: string; // breadcrumb e.g. "Sales › NA"
  depth: number;
}

export function flattenTreeForSelect(
  teams: Record<string, SalesTeam>,
  order: string[],
): FlatTeamOption[] {
  const out: FlatTeamOption[] = [];
  function walk(parentId: string | null, depth: number, prefix: string) {
    for (const id of order) {
      const t = teams[id];
      if (!t || (t.parentId ?? null) !== parentId) continue;
      const label = prefix ? `${prefix} › ${t.name}` : t.name;
      out.push({ id, label, depth });
      walk(id, depth + 1, label);
    }
  }
  walk(null, 0, '');
  return out;
}
