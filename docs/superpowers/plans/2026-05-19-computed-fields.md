# Computed / Formula Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `computed` field type to the Accounts module: users define formulas (Tier 2 — arithmetic + IF/AND/OR/NOT) over other fields; values are evaluated by a single pure evaluator, materialized into `account.fields`, and surfaced read-only in tables, kanban, detail, modals, and export.

**Architecture:** Pure `lib/formula/*` core (AST → parse → evaluate → recompute, plus a Simple-form converter), wired into the existing Zustand `accountsSlice` write paths. A `FormulaEditor` React component drives a two-mode (Simple / Advanced) authoring UI inside the existing `ManageFieldsModal`. All other surfaces (table, kanban, modal, import/export) get small targeted edits — they read materialized values from the same `fields` map every other field uses.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand store with slice pattern (`store/slices/accountsSlice.ts`), Tailwind v4, Vitest (jsdom env), Directus 11 persistence via `lib/directus-write.ts` + `lib/directus-mappers.ts`.

**Reference spec:** `docs/superpowers/specs/2026-05-19-computed-fields-design.md`. When in doubt, the spec wins.

---

## File map

**Created (new):**
- `lib/formula/ast.ts` — AST node types + the `EvalError` discriminated union.
- `lib/formula/ast.test.ts` — type-level smoke + tiny helper coverage.
- `lib/formula/parse.ts` — text → AST tokenizer + parser, plus `prettyPrint(ast)`.
- `lib/formula/parse.test.ts`
- `lib/formula/evaluate.ts` — pure `(ast, account, fieldDefs) → EvalResult`.
- `lib/formula/evaluate.test.ts`
- `lib/formula/recompute.ts` — topological order, cycle detection, batch recompute helpers.
- `lib/formula/recompute.test.ts`
- `lib/formula/simpleForm.ts` — `SimpleFormConfig ↔ FormulaAst` round-trip + `isExpressibleInSimple(ast)`.
- `lib/formula/simpleForm.test.ts`
- `lib/formula/typeCheck.ts` — AST static type-check (used by editor save-gate); returns inferred `ComputedOutput` or an error.
- `lib/formula/typeCheck.test.ts`
- `components/accounts/formula/FormulaEditor.tsx` — two-mode editor shell.
- `components/accounts/formula/FormulaEditorHeader.tsx` — name + type + output + mode + preview row.
- `components/accounts/formula/AdvancedMode.tsx` — textarea + autocomplete + error markers.
- `components/accounts/formula/SimpleMode.tsx` — shape switch.
- `components/accounts/formula/shapes/ArithmeticShape.tsx`
- `components/accounts/formula/shapes/BucketShape.tsx`
- `components/accounts/formula/shapes/FlagShape.tsx`
- `components/accounts/formula/ConvertOutputDialog.tsx` — destructive output-type change.

**Modified:**
- `lib/accountFields.ts` — extend `FieldType`, add `ComputedOutput`, extend `FieldDefinition`, extend `formatFieldValue` for booleans.
- `types/account.ts` — widen `fields` value union to include `boolean`.
- `lib/directus-mappers.ts` — `FieldDefRow` + `rowToFieldDef` + `fieldDefToRowPatch` carry the new columns.
- `lib/directus-write.ts` — no signature changes; only mapper plumbing flows through.
- `store/slices/accountsSlice.ts` — wire `runComputedRecompute(...)` tail into `updateAccount`, `setAccountField`, `importAccounts`, `addFieldDef`, `updateFieldDef`, `removeFieldDef`.
- `components/accounts/ManageFieldsModal.tsx` — add `Computed` to type dropdown; embed `FormulaEditor`; surface broken-ref red dots; categorical-option-change warnings.
- `components/accounts/AddEditAccountModal.tsx` — render computed fields as read-only preview rows driven by the draft.
- `components/accounts/AccountsTable.tsx` — `ƒ` column header glyph; boolean rendering; derived distinct-values for text-output filter pills.
- `components/accounts/KanbanBoard.tsx` — allow text-output computed fields as grouping (≤12 observed values); disable drag with a banner.
- `components/accounts/AccountsImportModal.tsx` — exclude computed fields from target dropdown; surface in "Skipped — computed field" group.
- A new "Export CSV" toolbar action OR extend the existing one if present — covered explicitly in Task 21.

**Directus side (out-of-band):**
- Add columns to the `field_definitions` collection: `output_type` (string, nullable), `formula_source` (text, nullable), `formula_form` (json, nullable), `formula_ast` (json, nullable). Documented in Task 6 with the exact Directus admin steps.

---

## Test commands

- Unit + integration: `npm run test` (runs `vitest run`)
- Watch mode while iterating: `npm run test:watch`
- Type-check (no separate script — relies on `next build`/IDE): `npx tsc --noEmit`
- Lint: `npm run lint`

After any task that touches store or React code, run `npx tsc --noEmit` to catch type drift before commit.

---

## Phase 1 — Foundation (`lib/formula/*`)

### Task 1: AST types & shared error union

**Files:**
- Create: `lib/formula/ast.ts`
- Create: `lib/formula/ast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/formula/ast.test.ts
import { describe, expect, it } from 'vitest';
import { isLiteral, isFieldRef, type FormulaAst } from './ast';

describe('AST type guards', () => {
  it('isLiteral matches a literal node', () => {
    const n: FormulaAst = { kind: 'literal', valueType: 'number', value: 7 };
    expect(isLiteral(n)).toBe(true);
    expect(isFieldRef(n)).toBe(false);
  });
  it('isFieldRef matches a field reference', () => {
    const n: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
    expect(isFieldRef(n)).toBe(true);
    expect(isLiteral(n)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- lib/formula/ast.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the AST module**

```ts
// lib/formula/ast.ts

/** Output type of a formula or sub-expression. */
export type ValueType = 'number' | 'text' | 'boolean';

/** Discriminated union for evaluator errors. */
export type EvalError =
  | { code: 'MISSING_FIELD';  fieldId: string }
  | { code: 'MISSING_VALUE';  fieldId: string }
  | { code: 'TYPE_MISMATCH';  detail: string }
  | { code: 'DIV_BY_ZERO' }
  | { code: 'BAD_FORMULA';    detail: string }
  | { code: 'CYCLE';          fieldId: string };

/** AST node union — all Tier 2 constructs. */
export type FormulaAst =
  | { kind: 'literal';  valueType: ValueType; value: number | string | boolean }
  | { kind: 'fieldRef'; fieldId: string }
  | { kind: 'binaryOp'; op: '+' | '-' | '*' | '/'; left: FormulaAst; right: FormulaAst }
  | { kind: 'compare';  op: '=' | '!=' | '<' | '>' | '<=' | '>='; left: FormulaAst; right: FormulaAst }
  | { kind: 'logical';  op: 'and' | 'or'; left: FormulaAst; right: FormulaAst }
  | { kind: 'not';      operand: FormulaAst }
  | { kind: 'if';       cond: FormulaAst; then: FormulaAst; else: FormulaAst };

export function isLiteral(n: FormulaAst): n is Extract<FormulaAst, { kind: 'literal' }> {
  return n.kind === 'literal';
}

export function isFieldRef(n: FormulaAst): n is Extract<FormulaAst, { kind: 'fieldRef' }> {
  return n.kind === 'fieldRef';
}

/** Walk the AST and call `visit` on every node (pre-order). */
export function walk(ast: FormulaAst, visit: (n: FormulaAst) => void): void {
  visit(ast);
  switch (ast.kind) {
    case 'literal':
    case 'fieldRef':
      return;
    case 'binaryOp':
    case 'compare':
    case 'logical':
      walk(ast.left, visit);
      walk(ast.right, visit);
      return;
    case 'not':
      walk(ast.operand, visit);
      return;
    case 'if':
      walk(ast.cond, visit);
      walk(ast.then, visit);
      walk(ast.else, visit);
      return;
  }
}

/** Collect the IDs of every field referenced by the AST (deduplicated, stable order). */
export function collectFieldRefs(ast: FormulaAst): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  walk(ast, (n) => {
    if (n.kind === 'fieldRef' && !seen.has(n.fieldId)) {
      seen.add(n.fieldId);
      out.push(n.fieldId);
    }
  });
  return out;
}
```

- [ ] **Step 4: Add a test for `walk` and `collectFieldRefs`**

```ts
// append to lib/formula/ast.test.ts
import { walk, collectFieldRefs } from './ast';

describe('walk', () => {
  it('visits every node pre-order', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'a' },
      right: { kind: 'fieldRef', fieldId: 'b' },
    };
    const kinds: string[] = [];
    walk(ast, (n) => kinds.push(n.kind));
    expect(kinds).toEqual(['binaryOp', 'fieldRef', 'fieldRef']);
  });
});

describe('collectFieldRefs', () => {
  it('returns unique field ids in pre-order', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'a' }, right: { kind: 'literal', valueType: 'number', value: 0 } },
      then: { kind: 'fieldRef', fieldId: 'b' },
      else: { kind: 'fieldRef', fieldId: 'a' },
    };
    expect(collectFieldRefs(ast)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `npm run test -- lib/formula/ast.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/formula/ast.ts lib/formula/ast.test.ts
git commit -m "feat(formula): AST types, walk, and field-ref collector"
```

---

### Task 2: Parser

**Files:**
- Create: `lib/formula/parse.ts`
- Create: `lib/formula/parse.test.ts`

The parser is a recursive-descent expression parser over a small tokenizer. Field refs use the form `{Field Label}` in source text but are resolved to stable `id`s via a `nameToId` lookup passed in by the editor. The parser's return type is a discriminated `ParseResult`; the editor reads `errors[]` for inline squiggles.

- [ ] **Step 1: Write the failing tests (sufficient for full TDD of the parser)**

```ts
// lib/formula/parse.test.ts
import { describe, expect, it } from 'vitest';
import { parse, prettyPrint } from './parse';
import type { FormulaAst } from './ast';

const refs = { ARR: 'f_arr', Score: 'f_score', Stage: 'f_stage', Probability: 'f_prob' };

function parseOk(src: string): FormulaAst {
  const r = parse(src, { nameToId: refs });
  if (!r.ok) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
  return r.ast;
}

describe('parse — literals', () => {
  it('parses a number', () => {
    expect(parseOk('42')).toEqual({ kind: 'literal', valueType: 'number', value: 42 });
  });
  it('parses a negative number', () => {
    expect(parseOk('-3.5')).toEqual({ kind: 'literal', valueType: 'number', value: -3.5 });
  });
  it('parses a single-quoted string', () => {
    expect(parseOk("'Enterprise'")).toEqual({ kind: 'literal', valueType: 'text', value: 'Enterprise' });
  });
  it('parses booleans', () => {
    expect(parseOk('true')).toEqual({ kind: 'literal', valueType: 'boolean', value: true });
    expect(parseOk('false')).toEqual({ kind: 'literal', valueType: 'boolean', value: false });
  });
});

describe('parse — field refs', () => {
  it('resolves {ARR} to its field id', () => {
    expect(parseOk('{ARR}')).toEqual({ kind: 'fieldRef', fieldId: 'f_arr' });
  });
  it('errors on an unknown field name', () => {
    const r = parse('{Nope}', { nameToId: refs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'UNKNOWN_FIELD', name: 'Nope' });
  });
});

describe('parse — arithmetic precedence', () => {
  it('multiplies before adding', () => {
    const ast = parseOk('{ARR} + {Probability} * 2');
    expect(ast).toMatchObject({
      kind: 'binaryOp', op: '+',
      right: { kind: 'binaryOp', op: '*' },
    });
  });
  it('parentheses override precedence', () => {
    const ast = parseOk('({ARR} + {Probability}) * 2');
    expect(ast).toMatchObject({ kind: 'binaryOp', op: '*' });
  });
});

describe('parse — IF / AND / OR / NOT / comparisons', () => {
  it('parses a nested IF', () => {
    const ast = parseOk("IF({ARR} > 100000, 'Ent', IF({ARR} > 10000, 'Mid', 'SMB'))");
    expect(ast).toMatchObject({
      kind: 'if',
      cond: { kind: 'compare', op: '>' },
      else: { kind: 'if' },
    });
  });
  it('AND has lower precedence than comparisons', () => {
    const ast = parseOk('{Score} > 70 AND {Stage} = \'Demo\'');
    expect(ast).toMatchObject({
      kind: 'logical', op: 'and',
      left:  { kind: 'compare', op: '>' },
      right: { kind: 'compare', op: '=' },
    });
  });
  it('NOT applies to the next term', () => {
    const ast = parseOk('NOT ({Score} > 70)');
    expect(ast).toMatchObject({ kind: 'not', operand: { kind: 'compare', op: '>' } });
  });
});

describe('parse — error reporting', () => {
  it('reports a parse error with position', () => {
    const r = parse('{ARR} + ', { nameToId: refs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'UNEXPECTED_EOF' });
  });
  it('reports a stray token with column', () => {
    const r = parse('{ARR} ** 2', { nameToId: refs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'UNEXPECTED_TOKEN', col: 6 });
  });
});

describe('prettyPrint', () => {
  const idToName = Object.fromEntries(Object.entries(refs).map(([n, id]) => [id, n]));
  it('round-trips a simple AST', () => {
    const src = '{ARR} * {Probability}';
    const ast = parseOk(src);
    expect(prettyPrint(ast, { idToName })).toBe(src);
  });
  it('preserves nesting via parentheses where precedence requires it', () => {
    const src = '({ARR} + 1) * 2';
    expect(prettyPrint(parseOk(src), { idToName })).toBe(src);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm run test -- lib/formula/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/formula/parse.ts`**

Public interface (mandatory shape):

```ts
// lib/formula/parse.ts
import type { FormulaAst } from './ast';

export type ParseErrorCode =
  | 'UNEXPECTED_EOF'
  | 'UNEXPECTED_TOKEN'
  | 'UNKNOWN_FIELD'
  | 'UNTERMINATED_STRING'
  | 'BAD_NUMBER';

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  col: number;          // 1-indexed
  /** Present for UNKNOWN_FIELD so the editor can offer "did you mean…" */
  name?: string;
}

export type ParseResult =
  | { ok: true;  ast: FormulaAst }
  | { ok: false; errors: ParseError[] };

export interface ParseOpts {
  /** Map of human-visible field label → stable field id. Case-insensitive lookup. */
  nameToId: Record<string, string>;
}

export interface PrintOpts {
  /** Inverse of `nameToId` — used to re-render field refs as `{Label}`. */
  idToName: Record<string, string>;
}

export function parse(src: string, opts: ParseOpts): ParseResult { /* implement */ }
export function prettyPrint(ast: FormulaAst, opts: PrintOpts): string { /* implement */ }
```

Implementation guidance — implement until every test in Step 1 passes:

1. **Tokenizer** — produces tokens `{ type, value, col }` for: numbers, strings (`'…'` with `\\` escape), idents (`IF | AND | OR | NOT | true | false`), `{Label}` field tokens, operators (`+ - * / = != < > <= >= , ( )`), and EOF. Strings unterminated → `UNTERMINATED_STRING`. Numbers with two decimal points → `BAD_NUMBER`.
2. **Parser** — recursive descent. Precedence (lowest → highest):
   `OR < AND < (= != < > <= >=) < (+ -) < (* /) < unary - / NOT < primary`.
   `IF(cond, then, else)` is a primary form. Field tokens with no name match in `nameToId` produce `UNKNOWN_FIELD` and advance.
3. **Collect-then-report:** accumulate errors in an array; if any are present, return `{ ok: false, errors }`. On success return `{ ok: true, ast }`.
4. **`prettyPrint`** is a tree-walk that wraps a child in parens iff the child's operator has strictly lower precedence than the current operator, or equal precedence but it appears on the right of a left-associative op.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test -- lib/formula/parse.test.ts`
Expected: PASS (all parse tests).

- [ ] **Step 5: Commit**

```bash
git add lib/formula/parse.ts lib/formula/parse.test.ts
git commit -m "feat(formula): tokenizer + recursive-descent parser + prettyPrint"
```

---

### Task 3: Evaluator

**Files:**
- Create: `lib/formula/evaluate.ts`
- Create: `lib/formula/evaluate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/formula/evaluate.test.ts
import { describe, expect, it } from 'vitest';
import { evaluate, type EvalResult } from './evaluate';
import type { FormulaAst } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

const defs: FieldDefinition[] = [
  { id: 'f_arr',   label: 'ARR',         type: 'metric',      entity: 'account', isCurrency: true },
  { id: 'f_prob',  label: 'Probability', type: 'metric',      entity: 'account' },
  { id: 'f_stage', label: 'Stage',       type: 'categorical', entity: 'account', options: ['Demo', 'Won'] },
  { id: 'f_name',  label: 'Notes',       type: 'text',        entity: 'account' },
];

function acct(fields: Record<string, string | number | boolean>): Account {
  return { id: 'a1', name: 'Acme', repId: null, stageId: null, fields };
}

const OK = (r: EvalResult, v: number | string | boolean) => {
  expect(r).toEqual({ ok: true, value: v });
};

describe('evaluate — arithmetic', () => {
  it('adds two metric fields', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'f_arr' },
      right: { kind: 'fieldRef', fieldId: 'f_prob' },
    };
    OK(evaluate(ast, acct({ f_arr: 100, f_prob: 50 }), defs), 150);
  });
  it('reports DIV_BY_ZERO', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '/',
      left:  { kind: 'literal', valueType: 'number', value: 10 },
      right: { kind: 'fieldRef', fieldId: 'f_prob' },
    };
    expect(evaluate(ast, acct({ f_prob: 0 }), defs)).toEqual({ ok: false, error: { code: 'DIV_BY_ZERO' } });
  });
});

describe('evaluate — missing values', () => {
  it('returns MISSING_VALUE when a referenced field is unset', () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
    const r = evaluate(ast, acct({}), defs);
    expect(r).toEqual({ ok: false, error: { code: 'MISSING_VALUE', fieldId: 'f_arr' } });
  });
  it("treats '' as missing", () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
    expect(evaluate(ast, acct({ f_arr: '' }), defs)).toMatchObject({ ok: false, error: { code: 'MISSING_VALUE' } });
  });
  it('returns MISSING_FIELD when the AST references a deleted field', () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_gone' };
    expect(evaluate(ast, acct({}), defs)).toEqual({ ok: false, error: { code: 'MISSING_FIELD', fieldId: 'f_gone' } });
  });
});

describe('evaluate — type rules', () => {
  it('rejects text in arithmetic with TYPE_MISMATCH', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'f_name' },
      right: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(evaluate(ast, acct({ f_name: 'hi' }), defs)).toMatchObject({ ok: false, error: { code: 'TYPE_MISMATCH' } });
  });
});

describe('evaluate — IF / AND / OR', () => {
  it('IF picks the then branch when cond is true', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'compare', op: '>',
        left: { kind: 'fieldRef', fieldId: 'f_arr' },
        right: { kind: 'literal', valueType: 'number', value: 100000 } },
      then: { kind: 'literal', valueType: 'text', value: 'Ent' },
      else: { kind: 'literal', valueType: 'text', value: 'SMB' },
    };
    OK(evaluate(ast, acct({ f_arr: 200000 }), defs), 'Ent');
  });
  it('AND short-circuits — does not evaluate RHS when LHS is false', () => {
    // RHS would divide by zero; if AND short-circuits we never hit it.
    const ast: FormulaAst = {
      kind: 'logical', op: 'and',
      left:  { kind: 'literal', valueType: 'boolean', value: false },
      right: { kind: 'compare', op: '>',
        left:  { kind: 'binaryOp', op: '/',
          left:  { kind: 'literal', valueType: 'number', value: 1 },
          right: { kind: 'literal', valueType: 'number', value: 0 } },
        right: { kind: 'literal', valueType: 'number', value: 0 } },
    };
    OK(evaluate(ast, acct({}), defs), false);
  });
  it('OR short-circuits — does not evaluate RHS when LHS is true', () => {
    const ast: FormulaAst = {
      kind: 'logical', op: 'or',
      left:  { kind: 'literal', valueType: 'boolean', value: true },
      right: { kind: 'binaryOp', op: '/',
        left:  { kind: 'literal', valueType: 'number', value: 1 },
        right: { kind: 'literal', valueType: 'number', value: 0 } },
    };
    OK(evaluate(ast, acct({}), defs), true);
  });
});

describe('evaluate — missing-value short-circuit inside IF', () => {
  it('missing value in cond propagates as MISSING_VALUE, not 0', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'compare', op: '>',
        left: { kind: 'fieldRef', fieldId: 'f_arr' },
        right: { kind: 'literal', valueType: 'number', value: 100 } },
      then: { kind: 'literal', valueType: 'text', value: 'big' },
      else: { kind: 'literal', valueType: 'text', value: 'small' },
    };
    expect(evaluate(ast, acct({}), defs)).toMatchObject({ ok: false, error: { code: 'MISSING_VALUE' } });
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found).**

Run: `npm run test -- lib/formula/evaluate.test.ts`

- [ ] **Step 3: Implement the evaluator**

```ts
// lib/formula/evaluate.ts
import type { FormulaAst, EvalError, ValueType } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

export type EvalResult =
  | { ok: true;  value: number | string | boolean }
  | { ok: false; error: EvalError };

const ok  = (value: number | string | boolean): EvalResult => ({ ok: true, value });
const err = (error: EvalError): EvalResult => ({ ok: false, error });

function fieldTypeToValueType(t: FieldDefinition['type'], output?: ValueType): ValueType {
  if (t === 'metric') return 'number';
  if (t === 'computed') return output ?? 'number';
  return 'text'; // categorical & text both produce strings
}

function asNumber(r: EvalResult, who: string): EvalResult {
  if (!r.ok) return r;
  if (typeof r.value !== 'number') return err({ code: 'TYPE_MISMATCH', detail: `${who} expected number, got ${typeof r.value}` });
  return r;
}
function asBoolean(r: EvalResult, who: string): EvalResult {
  if (!r.ok) return r;
  if (typeof r.value !== 'boolean') return err({ code: 'TYPE_MISMATCH', detail: `${who} expected boolean, got ${typeof r.value}` });
  return r;
}

export function evaluate(
  ast: FormulaAst,
  account: Account,
  fieldDefs: FieldDefinition[],
): EvalResult {
  switch (ast.kind) {
    case 'literal':
      return ok(ast.value);

    case 'fieldRef': {
      const def = fieldDefs.find((d) => d.id === ast.fieldId);
      if (!def) return err({ code: 'MISSING_FIELD', fieldId: ast.fieldId });
      const raw = account.fields[ast.fieldId];
      if (raw === undefined || raw === null || raw === '') return err({ code: 'MISSING_VALUE', fieldId: ast.fieldId });
      // Coerce by declared type
      const vt = fieldTypeToValueType(def.type, def.outputType);
      if (vt === 'number') {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) return err({ code: 'TYPE_MISMATCH', detail: `${def.label} is not numeric` });
        return ok(n);
      }
      if (vt === 'boolean') {
        if (typeof raw === 'boolean') return ok(raw);
        return err({ code: 'TYPE_MISMATCH', detail: `${def.label} is not boolean` });
      }
      return ok(String(raw));
    }

    case 'binaryOp': {
      const l = asNumber(evaluate(ast.left, account, fieldDefs), 'arithmetic LHS');
      if (!l.ok) return l;
      const r = asNumber(evaluate(ast.right, account, fieldDefs), 'arithmetic RHS');
      if (!r.ok) return r;
      const a = l.value as number;
      const b = r.value as number;
      switch (ast.op) {
        case '+': return ok(a + b);
        case '-': return ok(a - b);
        case '*': return ok(a * b);
        case '/': return b === 0 ? err({ code: 'DIV_BY_ZERO' }) : ok(a / b);
      }
      return err({ code: 'BAD_FORMULA', detail: 'unknown binaryOp' });
    }

    case 'compare': {
      const l = evaluate(ast.left,  account, fieldDefs); if (!l.ok) return l;
      const r = evaluate(ast.right, account, fieldDefs); if (!r.ok) return r;
      if (typeof l.value !== typeof r.value) {
        return err({ code: 'TYPE_MISMATCH', detail: `cannot compare ${typeof l.value} with ${typeof r.value}` });
      }
      if ((ast.op === '<' || ast.op === '>' || ast.op === '<=' || ast.op === '>=') && typeof l.value !== 'number') {
        return err({ code: 'TYPE_MISMATCH', detail: 'ordering requires numbers' });
      }
      switch (ast.op) {
        case '=':  return ok(l.value === r.value);
        case '!=': return ok(l.value !== r.value);
        case '<':  return ok((l.value as number) <  (r.value as number));
        case '>':  return ok((l.value as number) >  (r.value as number));
        case '<=': return ok((l.value as number) <= (r.value as number));
        case '>=': return ok((l.value as number) >= (r.value as number));
      }
      return err({ code: 'BAD_FORMULA', detail: 'unknown compare op' });
    }

    case 'logical': {
      const l = asBoolean(evaluate(ast.left, account, fieldDefs), 'logical LHS');
      if (!l.ok) return l;
      if (ast.op === 'and' && l.value === false) return ok(false);
      if (ast.op === 'or'  && l.value === true)  return ok(true);
      return asBoolean(evaluate(ast.right, account, fieldDefs), 'logical RHS');
    }

    case 'not': {
      const r = asBoolean(evaluate(ast.operand, account, fieldDefs), 'NOT operand');
      if (!r.ok) return r;
      return ok(!(r.value as boolean));
    }

    case 'if': {
      const c = asBoolean(evaluate(ast.cond, account, fieldDefs), 'IF condition');
      if (!c.ok) return c;
      return evaluate(c.value ? ast.then : ast.else, account, fieldDefs);
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test -- lib/formula/evaluate.test.ts`
Expected: PASS (all evaluator tests).

- [ ] **Step 5: Commit**

```bash
git add lib/formula/evaluate.ts lib/formula/evaluate.test.ts
git commit -m "feat(formula): pure evaluator with strict type rules + short-circuit"
```

---

### Task 4: Static type-check (save-gate)

**Files:**
- Create: `lib/formula/typeCheck.ts`
- Create: `lib/formula/typeCheck.test.ts`

The editor uses this to block Save when (a) operand types don't fit the operator, (b) the AST's inferred return type doesn't match the declared `outputType`. It walks the AST without an account.

- [ ] **Step 1: Write failing tests**

```ts
// lib/formula/typeCheck.test.ts
import { describe, expect, it } from 'vitest';
import { inferType } from './typeCheck';
import type { FormulaAst } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';

const defs: FieldDefinition[] = [
  { id: 'f_arr',  label: 'ARR',  type: 'metric',      entity: 'account' },
  { id: 'f_name', label: 'Name', type: 'text',        entity: 'account' },
  { id: 'f_tier', label: 'Tier', type: 'computed',    entity: 'account', outputType: 'text' },
];

describe('inferType', () => {
  it('infers number for arithmetic on metric fields', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'f_arr' },
      right: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(inferType(ast, defs)).toEqual({ ok: true, type: 'number' });
  });
  it('rejects text + number with TYPE_MISMATCH', () => {
    const ast: FormulaAst = {
      kind: 'binaryOp', op: '+',
      left:  { kind: 'fieldRef', fieldId: 'f_name' },
      right: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(inferType(ast, defs)).toMatchObject({ ok: false, error: { code: 'TYPE_MISMATCH' } });
  });
  it('infers text from IF returning two text literals', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'f_arr' }, right: { kind: 'literal', valueType: 'number', value: 0 } },
      then: { kind: 'literal', valueType: 'text', value: 'a' },
      else: { kind: 'literal', valueType: 'text', value: 'b' },
    };
    expect(inferType(ast, defs)).toEqual({ ok: true, type: 'text' });
  });
  it('rejects IF with mismatched branch types', () => {
    const ast: FormulaAst = {
      kind: 'if',
      cond: { kind: 'literal', valueType: 'boolean', value: true },
      then: { kind: 'literal', valueType: 'text', value: 'a' },
      else: { kind: 'literal', valueType: 'number', value: 1 },
    };
    expect(inferType(ast, defs)).toMatchObject({ ok: false, error: { code: 'TYPE_MISMATCH' } });
  });
  it('reads outputType from a referenced computed field', () => {
    const ast: FormulaAst = { kind: 'fieldRef', fieldId: 'f_tier' };
    expect(inferType(ast, defs)).toEqual({ ok: true, type: 'text' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test -- lib/formula/typeCheck.test.ts`

- [ ] **Step 3: Implement `typeCheck.ts`**

```ts
// lib/formula/typeCheck.ts
import type { FormulaAst, EvalError, ValueType } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';

export type InferResult =
  | { ok: true;  type: ValueType }
  | { ok: false; error: EvalError };

const ok  = (type: ValueType): InferResult => ({ ok: true, type });
const err = (error: EvalError): InferResult => ({ ok: false, error });

export function inferType(ast: FormulaAst, defs: FieldDefinition[]): InferResult {
  switch (ast.kind) {
    case 'literal':  return ok(ast.valueType);
    case 'fieldRef': {
      const d = defs.find((x) => x.id === ast.fieldId);
      if (!d) return err({ code: 'MISSING_FIELD', fieldId: ast.fieldId });
      if (d.type === 'metric')      return ok('number');
      if (d.type === 'text' || d.type === 'categorical') return ok('text');
      if (d.type === 'computed')    return ok(d.outputType ?? 'number');
      return err({ code: 'BAD_FORMULA', detail: 'unknown field type' });
    }
    case 'binaryOp': {
      const l = inferType(ast.left,  defs); if (!l.ok) return l;
      const r = inferType(ast.right, defs); if (!r.ok) return r;
      if (l.type !== 'number' || r.type !== 'number')
        return err({ code: 'TYPE_MISMATCH', detail: 'arithmetic requires numbers' });
      return ok('number');
    }
    case 'compare': {
      const l = inferType(ast.left,  defs); if (!l.ok) return l;
      const r = inferType(ast.right, defs); if (!r.ok) return r;
      if (l.type !== r.type) return err({ code: 'TYPE_MISMATCH', detail: 'compare operands differ' });
      if ((ast.op === '<' || ast.op === '>' || ast.op === '<=' || ast.op === '>=') && l.type !== 'number')
        return err({ code: 'TYPE_MISMATCH', detail: 'ordering requires numbers' });
      return ok('boolean');
    }
    case 'logical': {
      const l = inferType(ast.left,  defs); if (!l.ok) return l;
      const r = inferType(ast.right, defs); if (!r.ok) return r;
      if (l.type !== 'boolean' || r.type !== 'boolean')
        return err({ code: 'TYPE_MISMATCH', detail: 'AND/OR require booleans' });
      return ok('boolean');
    }
    case 'not': {
      const r = inferType(ast.operand, defs); if (!r.ok) return r;
      if (r.type !== 'boolean') return err({ code: 'TYPE_MISMATCH', detail: 'NOT requires boolean' });
      return ok('boolean');
    }
    case 'if': {
      const c = inferType(ast.cond, defs); if (!c.ok) return c;
      if (c.type !== 'boolean') return err({ code: 'TYPE_MISMATCH', detail: 'IF condition must be boolean' });
      const t = inferType(ast.then, defs); if (!t.ok) return t;
      const e = inferType(ast.else, defs); if (!e.ok) return e;
      if (t.type !== e.type) return err({ code: 'TYPE_MISMATCH', detail: 'IF branches must match' });
      return ok(t.type);
    }
  }
}
```

- [ ] **Step 4: Run tests — PASS**

Run: `npm run test -- lib/formula/typeCheck.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/formula/typeCheck.ts lib/formula/typeCheck.test.ts
git commit -m "feat(formula): static type inference for save-gate validation"
```

---

### Task 5: Topological order, cycle detection, recompute helpers

**Files:**
- Create: `lib/formula/recompute.ts`
- Create: `lib/formula/recompute.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/formula/recompute.test.ts
import { describe, expect, it } from 'vitest';
import { topologicalFieldOrder, detectCycle, recomputeAccount } from './recompute';
import type { FormulaAst } from './ast';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

const refArr: FormulaAst = { kind: 'fieldRef', fieldId: 'f_arr' };
const refProb: FormulaAst = { kind: 'fieldRef', fieldId: 'f_prob' };

const baseDefs: FieldDefinition[] = [
  { id: 'f_arr',  label: 'ARR',  type: 'metric', entity: 'account' },
  { id: 'f_prob', label: 'Prob', type: 'metric', entity: 'account' },
  // weighted = ARR * Prob
  { id: 'f_w',    label: 'Weighted', type: 'computed', entity: 'account', outputType: 'number',
    formula: { kind: 'binaryOp', op: '*', left: refArr, right: refProb } },
  // doubled = weighted * 2 (computed-on-computed)
  { id: 'f_d',    label: 'Doubled',  type: 'computed', entity: 'account', outputType: 'number',
    formula: { kind: 'binaryOp', op: '*',
      left:  { kind: 'fieldRef', fieldId: 'f_w' },
      right: { kind: 'literal', valueType: 'number', value: 2 } } },
];

describe('topologicalFieldOrder', () => {
  it('puts dependencies before dependents', () => {
    const order = topologicalFieldOrder(baseDefs);
    expect(order.indexOf('f_w')).toBeLessThan(order.indexOf('f_d'));
  });
  it('only returns computed field ids', () => {
    expect(topologicalFieldOrder(baseDefs).sort()).toEqual(['f_d', 'f_w']);
  });
});

describe('detectCycle', () => {
  it('returns null when no cycle', () => {
    expect(detectCycle(baseDefs)).toBeNull();
  });
  it('returns the cycling field id when present', () => {
    const cyclic: FieldDefinition[] = [
      ...baseDefs,
      { id: 'f_x', label: 'X', type: 'computed', entity: 'account', outputType: 'number',
        formula: { kind: 'fieldRef', fieldId: 'f_y' } },
      { id: 'f_y', label: 'Y', type: 'computed', entity: 'account', outputType: 'number',
        formula: { kind: 'fieldRef', fieldId: 'f_x' } },
    ];
    const c = detectCycle(cyclic);
    expect(c).not.toBeNull();
    expect(['f_x', 'f_y']).toContain(c);
  });
});

describe('recomputeAccount', () => {
  it('writes computed values into account.fields in topological order', () => {
    const acct: Account = { id: 'a1', name: 'Acme', repId: null, stageId: null, fields: { f_arr: 100, f_prob: 0.5 } };
    const next = recomputeAccount(acct, baseDefs);
    expect(next.fields.f_w).toBe(50);
    expect(next.fields.f_d).toBe(100);
  });
  it('leaves an erroring computed field undefined (not 0)', () => {
    const acct: Account = { id: 'a1', name: 'Acme', repId: null, stageId: null, fields: { f_arr: 100 } }; // prob missing
    const next = recomputeAccount(acct, baseDefs);
    expect(next.fields.f_w).toBeUndefined();
    expect(next.fields.f_d).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm run test -- lib/formula/recompute.test.ts`

- [ ] **Step 3: Implement `recompute.ts`**

```ts
// lib/formula/recompute.ts
import { collectFieldRefs } from './ast';
import { evaluate } from './evaluate';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';

/** IDs of computed fields, in dependency order (dependencies before dependents). */
export function topologicalFieldOrder(defs: FieldDefinition[]): string[] {
  const computed = defs.filter((d) => d.type === 'computed' && d.formula);
  const idSet = new Set(computed.map((d) => d.id));
  const indeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  computed.forEach((d) => { indeg[d.id] = 0; adj[d.id] = []; });
  computed.forEach((d) => {
    for (const ref of collectFieldRefs(d.formula!)) {
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
  // Anything left out is part of a cycle — return what we have; detectCycle is the auth.
  return out;
}

/** Returns the id of any field involved in a cycle, or null. */
export function detectCycle(defs: FieldDefinition[]): string | null {
  const computed = defs.filter((d) => d.type === 'computed' && d.formula);
  const ordered = new Set(topologicalFieldOrder(defs));
  const stranded = computed.find((d) => !ordered.has(d.id));
  return stranded ? stranded.id : null;
}

/** Returns a copy of `account` with every computed field's value written into `fields`. */
export function recomputeAccount(account: Account, defs: FieldDefinition[]): Account {
  const order = topologicalFieldOrder(defs);
  const nextFields: Account['fields'] = { ...account.fields };
  // Strip stale computed values so an erroring formula clears the slot.
  for (const id of order) delete nextFields[id];
  const byId = new Map(defs.map((d) => [d.id, d]));
  for (const id of order) {
    const def = byId.get(id);
    if (!def || !def.formula) continue;
    const r = evaluate(def.formula, { ...account, fields: nextFields }, defs);
    if (r.ok) nextFields[id] = r.value;
    // else: leave undefined; render layer shows "—" with tooltip.
  }
  return { ...account, fields: nextFields };
}

/** Bulk variant for import paths. Pure; caller decides whether to set() the result. */
export function recomputeAccounts(accounts: Account[], defs: FieldDefinition[]): Account[] {
  return accounts.map((a) => recomputeAccount(a, defs));
}
```

- [ ] **Step 4: Run tests — PASS**

Run: `npm run test -- lib/formula/recompute.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/formula/recompute.ts lib/formula/recompute.test.ts
git commit -m "feat(formula): topological order, cycle detection, account recompute"
```

---

### Task 6: Simple-form converter

**Files:**
- Create: `lib/formula/simpleForm.ts`
- Create: `lib/formula/simpleForm.test.ts`

`SimpleFormConfig` is what the form-mode UI binds to. The converter compiles it to an AST; `astToSimple` tries to recover a `SimpleFormConfig` from an AST. `isExpressibleInSimple(ast)` returns true iff the AST round-trips losslessly through one of the three shapes.

- [ ] **Step 1: Write failing tests**

```ts
// lib/formula/simpleForm.test.ts
import { describe, expect, it } from 'vitest';
import { simpleToAst, astToSimple, isExpressibleInSimple, type SimpleFormConfig } from './simpleForm';
import type { FormulaAst } from './ast';

describe('arithmetic shape', () => {
  const cfg: SimpleFormConfig = {
    shape: 'arithmetic',
    terms: [
      { kind: 'field', fieldId: 'f_arr' },
      { kind: 'op', op: '*' },
      { kind: 'field', fieldId: 'f_prob' },
    ],
  };
  it('compiles to a binaryOp AST', () => {
    expect(simpleToAst(cfg)).toMatchObject({ kind: 'binaryOp', op: '*' });
  });
  it('round-trips back via astToSimple', () => {
    const ast = simpleToAst(cfg);
    expect(astToSimple(ast)).toEqual(cfg);
  });
});

describe('bucket shape', () => {
  const cfg: SimpleFormConfig = {
    shape: 'bucket',
    fieldId: 'f_arr',
    op: '>',
    tiers: [
      { threshold: 100000, label: 'Enterprise' },
      { threshold: 10000,  label: 'Mid' },
    ],
    otherwise: 'SMB',
  };
  it('compiles to nested IF', () => {
    const ast = simpleToAst(cfg);
    expect(ast).toMatchObject({ kind: 'if', else: { kind: 'if' } });
  });
  it('round-trips back', () => {
    const ast = simpleToAst(cfg);
    expect(astToSimple(ast)).toEqual(cfg);
  });
});

describe('flag shape', () => {
  const cfg: SimpleFormConfig = {
    shape: 'flag',
    join: 'and',
    conditions: [
      { fieldId: 'f_score', op: '>', value: 70 },
      { fieldId: 'f_stage', op: '=', value: 'Demo' },
    ],
  };
  it('compiles to chained AND', () => {
    expect(simpleToAst(cfg)).toMatchObject({ kind: 'logical', op: 'and' });
  });
  it('round-trips back', () => {
    const ast = simpleToAst(cfg);
    expect(astToSimple(ast)).toEqual(cfg);
  });
});

describe('isExpressibleInSimple', () => {
  it('returns false for mixed AND/OR', () => {
    const ast: FormulaAst = {
      kind: 'logical', op: 'or',
      left:  { kind: 'logical', op: 'and',
        left:  { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'a' }, right: { kind: 'literal', valueType: 'number', value: 1 } },
        right: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'b' }, right: { kind: 'literal', valueType: 'number', value: 2 } } },
      right: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'c' }, right: { kind: 'literal', valueType: 'number', value: 3 } },
    };
    expect(isExpressibleInSimple(ast)).toBe(false);
  });
  it('returns false for NOT', () => {
    const ast: FormulaAst = { kind: 'not', operand: { kind: 'literal', valueType: 'boolean', value: true } };
    expect(isExpressibleInSimple(ast)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

Run: `npm run test -- lib/formula/simpleForm.test.ts`

- [ ] **Step 3: Implement `simpleForm.ts`**

```ts
// lib/formula/simpleForm.ts
import type { FormulaAst } from './ast';

export type ArithOp = '+' | '-' | '*' | '/';
export type CompareOp = '=' | '!=' | '<' | '>' | '<=' | '>=';

export type ArithTerm =
  | { kind: 'field'; fieldId: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; op: ArithOp };

export interface ArithmeticShape {
  shape: 'arithmetic';
  terms: ArithTerm[]; // alternating value/op; length is odd ≥ 1
}

export interface BucketShape {
  shape: 'bucket';
  fieldId: string;
  op: CompareOp;
  tiers: Array<{ threshold: number; label: string }>; // checked top-to-bottom
  otherwise: string;
}

export interface FlagShape {
  shape: 'flag';
  join: 'and' | 'or';
  conditions: Array<{ fieldId: string; op: CompareOp; value: number | string | boolean }>;
}

export type SimpleFormConfig = ArithmeticShape | BucketShape | FlagShape;

// ── simpleToAst ──────────────────────────────────────────────────────────────

export function simpleToAst(cfg: SimpleFormConfig): FormulaAst {
  if (cfg.shape === 'arithmetic') return arithToAst(cfg);
  if (cfg.shape === 'bucket')     return bucketToAst(cfg);
  return flagToAst(cfg);
}

function termToAst(t: ArithTerm): FormulaAst {
  if (t.kind === 'field')  return { kind: 'fieldRef', fieldId: t.fieldId };
  if (t.kind === 'number') return { kind: 'literal', valueType: 'number', value: t.value };
  throw new Error('op term cannot be a value');
}

function arithToAst(cfg: ArithmeticShape): FormulaAst {
  type Item = { ast: FormulaAst } | { op: ArithOp };
  const flat: Item[] = cfg.terms.map((t) =>
    t.kind === 'op' ? { op: t.op } : { ast: termToAst(t) },
  );
  // First pass: collapse * and / left-to-right.
  let i = 1;
  while (i < flat.length) {
    const opItem = flat[i];
    if ('op' in opItem && (opItem.op === '*' || opItem.op === '/')) {
      const left  = flat[i - 1] as { ast: FormulaAst };
      const right = flat[i + 1] as { ast: FormulaAst };
      flat.splice(i - 1, 3, { ast: { kind: 'binaryOp', op: opItem.op, left: left.ast, right: right.ast } });
    } else {
      i += 2;
    }
  }
  // Second pass: left-fold + and -.
  let acc = (flat[0] as { ast: FormulaAst }).ast;
  for (let j = 1; j < flat.length; j += 2) {
    const op = (flat[j] as { op: ArithOp }).op;
    const next = (flat[j + 1] as { ast: FormulaAst }).ast;
    acc = { kind: 'binaryOp', op, left: acc, right: next };
  }
  return acc;
}

function bucketToAst(cfg: BucketShape): FormulaAst {
  // Build right-folded IFs in declared order: tiers[0], tiers[1], ..., otherwise.
  let acc: FormulaAst = { kind: 'literal', valueType: 'text', value: cfg.otherwise };
  for (let i = cfg.tiers.length - 1; i >= 0; i--) {
    const t = cfg.tiers[i];
    acc = {
      kind: 'if',
      cond: { kind: 'compare', op: cfg.op,
        left:  { kind: 'fieldRef', fieldId: cfg.fieldId },
        right: { kind: 'literal', valueType: 'number', value: t.threshold } },
      then: { kind: 'literal', valueType: 'text', value: t.label },
      else: acc,
    };
  }
  return acc;
}

function flagToAst(cfg: FlagShape): FormulaAst {
  const conds: FormulaAst[] = cfg.conditions.map((c) => ({
    kind: 'compare', op: c.op,
    left:  { kind: 'fieldRef', fieldId: c.fieldId },
    right: { kind: 'literal',
             valueType: typeof c.value === 'number' ? 'number' : typeof c.value === 'boolean' ? 'boolean' : 'text',
             value: c.value },
  }));
  // Left-fold with the join operator.
  let acc = conds[0];
  for (let i = 1; i < conds.length; i++) {
    acc = { kind: 'logical', op: cfg.join, left: acc, right: conds[i] };
  }
  return acc;
}

// ── astToSimple ──────────────────────────────────────────────────────────────

export function astToSimple(ast: FormulaAst): SimpleFormConfig | null {
  return tryArith(ast) ?? tryBucket(ast) ?? tryFlag(ast);
}

function tryArith(ast: FormulaAst): ArithmeticShape | null {
  // An arithmetic shape is a left-folded chain of binaryOps over fieldRefs/number literals.
  const terms: ArithTerm[] = [];
  function walk(n: FormulaAst): boolean {
    if (n.kind === 'fieldRef') { terms.push({ kind: 'field', fieldId: n.fieldId }); return true; }
    if (n.kind === 'literal' && n.valueType === 'number') {
      terms.push({ kind: 'number', value: n.value as number }); return true;
    }
    if (n.kind === 'binaryOp') {
      if (!walk(n.left)) return false;
      terms.push({ kind: 'op', op: n.op });
      // Right side must be a leaf (we don't recover parenthesized RHS — those go to Advanced).
      if (n.right.kind === 'fieldRef') terms.push({ kind: 'field', fieldId: n.right.fieldId });
      else if (n.right.kind === 'literal' && n.right.valueType === 'number')
        terms.push({ kind: 'number', value: n.right.value as number });
      else return false;
      return true;
    }
    return false;
  }
  if (!walk(ast)) return null;
  return { shape: 'arithmetic', terms };
}

function tryBucket(ast: FormulaAst): BucketShape | null {
  if (ast.kind !== 'if') return null;
  const tiers: BucketShape['tiers'] = [];
  let fieldId: string | null = null;
  let op: CompareOp | null = null;
  let node: FormulaAst = ast;
  while (node.kind === 'if') {
    if (node.cond.kind !== 'compare') return null;
    if (node.cond.left.kind !== 'fieldRef') return null;
    if (node.cond.right.kind !== 'literal' || node.cond.right.valueType !== 'number') return null;
    if (node.then.kind !== 'literal' || node.then.valueType !== 'text') return null;
    fieldId ??= node.cond.left.fieldId;
    op ??= node.cond.op;
    if (node.cond.left.fieldId !== fieldId || node.cond.op !== op) return null;
    tiers.push({ threshold: node.cond.right.value as number, label: node.then.value as string });
    node = node.else;
  }
  if (node.kind !== 'literal' || node.valueType !== 'text') return null;
  return { shape: 'bucket', fieldId: fieldId!, op: op!, tiers, otherwise: node.value as string };
}

function tryFlag(ast: FormulaAst): FlagShape | null {
  // Left-folded AND or OR chain of compares.
  if (ast.kind !== 'logical' && ast.kind !== 'compare') return null;
  const conds: FlagShape['conditions'] = [];
  let join: 'and' | 'or' | null = null;
  function walk(n: FormulaAst): boolean {
    if (n.kind === 'logical') {
      if (join !== null && n.op !== join) return false;
      join = n.op;
      if (!walk(n.left)) return false;
      if (n.right.kind !== 'compare') return false;
      return walk(n.right);
    }
    if (n.kind === 'compare') {
      if (n.left.kind !== 'fieldRef') return false;
      if (n.right.kind !== 'literal') return false;
      conds.push({ fieldId: n.left.fieldId, op: n.op, value: n.right.value as number | string | boolean });
      return true;
    }
    return false;
  }
  if (!walk(ast)) return null;
  return { shape: 'flag', join: join ?? 'and', conditions: conds };
}

export function isExpressibleInSimple(ast: FormulaAst): boolean {
  return astToSimple(ast) !== null;
}
```

- [ ] **Step 4: Run tests — PASS**

Run: `npm run test -- lib/formula/simpleForm.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/formula/simpleForm.ts lib/formula/simpleForm.test.ts
git commit -m "feat(formula): Simple-mode three shapes + round-trip + expressibility check"
```

---

## Phase 2 — Data model widening

### Task 7: Extend `FieldDefinition`, `FieldType`, add `ComputedOutput`; widen `Account.fields`

**Files:**
- Modify: `lib/accountFields.ts`
- Modify: `types/account.ts`
- Modify: `lib/directus-mappers.ts:29-38` (the `FieldDefRow` interface and adjacent functions)

- [ ] **Step 1: Update `lib/accountFields.ts`**

Replace the top of the file (lines 1–14) with:

```ts
import type { FormulaAst } from './formula/ast';
import type { SimpleFormConfig } from './formula/simpleForm';

export type FieldType = 'categorical' | 'metric' | 'text' | 'computed';
export type FieldEntity = 'account' | 'contact' | 'activity' | 'task';
export type ComputedOutput = 'number' | 'text' | 'boolean';

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];           // categorical only
  isCurrency?: boolean;         // metric, or computed with outputType === 'number'
  entity: FieldEntity;
  aliases?: string[];
  // computed-only:
  outputType?: ComputedOutput;
  formula?: FormulaAst;
  formulaSource?: string;       // Advanced-mode user text (round-trip)
  formulaForm?: SimpleFormConfig; // Simple-mode form config (round-trip)
}
```

- [ ] **Step 2: Extend `formatFieldValue`**

Replace the existing `formatFieldValue` with one that handles booleans and the `'computed'` type:

```ts
export function formatFieldValue(
  value: string | number | boolean | undefined,
  field: FieldDefinition,
): string {
  if (value === undefined || value === null || value === '') return '—';

  if (field.type === 'computed') {
    if (field.outputType === 'boolean') {
      if (typeof value !== 'boolean') return '—';
      return value ? '✓' : '✗';
    }
    if (field.outputType === 'text') return String(value);
    // number — fall through to metric formatting
  }

  if (field.type === 'metric' || (field.type === 'computed' && field.outputType === 'number')) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (field.isCurrency) {
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
      return `$${n.toLocaleString()}`;
    }
    return n.toLocaleString();
  }
  return String(value);
}
```

Note the behavioural change: the previous code returned `—` for any metric value ≤ 0. Computed metrics legitimately produce 0 and negatives (Quota − Booked), so the guard becomes "not finite" instead of "≤ 0". This is intentional and matches the spec; if downstream code relies on the old behaviour for legacy metric fields, that is a latent bug exposed by this change — fix the callers, not the formatter.

- [ ] **Step 3: Widen `types/account.ts`**

Replace `fields: Record<string, string | number>;` with:

```ts
fields: Record<string, string | number | boolean>;
```

- [ ] **Step 4: Update `lib/directus-mappers.ts` row + mapper**

Update `FieldDefRow` (around line 29):

```ts
export interface FieldDefRow {
  id: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  is_currency: boolean | null;
  entity: FieldEntity | null;
  aliases: string[] | null;
  sort: number | null;
  // computed-only (new columns — see Task 8):
  output_type: 'number' | 'text' | 'boolean' | null;
  formula_source: string | null;
  formula_form: unknown | null;   // JSON
  formula_ast: unknown | null;    // JSON
}
```

Update `rowToFieldDef`:

```ts
export function rowToFieldDef(r: FieldDefRow): FieldDefinition {
  return {
    id: r.id,
    label: r.label,
    type: r.type,
    entity: r.entity ?? 'account',
    ...(r.options ? { options: r.options } : {}),
    ...(r.is_currency ? { isCurrency: true } : {}),
    ...(r.aliases?.length ? { aliases: r.aliases } : {}),
    ...(r.output_type ? { outputType: r.output_type } : {}),
    ...(r.formula_source ? { formulaSource: r.formula_source } : {}),
    ...(r.formula_form ? { formulaForm: r.formula_form as FieldDefinition['formulaForm'] } : {}),
    ...(r.formula_ast ? { formula: r.formula_ast as FieldDefinition['formula'] } : {}),
  };
}
```

Locate `fieldDefToRowPatch` (it follows `rowToFieldDef`; if missing, add it) and ensure it emits the new columns when the corresponding fields are present on the input. The current shape should become:

```ts
export function fieldDefToRowPatch(input: Partial<FieldDefinition>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined)         patch.label = input.label;
  if (input.type !== undefined)          patch.type = input.type;
  if (input.options !== undefined)       patch.options = input.options ?? null;
  if (input.isCurrency !== undefined)    patch.is_currency = !!input.isCurrency;
  if (input.entity !== undefined)        patch.entity = input.entity;
  if (input.aliases !== undefined)       patch.aliases = input.aliases ?? null;
  if (input.outputType !== undefined)    patch.output_type = input.outputType ?? null;
  if (input.formulaSource !== undefined) patch.formula_source = input.formulaSource ?? null;
  if (input.formulaForm !== undefined)   patch.formula_form = input.formulaForm ?? null;
  if (input.formula !== undefined)       patch.formula_ast = input.formula ?? null;
  return patch;
}
```

(If the existing implementation diverges, preserve all existing key handlers and **only** add the four new branches.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean, or only failures in callers that need to handle `boolean` values — fix those in their own tasks below; don't fix here.

If the type-check surfaces failures outside the files touched by this task, **list them** in the commit message so subsequent tasks know the call sites are flagged.

- [ ] **Step 6: Commit**

```bash
git add lib/accountFields.ts types/account.ts lib/directus-mappers.ts
git commit -m "feat(accountFields): extend FieldDefinition for computed type; widen value union to boolean"
```

---

### Task 8: Directus schema — add the four new columns

**Files:**
- This is an out-of-band Directus admin task; no source files change. Document it.

- [ ] **Step 1: In the Directus admin UI (Settings → Data Model → `field_definitions`), add four columns:**

| Field key | Interface | Type | Allow null | Default |
|---|---|---|---|---|
| `output_type` | Dropdown | String | yes | null |
| `formula_source` | Textarea | Text | yes | null |
| `formula_form` | Code (JSON) | JSON | yes | null |
| `formula_ast` | Code (JSON) | JSON | yes | null |

For `output_type`, set Dropdown choices to `number`, `text`, `boolean`.

- [ ] **Step 2: Confirm round-trip via the dev server**

```bash
npm run dev
# In another shell: load the Accounts page once. No console errors expected.
```

Expected: page loads; `fieldDefs` hydrate; existing categorical/metric/text fields untouched.

- [ ] **Step 3: Commit a small note in `docs/`** (no schema-as-code in this repo; record what was done so other developers can mirror it):

Create `docs/superpowers/notes/2026-05-19-field-defs-columns.md`:

```markdown
# field_definitions: new columns (2026-05-19)

Added to support the Computed Fields feature (`docs/superpowers/specs/2026-05-19-computed-fields-design.md`):

- `output_type` (string, nullable, dropdown: number | text | boolean)
- `formula_source` (text, nullable)
- `formula_form` (JSON, nullable)
- `formula_ast` (JSON, nullable)

All four are nullable so existing non-computed rows are unaffected. Mappers in `lib/directus-mappers.ts` round-trip them.
```

```bash
git add docs/superpowers/notes/2026-05-19-field-defs-columns.md
git commit -m "docs: record field_definitions columns added for computed fields"
```

---

## Phase 3 — Store wiring

### Task 9: Wire `runComputedRecompute` into the accounts slice

**Files:**
- Modify: `store/slices/accountsSlice.ts`

After every write that could change a source field, recompute affected computed values and persist the result. Because `recomputeAccount` is pure and operates per-account, this is a small set of localized tails.

- [ ] **Step 1: Add the import and helper at the top of the file**

Insert under the existing imports in `store/slices/accountsSlice.ts`:

```ts
import { recomputeAccount } from '@/lib/formula/recompute';
```

Add a private helper above `createAccountsSlice`:

```ts
/** Returns a copy of `account` with computed fields refreshed against the current fieldDefs. */
function withComputedRefresh(account: Account, defs: FieldDefinition[]): Account {
  return recomputeAccount(account, defs);
}
```

- [ ] **Step 2: Recompute on `addAccount`**

Inside `addAccount`, after the server returns `created` and before `set((s) => ...)`, replace:

```ts
const created = await directusWrite.createAccount({ ... });
set((s) => ({
  accounts: { ...s.accounts, [created.id]: created },
  accountOrder: [...s.accountOrder, created.id],
}));
```

with:

```ts
const created = await directusWrite.createAccount({ ... });
const refreshed = withComputedRefresh(created, get().fieldDefs);
if (Object.keys(refreshed.fields).length !== Object.keys(created.fields).length) {
  // Persist materialized computed values back to Directus.
  await directusWrite.updateAccount(created.id, { fields: refreshed.fields });
}
set((s) => ({
  accounts: { ...s.accounts, [created.id]: refreshed },
  accountOrder: [...s.accountOrder, created.id],
}));
```

- [ ] **Step 3: Recompute on `updateAccount` and `setAccountField`**

In `updateAccount`, replace the success-branch line:

```ts
set((s) => ({ accounts: { ...s.accounts, [id]: updated } }));
```

with:

```ts
const refreshed = withComputedRefresh(updated, get().fieldDefs);
if (JSON.stringify(refreshed.fields) !== JSON.stringify(updated.fields)) {
  await directusWrite.updateAccount(id, { fields: refreshed.fields });
}
set((s) => ({ accounts: { ...s.accounts, [id]: refreshed } }));
```

In `setAccountField`, apply the same transformation to its success branch.

- [ ] **Step 4: Recompute on `importAccounts`**

After the `[created, updated]` Promise.all in `importAccounts`, before the `set((s) => ...)` that materializes results, add a single batched pass:

```ts
const defs = get().fieldDefs;
const computedIds = defs.filter((d) => d.type === 'computed').map((d) => d.id);
if (computedIds.length > 0) {
  const allAccounts = [...created, ...updated];
  const refreshed = await Promise.all(allAccounts.map(async (a) => {
    const r = recomputeAccount(a, defs);
    if (JSON.stringify(r.fields) !== JSON.stringify(a.fields)) {
      return directusWrite.updateAccount(a.id, { fields: r.fields });
    }
    return a;
  }));
  // Reconcile created/updated arrays from `refreshed` by id.
  const byId = new Map(refreshed.map((a) => [a.id, a]));
  for (let i = 0; i < created.length; i++) created[i] = byId.get(created[i].id) ?? created[i];
  for (let i = 0; i < updated.length; i++) updated[i] = byId.get(updated[i].id) ?? updated[i];
}
```

- [ ] **Step 5: Recompute when field defs change**

When a computed field is added or its formula is edited, refresh all accounts. When a source field's defs change, computed fields that reference it are refreshed transitively by the topological walk inside `recomputeAccount`.

In `addFieldDef`, append at the end of the success branch (after the existing `set(...)`):

```ts
if (created.type === 'computed') {
  await refreshAllAccountsForComputed(get, set);
}
```

In `updateFieldDef`, append the same call to the success branch after the second `set(...)`. In `removeFieldDef`, after the successful delete, call it as well (a removed computed field needs its values cleaned out of `account.fields`).

Add the helper at the bottom of the file (outside `createAccountsSlice`):

```ts
async function refreshAllAccountsForComputed(
  get: () => TerritoryStore,
  set: (partial: Partial<TerritoryStore> | ((s: TerritoryStore) => Partial<TerritoryStore>)) => void,
): Promise<void> {
  const defs = get().fieldDefs;
  const accounts = Object.values(get().accounts);
  const computedIds = new Set(defs.filter((d) => d.type === 'computed').map((d) => d.id));
  // Strip any orphaned computed-field values (defs that no longer exist) and recompute.
  const nextById: Record<string, Account> = {};
  await Promise.all(accounts.map(async (a) => {
    const cleanedFields: Account['fields'] = { ...a.fields };
    for (const key of Object.keys(cleanedFields)) {
      const isComputedKey = defs.some((d) => d.id === key && d.type === 'computed');
      const isStaleComputed = !defs.some((d) => d.id === key) && computedIds.size > 0; // unlikely; defensive
      if (isComputedKey || isStaleComputed) delete cleanedFields[key];
    }
    const refreshed = recomputeAccount({ ...a, fields: cleanedFields }, defs);
    if (JSON.stringify(refreshed.fields) !== JSON.stringify(a.fields)) {
      const persisted = await directusWrite.updateAccount(a.id, { fields: refreshed.fields });
      nextById[a.id] = persisted;
    } else {
      nextById[a.id] = a;
    }
  }));
  set((s) => ({ accounts: { ...s.accounts, ...nextById } }));
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Write a store integration test**

Create `store/slices/accountsSlice.computed.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createAccountsSlice, type AccountsSlice } from './accountsSlice';
import type { TerritoryStore } from '../types';
import type { FieldDefinition } from '@/lib/accountFields';

vi.mock('@/lib/directus-write', () => {
  const updateAccount = vi.fn((id: string, patch: unknown) => Promise.resolve({ id, name: 'X', repId: null, stageId: null, fields: {}, ...patch }));
  return {
    updateAccount,
    createAccount: vi.fn(async (input) => ({ id: 'new', repId: null, stageId: null, ...input, fields: input.fields ?? {} })),
    createAccountsBulk: vi.fn(async (inputs: unknown[]) => inputs.map((i, k) => ({ id: `b${k}`, repId: null, stageId: null, fields: {}, ...(i as object) }))),
    deleteAccount: vi.fn(),
    deleteAccounts: vi.fn(),
    createFieldDef: vi.fn(async (d, s) => ({ id: 'fd', ...d, sort: s })),
    updateFieldDef: vi.fn(async (id, p) => ({ id, ...p } as FieldDefinition)),
    deleteFieldDef: vi.fn(),
    reorderFieldDefs: vi.fn(),
  };
});

vi.mock('@/lib/directus', () => ({ getAccounts: vi.fn(async () => []) }));

function makeStore() {
  let state: Partial<TerritoryStore> = {};
  const set: any = (p: any) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) }; };
  const get: any = () => state;
  const slice = createAccountsSlice(set, get, {} as any) as AccountsSlice;
  Object.assign(state, slice);
  return { state, set, get };
}

describe('accountsSlice — computed recompute', () => {
  it('updateAccount recomputes computed fields', async () => {
    const { state, get } = makeStore();
    const defs: FieldDefinition[] = [
      { id: 'arr', label: 'ARR', type: 'metric', entity: 'account' },
      { id: 'tier', label: 'Tier', type: 'computed', entity: 'account', outputType: 'text',
        formula: { kind: 'if',
          cond: { kind: 'compare', op: '>', left: { kind: 'fieldRef', fieldId: 'arr' }, right: { kind: 'literal', valueType: 'number', value: 100 } },
          then: { kind: 'literal', valueType: 'text', value: 'Big' },
          else: { kind: 'literal', valueType: 'text', value: 'Small' } } },
    ];
    (state as any).hydrateFieldDefs(defs);
    (state as any).hydrateAccounts([{ id: 'a1', name: 'Acme', repId: null, stageId: null, fields: {} }]);
    await (state as any).updateAccount('a1', { fields: { arr: 200 } });
    expect(get().accounts['a1'].fields.tier).toBe('Big');
  });
});
```

- [ ] **Step 8: Run the new test — PASS**

Run: `npm run test -- store/slices/accountsSlice.computed.test.ts`

- [ ] **Step 9: Commit**

```bash
git add store/slices/accountsSlice.ts store/slices/accountsSlice.computed.test.ts
git commit -m "feat(store): recompute computed fields on every account/fieldDef write"
```

---

## Phase 4 — FormulaEditor

### Task 10: Editor shell + header

**Files:**
- Create: `components/accounts/formula/FormulaEditor.tsx`
- Create: `components/accounts/formula/FormulaEditorHeader.tsx`

`FormulaEditor` is the parent that holds the editor's draft state (name, outputType, mode, simple config, advanced source) and exposes an `onSave(def)` callback that the host (Manage Fields modal) wires up.

- [ ] **Step 1: Create `FormulaEditorHeader.tsx`**

```tsx
'use client';

import type { ComputedOutput, FieldDefinition } from '@/lib/accountFields';

interface Props {
  label: string;
  onLabelChange: (v: string) => void;
  outputType: ComputedOutput;
  outputTypeLocked: boolean;
  onOutputTypeChange: (v: ComputedOutput) => void;
  onRequestConvert: () => void;
  isCurrency: boolean;
  onIsCurrencyChange: (v: boolean) => void;
  mode: 'simple' | 'advanced';
  onModeChange: (m: 'simple' | 'advanced') => void;
  previewAccountId: string | null;
  previewOptions: Array<{ id: string; name: string }>;
  onPreviewAccountChange: (id: string) => void;
  previewLabel: string; // formatted preview value or "—"
}

export default function FormulaEditorHeader(props: Props) {
  return (
    <div className="space-y-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <input
          aria-label="Field name"
          value={props.label}
          onChange={(e) => props.onLabelChange(e.target.value)}
          placeholder="Field name…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          aria-label="Output type"
          value={props.outputType}
          disabled={props.outputTypeLocked}
          onChange={(e) => props.onOutputTypeChange(e.target.value as ComputedOutput)}
          className="rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-6 text-xs text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="number">Number</option>
          <option value="text">Text</option>
          <option value="boolean">Boolean</option>
        </select>
        {props.outputTypeLocked && (
          <button
            type="button"
            onClick={props.onRequestConvert}
            className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950"
          >
            Convert output type…
          </button>
        )}
        {props.outputType === 'number' && (
          <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={props.isCurrency}
              onChange={(e) => props.onIsCurrencyChange(e.target.checked)}
              className="h-3 w-3 accent-indigo-600"
            />
            $
          </label>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div role="tablist" aria-label="Mode" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {(['simple', 'advanced'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={props.mode === m}
              onClick={() => props.onModeChange(m)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                props.mode === m
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              {m === 'simple' ? 'Simple' : 'Advanced'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Preview against
          <select
            value={props.previewAccountId ?? ''}
            onChange={(e) => props.onPreviewAccountChange(e.target.value)}
            className="rounded border border-slate-200 bg-white py-1 pl-1.5 pr-5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="">— pick an account —</option>
            {props.previewOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>

        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          Result: <strong className="text-slate-800 dark:text-slate-100">{props.previewLabel}</strong>
        </span>
      </div>
    </div>
  );
}

export type { Props as FormulaEditorHeaderProps };
export function isFieldDefinitionComputed(def: FieldDefinition): boolean {
  return def.type === 'computed';
}
```

- [ ] **Step 2: Create the `FormulaEditor.tsx` shell**

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { FieldDefinition, ComputedOutput } from '@/lib/accountFields';
import { formatFieldValue } from '@/lib/accountFields';
import type { Account } from '@/types/account';
import type { FormulaAst } from '@/lib/formula/ast';
import type { SimpleFormConfig } from '@/lib/formula/simpleForm';
import { simpleToAst, astToSimple, isExpressibleInSimple } from '@/lib/formula/simpleForm';
import { parse, prettyPrint } from '@/lib/formula/parse';
import { evaluate } from '@/lib/formula/evaluate';
import { inferType } from '@/lib/formula/typeCheck';
import { detectCycle } from '@/lib/formula/recompute';
import FormulaEditorHeader from './FormulaEditorHeader';
import SimpleMode from './SimpleMode';
import AdvancedMode from './AdvancedMode';
import ConvertOutputDialog from './ConvertOutputDialog';

interface Props {
  /** Existing computed field being edited; null when authoring a new one. */
  existing: FieldDefinition | null;
  /** Full set of field defs (used for autocomplete + type checks). */
  defs: FieldDefinition[];
  accounts: Account[];
  onCancel: () => void;
  onSave: (draft: Omit<FieldDefinition, 'id'>) => Promise<void>;
}

const DEFAULT_SIMPLE: Record<ComputedOutput, SimpleFormConfig> = {
  number:  { shape: 'arithmetic', terms: [] },
  text:    { shape: 'bucket', fieldId: '', op: '>', tiers: [], otherwise: '' },
  boolean: { shape: 'flag', join: 'and', conditions: [] },
};

export default function FormulaEditor({ existing, defs, accounts, onCancel, onSave }: Props) {
  const [label, setLabel] = useState(existing?.label ?? '');
  const [outputType, setOutputType] = useState<ComputedOutput>(existing?.outputType ?? 'number');
  const [isCurrency, setIsCurrency] = useState(!!existing?.isCurrency);
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [simpleCfg, setSimpleCfg] = useState<SimpleFormConfig>(
    existing?.formulaForm ?? (existing?.formula ? (astToSimple(existing.formula) ?? DEFAULT_SIMPLE[existing.outputType ?? 'number']) : DEFAULT_SIMPLE[outputType]),
  );
  const [advancedSrc, setAdvancedSrc] = useState<string>(
    existing?.formulaSource
      ?? (existing?.formula ? prettyPrint(existing.formula, { idToName: idMapFromDefs(defs) }) : ''),
  );
  const [previewId, setPreviewId] = useState<string | null>(accounts[0]?.id ?? null);
  const [showConvert, setShowConvert] = useState(false);

  const outputTypeLocked = existing !== null;

  const idToName = useMemo(() => idMapFromDefs(defs), [defs]);
  const nameToId = useMemo(() => nameMapFromDefs(defs), [defs]);

  // Build the AST for the current draft.
  const draftAst: FormulaAst | null = useMemo(() => {
    if (mode === 'simple') {
      try { return simpleToAst(simpleCfg); } catch { return null; }
    }
    const r = parse(advancedSrc, { nameToId });
    return r.ok ? r.ast : null;
  }, [mode, simpleCfg, advancedSrc, nameToId]);

  // Preview value.
  const previewAccount = accounts.find((a) => a.id === previewId) ?? null;
  const previewLabel = useMemo(() => {
    if (!draftAst || !previewAccount) return '—';
    const r = evaluate(draftAst, previewAccount, defs);
    if (!r.ok) return '—';
    return formatFieldValue(r.value as string | number | boolean, {
      id: 'preview', label, type: 'computed', entity: 'account',
      outputType, isCurrency,
    });
  }, [draftAst, previewAccount, defs, label, outputType, isCurrency]);

  // Save-gate validations.
  function validate(): string | null {
    if (!label.trim()) return 'Name is required.';
    if (!draftAst) return mode === 'advanced' ? 'Fix the formula errors above.' : 'Complete the formula.';
    const inferred = inferType(draftAst, defs);
    if (!inferred.ok) return `Type error: ${inferred.error.code}`;
    if (inferred.type !== outputType) return `Formula returns ${inferred.type}, but output is set to ${outputType}.`;
    const draftDef: FieldDefinition = {
      id: existing?.id ?? '__draft__',
      label, type: 'computed', entity: 'account',
      outputType, isCurrency, formula: draftAst,
    };
    const cycle = detectCycle(existing ? defs.map((d) => d.id === existing.id ? draftDef : d) : [...defs, draftDef]);
    if (cycle) return 'This formula would create a cycle.';
    return null;
  }

  const validationError = validate();

  async function handleSave() {
    if (validationError) return;
    await onSave({
      label: label.trim(),
      type: 'computed',
      entity: 'account',
      outputType,
      isCurrency: outputType === 'number' ? isCurrency : undefined,
      formula: draftAst!,
      formulaSource: mode === 'advanced' ? advancedSrc : prettyPrint(draftAst!, { idToName }),
      formulaForm: mode === 'simple' ? simpleCfg : undefined,
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <FormulaEditorHeader
        label={label}
        onLabelChange={setLabel}
        outputType={outputType}
        outputTypeLocked={outputTypeLocked}
        onOutputTypeChange={(v) => { setOutputType(v); setSimpleCfg(DEFAULT_SIMPLE[v]); }}
        onRequestConvert={() => setShowConvert(true)}
        isCurrency={isCurrency}
        onIsCurrencyChange={setIsCurrency}
        mode={mode}
        onModeChange={setMode}
        previewAccountId={previewId}
        previewOptions={accounts.map((a) => ({ id: a.id, name: a.name }))}
        onPreviewAccountChange={setPreviewId}
        previewLabel={previewLabel}
      />

      <div className="p-5">
        {mode === 'simple' ? (
          <SimpleMode
            config={simpleCfg}
            outputType={outputType}
            defs={defs}
            onChange={setSimpleCfg}
            // If user manually switched the AST in Advanced to something Simple can't express,
            // SimpleMode shows the "too complex" banner.
            tooComplex={existing?.formula ? !isExpressibleInSimple(existing.formula) : false}
          />
        ) : (
          <AdvancedMode
            source={advancedSrc}
            onChange={setAdvancedSrc}
            defs={defs}
            previewAccount={previewAccount}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        {validationError && (
          <span className="mr-auto text-xs text-rose-600 dark:text-rose-400">{validationError}</span>
        )}
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!!validationError}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {showConvert && existing && (
        <ConvertOutputDialog
          fieldLabel={existing.label}
          currentType={existing.outputType ?? 'number'}
          onCancel={() => setShowConvert(false)}
          onConfirm={(next) => {
            setOutputType(next);
            setSimpleCfg(DEFAULT_SIMPLE[next]);
            setAdvancedSrc('');
            setShowConvert(false);
          }}
        />
      )}
    </div>
  );
}

function idMapFromDefs(defs: FieldDefinition[]): Record<string, string> {
  const out: Record<string, string> = {};
  defs.forEach((d) => { out[d.id] = d.label; });
  return out;
}

function nameMapFromDefs(defs: FieldDefinition[]): Record<string, string> {
  const out: Record<string, string> = {};
  defs.forEach((d) => { out[d.label] = d.id; });
  return out;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: failures for `SimpleMode`, `AdvancedMode`, `ConvertOutputDialog` — they don't exist yet. Continue.

- [ ] **Step 4: Commit**

```bash
git add components/accounts/formula/FormulaEditor.tsx components/accounts/formula/FormulaEditorHeader.tsx
git commit -m "feat(formula-editor): shell + header with mode switch + preview row"
```

---

### Task 11: Advanced mode (textarea + field autocomplete + error markers)

**Files:**
- Create: `components/accounts/formula/AdvancedMode.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useMemo, useRef, useState } from 'react';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';
import { parse } from '@/lib/formula/parse';

interface Props {
  source: string;
  onChange: (v: string) => void;
  defs: FieldDefinition[];
  previewAccount: Account | null;
}

export default function AdvancedMode({ source, onChange, defs, previewAccount }: Props) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteFilter, setAutocompleteFilter] = useState('');
  const [caret, setCaret] = useState(0);

  const nameToId = useMemo(() => Object.fromEntries(defs.map((d) => [d.label, d.id])), [defs]);

  const parseResult = useMemo(() => parse(source, { nameToId }), [source, nameToId]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    const pos = e.target.selectionStart ?? v.length;
    setCaret(pos);
    // Trigger autocomplete on "{"
    const before = v.slice(0, pos);
    const openIdx = before.lastIndexOf('{');
    const closeIdx = before.lastIndexOf('}');
    if (openIdx > closeIdx) {
      setAutocompleteOpen(true);
      setAutocompleteFilter(before.slice(openIdx + 1));
    } else {
      setAutocompleteOpen(false);
    }
  }

  function pickField(name: string) {
    const ta = taRef.current;
    if (!ta) return;
    const before = source.slice(0, caret);
    const openIdx = before.lastIndexOf('{');
    if (openIdx < 0) return;
    const after = source.slice(caret);
    const next = `${source.slice(0, openIdx)}{${name}}${after}`;
    onChange(next);
    setAutocompleteOpen(false);
    // Move caret past inserted token.
    setTimeout(() => {
      const newPos = openIdx + name.length + 2;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  const filteredFields = defs.filter((d) =>
    d.label.toLowerCase().includes(autocompleteFilter.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={taRef}
          aria-label="Formula source"
          value={source}
          onChange={handleChange}
          onKeyDown={(e) => { if (e.key === 'Escape') setAutocompleteOpen(false); }}
          spellCheck={false}
          rows={6}
          placeholder="Type a formula. Use { to insert a field. Example: IF({ARR} > 100000, 'Ent', 'SMB')"
          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        {autocompleteOpen && filteredFields.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-2 z-10 mt-1 max-h-48 min-w-[12rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {filteredFields.slice(0, 10).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => pickField(d.label)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-950"
                >
                  <span className="font-mono">{d.label}</span>
                  <span className="ml-2 text-xs text-slate-400">{d.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!parseResult.ok && parseResult.errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-rose-600 dark:text-rose-400">
          {parseResult.errors.map((e, idx) => (
            <li key={idx}>
              <span className="font-mono">col {e.col}:</span> {e.message}
              {e.code === 'UNKNOWN_FIELD' && e.name && (
                <span className="ml-1 text-rose-500/80">
                  {suggestField(e.name, defs)
                    ? `— did you mean "${suggestField(e.name, defs)!.label}"?`
                    : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {parseResult.ok && previewAccount && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Previewing against <strong>{previewAccount.name}</strong>.</p>
      )}
    </div>
  );
}

function suggestField(name: string, defs: FieldDefinition[]): FieldDefinition | undefined {
  const target = name.toLowerCase();
  let best: { d: FieldDefinition; score: number } | null = null;
  for (const d of defs) {
    const lower = d.label.toLowerCase();
    const score = sharedPrefix(lower, target) + (lower.includes(target) ? 3 : 0);
    if (score > 0 && (!best || score > best.score)) best = { d, score };
  }
  return best?.d;
}

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: still failing on `SimpleMode` / `ConvertOutputDialog`; AdvancedMode itself clean.

- [ ] **Step 3: Commit**

```bash
git add components/accounts/formula/AdvancedMode.tsx
git commit -m "feat(formula-editor): advanced-mode textarea with autocomplete + inline errors"
```

---

### Task 12: Simple mode shell + ArithmeticShape

**Files:**
- Create: `components/accounts/formula/SimpleMode.tsx`
- Create: `components/accounts/formula/shapes/ArithmeticShape.tsx`

- [ ] **Step 1: Create `SimpleMode.tsx`**

```tsx
'use client';

import type { FieldDefinition, ComputedOutput } from '@/lib/accountFields';
import type { SimpleFormConfig } from '@/lib/formula/simpleForm';
import ArithmeticShape from './shapes/ArithmeticShape';
import BucketShape from './shapes/BucketShape';
import FlagShape from './shapes/FlagShape';

interface Props {
  config: SimpleFormConfig;
  outputType: ComputedOutput;
  defs: FieldDefinition[];
  onChange: (cfg: SimpleFormConfig) => void;
  tooComplex: boolean;
}

export default function SimpleMode({ config, outputType, defs, onChange, tooComplex }: Props) {
  if (tooComplex) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        This formula is too complex for Simple mode. Switch to Advanced to edit it.
      </div>
    );
  }
  if (config.shape === 'arithmetic') {
    return <ArithmeticShape config={config} defs={defs} onChange={(c) => onChange(c)} />;
  }
  if (config.shape === 'bucket') {
    return <BucketShape config={config} defs={defs} onChange={(c) => onChange(c)} />;
  }
  return <FlagShape config={config} defs={defs} onChange={(c) => onChange(c)} />;
}
```

- [ ] **Step 2: Create `shapes/ArithmeticShape.tsx`**

```tsx
'use client';

import type { FieldDefinition } from '@/lib/accountFields';
import type { ArithmeticShape as Shape, ArithOp, ArithTerm } from '@/lib/formula/simpleForm';

interface Props {
  config: Shape;
  defs: FieldDefinition[];
  onChange: (c: Shape) => void;
}

const OPS: ArithOp[] = ['+', '-', '*', '/'];
const metricDefs = (defs: FieldDefinition[]) => defs.filter((d) => d.type === 'metric' || (d.type === 'computed' && d.outputType === 'number'));

export default function ArithmeticShape({ config, defs, onChange }: Props) {
  function setTerm(idx: number, t: ArithTerm) {
    const next = [...config.terms];
    next[idx] = t;
    onChange({ ...config, terms: next });
  }
  function addValueAndOp() {
    onChange({
      ...config,
      terms: config.terms.length === 0
        ? [{ kind: 'field', fieldId: '' }]
        : [...config.terms, { kind: 'op', op: '+' }, { kind: 'field', fieldId: '' }],
    });
  }
  function removeTail() {
    if (config.terms.length <= 1) return;
    onChange({ ...config, terms: config.terms.slice(0, -2) });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {config.terms.length === 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400">Pick a field to start.</span>
        )}
        {config.terms.map((t, i) => {
          if (t.kind === 'op') {
            return (
              <select
                key={i}
                aria-label={`Operator ${i}`}
                value={t.op}
                onChange={(e) => setTerm(i, { kind: 'op', op: e.target.value as ArithOp })}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
            );
          }
          if (t.kind === 'field') {
            return (
              <select
                key={i}
                aria-label={`Term ${i}`}
                value={t.fieldId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith('__num__')) {
                    setTerm(i, { kind: 'number', value: 0 });
                  } else {
                    setTerm(i, { kind: 'field', fieldId: v });
                  }
                }}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="" disabled>Pick a field…</option>
                {metricDefs(defs).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                <option value="__num__">— constant number —</option>
              </select>
            );
          }
          // number constant
          return (
            <input
              key={i}
              type="number"
              aria-label={`Number ${i}`}
              value={t.value}
              onChange={(e) => setTerm(i, { kind: 'number', value: Number(e.target.value) })}
              className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addValueAndOp}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"
        >
          + add term
        </button>
        {config.terms.length > 1 && (
          <button
            type="button"
            onClick={removeTail}
            className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-400 hover:border-rose-400 hover:text-rose-500 dark:border-slate-700"
          >
            − remove last term
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/accounts/formula/SimpleMode.tsx components/accounts/formula/shapes/ArithmeticShape.tsx
git commit -m "feat(formula-editor): Simple mode shell + ArithmeticShape (combinator)"
```

---

### Task 13: BucketShape and FlagShape

**Files:**
- Create: `components/accounts/formula/shapes/BucketShape.tsx`
- Create: `components/accounts/formula/shapes/FlagShape.tsx`

- [ ] **Step 1: Create `BucketShape.tsx`**

```tsx
'use client';

import type { FieldDefinition } from '@/lib/accountFields';
import type { BucketShape as Shape, CompareOp } from '@/lib/formula/simpleForm';

interface Props {
  config: Shape;
  defs: FieldDefinition[];
  onChange: (c: Shape) => void;
}

const OPS: CompareOp[] = ['>', '>=', '<', '<=', '=', '!='];
const metricDefs = (defs: FieldDefinition[]) => defs.filter((d) => d.type === 'metric' || (d.type === 'computed' && d.outputType === 'number'));

export default function BucketShape({ config, defs, onChange }: Props) {
  function updateTier(idx: number, patch: Partial<Shape['tiers'][number]>) {
    const tiers = config.tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onChange({ ...config, tiers });
  }
  function addTier() {
    onChange({ ...config, tiers: [...config.tiers, { threshold: 0, label: '' }] });
  }
  function removeTier(idx: number) {
    onChange({ ...config, tiers: config.tiers.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">When</span>
        <select
          aria-label="Bucket field"
          value={config.fieldId}
          onChange={(e) => onChange({ ...config, fieldId: e.target.value })}
          className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="" disabled>Pick a field…</option>
          {metricDefs(defs).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <span className="text-slate-500">is</span>
        <select
          aria-label="Bucket op"
          value={config.op}
          onChange={(e) => onChange({ ...config, op: e.target.value as CompareOp })}
          className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>
        <span className="text-slate-500">…</span>
      </div>

      <div className="space-y-1">
        {config.tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <input
              type="number"
              aria-label={`Threshold ${i}`}
              value={t.threshold}
              onChange={(e) => updateTier(i, { threshold: Number(e.target.value) })}
              className="w-32 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="text-slate-400">→</span>
            <input
              aria-label={`Result ${i}`}
              value={t.label}
              placeholder="Enterprise"
              onChange={(e) => updateTier(i, { label: e.target.value })}
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button onClick={() => removeTier(i)} aria-label={`Remove tier ${i}`}
              className="text-slate-400 hover:text-rose-500">×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={addTier}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          + add tier
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Otherwise →</span>
        <input
          aria-label="Otherwise result"
          value={config.otherwise}
          placeholder="SMB"
          onChange={(e) => onChange({ ...config, otherwise: e.target.value })}
          className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `FlagShape.tsx`**

```tsx
'use client';

import type { FieldDefinition } from '@/lib/accountFields';
import type { FlagShape as Shape, CompareOp } from '@/lib/formula/simpleForm';

interface Props {
  config: Shape;
  defs: FieldDefinition[];
  onChange: (c: Shape) => void;
}

const OPS: CompareOp[] = ['=', '!=', '<', '<=', '>', '>='];
const eligibleDefs = (defs: FieldDefinition[]) =>
  defs.filter((d) => d.type === 'metric' || d.type === 'text' || d.type === 'categorical' || (d.type === 'computed' && d.outputType !== 'boolean'));

export default function FlagShape({ config, defs, onChange }: Props) {
  function update(idx: number, patch: Partial<Shape['conditions'][number]>) {
    const conditions = config.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
    onChange({ ...config, conditions });
  }
  function add() {
    onChange({ ...config, conditions: [...config.conditions, { fieldId: '', op: '=', value: '' }] });
  }
  function remove(idx: number) {
    onChange({ ...config, conditions: config.conditions.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Match</span>
        <select
          aria-label="Join"
          value={config.join}
          onChange={(e) => onChange({ ...config, join: e.target.value as 'and' | 'or' })}
          className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="and">all of</option>
          <option value="or">any of</option>
        </select>
        <span className="text-slate-500">these conditions:</span>
      </div>

      <div className="space-y-1">
        {config.conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <select
              aria-label={`Field ${i}`}
              value={c.fieldId}
              onChange={(e) => update(i, { fieldId: e.target.value })}
              className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="" disabled>Pick a field…</option>
              {eligibleDefs(defs).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <select
              aria-label={`Op ${i}`}
              value={c.op}
              onChange={(e) => update(i, { op: e.target.value as CompareOp })}
              className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            <input
              aria-label={`Value ${i}`}
              value={String(c.value)}
              onChange={(e) => {
                const raw = e.target.value;
                const n = Number(raw);
                update(i, { value: raw !== '' && !Number.isNaN(n) ? n : raw });
              }}
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button onClick={() => remove(i)} aria-label={`Remove condition ${i}`}
              className="text-slate-400 hover:text-rose-500">×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          + add condition
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: clean except for `ConvertOutputDialog` (next task).

```bash
git add components/accounts/formula/shapes/BucketShape.tsx components/accounts/formula/shapes/FlagShape.tsx
git commit -m "feat(formula-editor): Simple-mode BucketShape + FlagShape"
```

---

### Task 14: ConvertOutputDialog (destructive output-type change)

**Files:**
- Create: `components/accounts/formula/ConvertOutputDialog.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ComputedOutput } from '@/lib/accountFields';

interface Props {
  fieldLabel: string;
  currentType: ComputedOutput;
  onCancel: () => void;
  onConfirm: (next: ComputedOutput) => void;
}

export default function ConvertOutputDialog({ fieldLabel, currentType, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [next, setNext] = useState<ComputedOutput>(currentType === 'number' ? 'text' : 'number');
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="m-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-black/30 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Convert output type</h2>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
        <p>
          This will <strong>clear the formula</strong> for <em>{fieldLabel}</em> and recompute it as the new type
          for every account. Existing materialized values for this field will be overwritten.
        </p>
        <label className="flex items-center gap-2">
          New type:
          <select
            value={next}
            onChange={(e) => setNext(e.target.value as ComputedOutput)}
            className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {(['number', 'text', 'boolean'] as ComputedOutput[])
              .filter((t) => t !== currentType)
              .map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <button onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button onClick={() => onConfirm(next)}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700">
          Convert
        </button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/accounts/formula/ConvertOutputDialog.tsx
git commit -m "feat(formula-editor): destructive ConvertOutputDialog"
```

---

## Phase 5 — ManageFieldsModal integration

### Task 15: Add Computed type; embed FormulaEditor; broken-ref red dots

**Files:**
- Modify: `components/accounts/ManageFieldsModal.tsx`

- [ ] **Step 1: Add `'computed'` to the Add Field form**

In `AddFieldForm` (around lines 196–292), change the `<select>` to:

```tsx
<select value={type} onChange={(e) => setType(e.target.value as FieldType)} className={selectCls}>
  <option value="categorical">Categorical</option>
  <option value="metric">Metric</option>
  <option value="text">Text</option>
  <option value="computed">Computed (ƒ)</option>
</select>
```

When `type === 'computed'`, skip the existing inline submit; instead render the `FormulaEditor` below the input row and let the editor's own Save button call `addFieldDef`. Wrap the existing simple/text/categorical branches in `type !== 'computed' && (…)` and add:

```tsx
{type === 'computed' && (
  <FormulaEditor
    existing={null}
    defs={fieldDefs /* hoist via useFieldDefs hook in AddFieldForm */}
    accounts={accounts /* hoist via useAccountsList or similar */}
    onCancel={() => setType('categorical')}
    onSave={async (draft) => {
      await addFieldDef(draft);
      setLabel(''); setType('categorical');
    }}
  />
)}
```

Add the necessary imports at the top of the file:

```tsx
import FormulaEditor from './formula/FormulaEditor';
import { useFieldDefs, useActions } from '@/hooks/useTerritoryStore';
import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '@/store/territoryStore';
```

Inside `AddFieldForm` get the accounts list:

```tsx
const accounts = useTerritoryStore(useShallow((s) => Object.values(s.accounts)));
const fieldDefs = useFieldDefs();
```

- [ ] **Step 2: Update `FieldRow` for computed fields**

Below the existing row chrome (after the close of the top flex row), insert:

```tsx
{def.type === 'computed' && (
  <ComputedRowBody def={def} />
)}
```

Add a new component just above `FieldRow`:

```tsx
function ComputedRowBody({ def }: { def: FieldDefinition }) {
  const [editing, setEditing] = useState(false);
  const fieldDefs = useFieldDefs();
  const accounts = useTerritoryStore(useShallow((s) => Object.values(s.accounts)));
  const { updateFieldDef } = useActions();

  const broken = def.formula
    ? collectFieldRefs(def.formula).some((id) => !fieldDefs.some((d) => d.id === id))
    : false;

  return (
    <div className="mt-2 space-y-2 pl-6 text-xs">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {broken && <span title="References a deleted field" className="inline-block h-2 w-2 rounded-full bg-rose-500" />}
        <span className="font-mono">
          {def.formula ? prettyPrint(def.formula, { idToName: Object.fromEntries(fieldDefs.map((d) => [d.id, d.label])) }) : '(no formula)'}
        </span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded border border-slate-200 px-2 py-0.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {editing ? 'Close' : 'Edit formula'}
        </button>
      </div>
      {editing && (
        <FormulaEditor
          existing={def}
          defs={fieldDefs}
          accounts={accounts}
          onCancel={() => setEditing(false)}
          onSave={async (draft) => {
            await updateFieldDef(def.id, draft);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
```

Add these imports at the top:

```tsx
import { collectFieldRefs } from '@/lib/formula/ast';
import { prettyPrint } from '@/lib/formula/parse';
```

Update the type-badge map to include a colour for `computed`:

```tsx
const typeBadge: Record<FieldType, string> = {
  categorical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  metric:      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  text:        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  computed:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Visual smoke**

```bash
npm run dev
```

Open the Accounts page → Manage Fields. Add a Computed Number field `Weighted ARR` = `{ARR} × {Probability}` in Simple mode. Save. Edit an account's ARR or Probability. Confirm Weighted ARR updates in the table.

- [ ] **Step 5: Commit**

```bash
git add components/accounts/ManageFieldsModal.tsx
git commit -m "feat(accounts): embed FormulaEditor in Manage Fields; broken-ref indicator"
```

---

## Phase 6 — Surfaces

### Task 16: AccountsTable — `ƒ` glyph; boolean rendering; derived filter options

**Files:**
- Modify: `components/accounts/AccountsTable.tsx`

- [ ] **Step 1: Locate the column-header rendering**

The file is ~524 lines; find the loop that renders `<th>` cells for each field def. Add a `ƒ` glyph next to the header label for `def.type === 'computed'`:

```tsx
<span className="inline-flex items-center gap-1">
  {def.label}
  {def.type === 'computed' && (
    <span
      title={def.formula ? prettyPrint(def.formula, { idToName: idMap }) : 'Computed field'}
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    >
      ƒ
    </span>
  )}
</span>
```

Add `prettyPrint` import and build `idMap = useMemo(() => Object.fromEntries(defs.map((d) => [d.id, d.label])), [defs])` at the top of the component.

- [ ] **Step 2: Boolean cell rendering**

Find the cell-render path that calls `formatFieldValue`. Confirm `formatFieldValue` already handles booleans (Task 7). If there's a per-type branch in the table that bypasses `formatFieldValue` for metrics, ensure the `computed` type with `outputType === 'number'` flows through the metric branch.

- [ ] **Step 3: Filter pill — derive options for text-output computed fields**

Find the toolbar/filter code that lists categorical-field filter options. Extend it to handle computed fields with `outputType === 'text'` by deriving distinct values from materialized data:

```tsx
function deriveDistinctValues(def: FieldDefinition, accounts: Account[]): string[] {
  if (def.type === 'categorical') return def.options ?? [];
  if (def.type === 'computed' && def.outputType === 'text') {
    const seen = new Set<string>();
    for (const a of accounts) {
      const v = a.fields[def.id];
      if (typeof v === 'string' && v !== '') seen.add(v);
    }
    return [...seen].sort();
  }
  return [];
}
```

Use this wherever the existing code does `def.options` for filter-pill enumeration. For boolean-output computed fields, render a tri-state filter with `All / True / False` options.

- [ ] **Step 4: Type-check + smoke**

```bash
npx tsc --noEmit
npm run dev   # smoke: filter pill on the Tier (text) computed field shows the values currently present
```

- [ ] **Step 5: Commit**

```bash
git add components/accounts/AccountsTable.tsx
git commit -m "feat(accounts-table): ƒ glyph + boolean rendering + derived filter options for computed"
```

---

### Task 17: KanbanBoard — text-output grouping with drag disabled

**Files:**
- Modify: `components/accounts/KanbanBoard.tsx`

- [ ] **Step 1: Update the grouping-field eligibility check**

Find where the component decides which fields appear in the Group-by dropdown. Today it likely filters for `def.type === 'categorical'`. Extend to:

```tsx
function isEligibleGroupField(def: FieldDefinition, accounts: Account[]): boolean {
  if (def.type === 'categorical') return true;
  if (def.type === 'computed' && def.outputType === 'text') {
    const distinct = new Set<string>();
    for (const a of accounts) {
      const v = a.fields[def.id];
      if (typeof v === 'string' && v !== '') distinct.add(v);
      if (distinct.size > 12) return false;
    }
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Disable drag-to-move when grouping by a computed field**

Pass an `isComputedGrouping` prop to the per-card drag handler, and short-circuit `onDragStart`/`onDrop` when true. Render a banner above the board:

```tsx
{isComputedGrouping && (
  <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
    Grouped by a computed field — cards reflect data, drag to reorder is disabled.
  </div>
)}
```

For visual feedback, set `cursor: not-allowed` on the drag handle of each card while computed grouping is active.

- [ ] **Step 3: Columns derived from observed values**

If the existing implementation reads `def.options` to build columns, branch to use the distinct-value derivation from Step 1 when `def.type === 'computed'`. Sort alphabetically; render the unstaged/`—` bucket last.

- [ ] **Step 4: Smoke + commit**

```bash
npm run dev   # smoke: switch Kanban Group-by to a computed text field; verify drag disabled banner
```

```bash
git add components/accounts/KanbanBoard.tsx
git commit -m "feat(kanban): text-output computed fields as group-by; drag disabled"
```

---

### Task 18: AddEditAccountModal — read-only computed preview rows

**Files:**
- Modify: `components/accounts/AddEditAccountModal.tsx`

- [ ] **Step 1: Render computed fields as read-only preview rows**

Find the loop that renders per-field editors. Add an early branch:

```tsx
if (def.type === 'computed') {
  return <ComputedPreviewRow key={def.id} def={def} draft={draft} defs={fieldDefs} />;
}
```

Add the component at the bottom of the file (or co-located):

```tsx
import { evaluate } from '@/lib/formula/evaluate';
import { formatFieldValue } from '@/lib/accountFields';
import type { Account } from '@/types/account';
import type { FieldDefinition } from '@/lib/accountFields';

function ComputedPreviewRow({
  def, draft, defs,
}: {
  def: FieldDefinition;
  draft: Pick<Account, 'fields' | 'id' | 'name' | 'repId' | 'stageId'>;
  defs: FieldDefinition[];
}) {
  if (!def.formula) {
    return (
      <div className="text-xs text-slate-400">{def.label}: (no formula)</div>
    );
  }
  const previewAccount: Account = {
    id: draft.id, name: draft.name, repId: draft.repId, stageId: draft.stageId, fields: draft.fields,
  };
  const r = evaluate(def.formula, previewAccount, defs);
  const text = r.ok
    ? formatFieldValue(r.value as string | number | boolean, def)
    : '—';

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{def.label}</span>
      <span title="Computed field"
        className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">ƒ</span>
      <span className="ml-auto text-sm text-slate-600 dark:text-slate-200">{text}</span>
    </div>
  );
}
```

`draft` must include the user's in-flight `fields` map; route it from the modal's existing draft state. If the modal currently keeps separate `useState` per source field, gather them into a single `Record<string, string | number | boolean>` for the preview.

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit`

```bash
git add components/accounts/AddEditAccountModal.tsx
git commit -m "feat(account-modal): live preview rows for computed fields"
```

---

### Task 19: CSV import — exclude computed fields from target dropdown

**Files:**
- Modify: `components/accounts/AccountsImportModal.tsx`

- [ ] **Step 1: Find the column-mapping render**

Locate where each CSV column is rendered with a `<select>` of target fields. Add the filter and the skipped group.

Replace the target-field options list builder with:

```tsx
const targetFields = fieldDefs.filter((d) => d.type !== 'computed');
const computedTargets = fieldDefs.filter((d) => d.type === 'computed');
```

For each CSV column whose header (case-insensitive) matches a computed field's label or any alias, mark it as auto-skipped and render in a separate section:

```tsx
function isComputedMatch(header: string): FieldDefinition | undefined {
  const lower = header.trim().toLowerCase();
  return computedTargets.find(
    (d) => d.label.toLowerCase() === lower || (d.aliases ?? []).some((a) => a.toLowerCase() === lower),
  );
}
```

Render a "Skipped — computed field" group at the bottom of the mapping table listing the matched headers with the explanation: *"This column matches the computed field "X" and will be ignored — computed values are derived from other fields."*

- [ ] **Step 2: Smoke + commit**

```bash
npm run dev
# Smoke: prepare a CSV with a column matching the computed field's label; confirm it appears in Skipped.
```

```bash
git add components/accounts/AccountsImportModal.tsx
git commit -m "feat(import): exclude computed fields from target dropdown; surface as Skipped"
```

---

### Task 20: CSV export — include computed fields with `ƒ ` header prefix

**Files:**
- Modify: `components/accounts/AccountsToolbar.tsx` (or wherever the existing export action lives — search for "Export" / "exportCSV")
- Possibly modify: a helper file in `lib/` if export logic lives there.

- [ ] **Step 1: Locate existing CSV export**

```bash
grep -rn 'export.*CSV\|exportCSV\|toCSV' /Users/uzairrizvi/Documents/myProj/vegeta/components /Users/uzairrizvi/Documents/myProj/vegeta/lib
```

If no export action exists today, **add a minimal one** in `AccountsToolbar.tsx`:

```tsx
function buildAccountsCsv(accounts: Account[], defs: FieldDefinition[]): string {
  const cols: { id: string; header: string }[] = [
    { id: 'name', header: 'Name' },
    ...defs.map((d) => ({
      id: d.id,
      header: d.type === 'computed' ? `ƒ ${d.label}` : d.label,
    })),
  ];
  const escape = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    const s = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headerRow = cols.map((c) => escape(c.header)).join(',');
  const dataRows = accounts.map((a) =>
    cols.map((c) => escape(c.id === 'name' ? a.name : a.fields[c.id])).join(','),
  );
  return [headerRow, ...dataRows].join('\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
```

Wire a new toolbar button labeled `Export CSV` that calls `downloadCsv('accounts.csv', buildAccountsCsv(accounts, defs))`. If an export already exists, modify its header builder to use the `ƒ `-prefix rule.

- [ ] **Step 2: Add a tiny unit test for `buildAccountsCsv`**

Create `lib/accountsCsvExport.test.ts` (extract `buildAccountsCsv` into `lib/accountsCsvExport.ts` first; the toolbar then imports it):

```ts
import { describe, expect, it } from 'vitest';
import { buildAccountsCsv } from './accountsCsvExport';
import type { FieldDefinition } from './accountFields';
import type { Account } from '@/types/account';

describe('buildAccountsCsv', () => {
  it('marks computed columns with the ƒ prefix', () => {
    const defs: FieldDefinition[] = [
      { id: 'f_arr', label: 'ARR', type: 'metric', entity: 'account' },
      { id: 'f_t', label: 'Tier', type: 'computed', entity: 'account', outputType: 'text' },
    ];
    const accounts: Account[] = [
      { id: 'a', name: 'Acme', repId: null, stageId: null, fields: { f_arr: 100, f_t: 'SMB' } },
    ];
    const csv = buildAccountsCsv(accounts, defs);
    expect(csv.split('\n')[0]).toBe('Name,ARR,ƒ Tier');
    expect(csv.split('\n')[1]).toBe('Acme,100,SMB');
  });
  it('escapes commas and quotes', () => {
    const defs: FieldDefinition[] = [{ id: 'f_n', label: 'Notes', type: 'text', entity: 'account' }];
    const accounts: Account[] = [{ id: 'a', name: 'A, B "C"', repId: null, stageId: null, fields: { f_n: '' } }];
    const csv = buildAccountsCsv(accounts, defs);
    expect(csv.split('\n')[1]).toBe('"A, B ""C""",');
  });
});
```

- [ ] **Step 3: Run tests — PASS**

Run: `npm run test -- lib/accountsCsvExport.test.ts`

- [ ] **Step 4: Commit**

```bash
git add components/accounts/AccountsToolbar.tsx lib/accountsCsvExport.ts lib/accountsCsvExport.test.ts
git commit -m "feat(export): CSV export with ƒ-prefixed computed column headers"
```

---

## Phase 7 — Final integration polish

### Task 21: Categorical-option-change warnings; manual smoke matrix

**Files:**
- Modify: `components/accounts/ManageFieldsModal.tsx`

- [ ] **Step 1: Detect formula references to categorical option literals**

When a categorical field's `options` change, surface a soft warning next to every computed field whose formula contains a string literal that matches a removed option **and** that compares against the changed field.

In `ManageFieldsModal.tsx`, add a helper:

```tsx
function computedRefsCategoricalOption(def: FieldDefinition, catFieldId: string, removedOption: string): boolean {
  if (def.type !== 'computed' || !def.formula) return false;
  let hit = false;
  // walk: look for compare(fieldRef(catFieldId), literal('removedOption'))
  function walk(n: import('@/lib/formula/ast').FormulaAst): void {
    if (n.kind === 'compare'
        && n.left.kind === 'fieldRef' && n.left.fieldId === catFieldId
        && n.right.kind === 'literal' && n.right.valueType === 'text' && n.right.value === removedOption) {
      hit = true;
    }
    if (n.kind === 'binaryOp' || n.kind === 'compare' || n.kind === 'logical') { walk(n.left); walk(n.right); }
    else if (n.kind === 'not') walk(n.operand);
    else if (n.kind === 'if') { walk(n.cond); walk(n.then); walk(n.else); }
  }
  walk(def.formula);
  return hit;
}
```

When an option is removed in `removeOption`, after the existing `updateFieldDef` call, compute the set of affected computed fields and surface a non-blocking yellow banner inside the modal listing them by name. The banner persists until dismissed.

- [ ] **Step 2: Manual smoke matrix**

Run through this matrix locally; check ✅ for each row before commit.

| Scenario | Expected |
|---|---|
| Create Number formula `{ARR} * {Prob}` | Saves; column appears with ƒ glyph; sortable. |
| Edit ARR on an account | Weighted ARR updates immediately in the table. |
| Delete the source field `ARR` | Weighted ARR shows red dot in Manage Fields; cells render `—`. |
| Create text formula bucketing ARR into Ent/Mid/SMB | Distinct values appear in filter pill and Kanban group-by. |
| Drag a card in Kanban when grouped by computed | Banner shown; cursor not-allowed; drop ignored. |
| Convert output type from Text → Number via dialog | Formula cleared; backfill ran; all values now `—` until re-authored. |
| Import a CSV with a column named `Tier` | Surfaced in Skipped group with explanation. |
| Export CSV | Header shows `ƒ Tier`; values match table. |
| Create a formula that references itself (cycle) | Save blocked with "would create a cycle". |

- [ ] **Step 3: Commit**

```bash
git add components/accounts/ManageFieldsModal.tsx
git commit -m "feat(accounts): warn when categorical option used by a computed formula is removed"
```

---

## Phase 8 — Cleanup

### Task 22: Full test + lint pass

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: all green.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean. Fix any new findings inline; if any pre-existing finding surfaces in a file you didn't touch, leave it alone.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Production build smoke**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 5: Commit any small follow-up fixes**

If steps 1–4 surfaced minor fixes:

```bash
git add -A
git commit -m "chore(formula): lint/type/build fixes after end-to-end pass"
```

---

## Notes for the implementing engineer

- **TDD is mandatory for `lib/formula/*`.** These are pure modules; tests come first, implementations follow. If a test you wrote in Step 1 of a task passes accidentally before Step 3, the test isn't strong enough — strengthen it.
- **Don't touch `app/territory/`, `lib/directus.ts`, or anything outside the file map.** Computed fields are an Accounts-module feature; cross-cutting refactors are explicitly out of scope.
- **Don't add memoization in the evaluator** until you've measured a real performance problem with `console.time` against a workspace ≥ 5k accounts. The spec budgets <1ms per eval; the recursive walker comfortably hits that.
- **Field-ref `id`s are forever.** If you're tempted to "just match by label" anywhere — stop. Renames break that. Every cross-reference in this feature goes through `id`.
- **When in doubt, the spec wins.** `docs/superpowers/specs/2026-05-19-computed-fields-design.md`.
