# Computed / Formula Fields — Design

**Status:** Draft for review
**Date:** 2026-05-19
**Author:** brainstorm with Claude
**Module:** Accounts (CRM primitives, sub-project A of the broader CRM evolution)

## Summary

Add a fourth field type — `computed` — to the Accounts module. A computed field's value is derived from a formula over other fields on the same account. Formulas support Tier 2 expressiveness: arithmetic (`+ − × ÷`), comparison (`= ≠ < > ≤ ≥`), boolean (`AND OR NOT`), and `IF(cond, a, b)`. Output type is declared at field creation (`number`, `text`, or `boolean`) and locked thereafter.

Authoring uses a two-mode editor: **Simple** (a form-based picker covering three common shapes — arithmetic combinator, bucket/tier, flag) and **Advanced** (a text expression with field autocomplete and live error markers). The two modes round-trip without data loss; formulas that can't be represented in Simple mode display read-only with a clear escape hatch.

Evaluation is **hybrid**: a single pure evaluator runs both for the formula editor's live preview and for materialization. Computed values are materialized into the same `account.fields` map used by other fields, so existing sort, filter, and render paths work unchanged.

## Goals

- Let users define fields whose value is computed from other fields.
- Cover the 80% of CRM formula use cases (weighted pipeline, tier bucketing, simple flags) without requiring users to learn syntax.
- Leave a clear path to Tier 3 (function library) without a rewrite.
- No special-case rendering — computed fields look and behave like any other field except for an `ƒ` glyph and read-only editing.

## Non-goals

- Cross-account aggregates (`SUM` over related contacts) — Tier 3 territory.
- Function library (`ROUND`, `CONCAT`, `DATEDIFF`, `TODAY()`) — Tier 3.
- Formulas referencing fields on other entities (Contacts, Activities) — depends on those entities becoming first-class (sub-project C).
- Lookup tables, regex, string manipulation.

## User-facing decisions (settled during brainstorm)

| Decision | Choice | Why |
|---|---|---|
| Expressiveness | Tier 2: arithmetic + IF / AND / OR / NOT | ~80% coverage; bounded evaluator and test surface |
| Builder UX | Two-mode: Simple form + Advanced text | Most forgiving; round-trip preserves both representations |
| Evaluation timing | Hybrid: live for editor preview, materialized for table/kanban | Sortable/filterable in the table; live feedback while authoring; single shared evaluator prevents drift |
| Surface integration | Read-only in Add/Edit modal · Sortable & filterable table columns · Allowed as Kanban grouping (text-output only) · Excluded from CSV import, included in CSV export | Consistent with existing field types where it makes sense |
| Error handling | `—` in the cell, hover tooltip explains why | Matches existing empty-metric rendering; surfaces data-quality issues without noise |
| `outputType` editability | Locked after first save; explicit destructive Convert action | Prevents silent mixed-type intermediate states across materialized values |
| Simple mode coverage | Three fixed shapes (arithmetic / bucket / flag); fall back to Advanced for anything else | Bounded UI; clear escape hatch via "too complex for Simple" banner |

## Data model

Extend `FieldType` in `lib/accountFields.ts`:

```ts
export type FieldType = 'categorical' | 'metric' | 'text' | 'computed';
export type ComputedOutput = 'number' | 'text' | 'boolean';

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  entity: FieldEntity;
  options?: string[];        // categorical only
  isCurrency?: boolean;      // metric or number-output computed
  aliases?: string[];

  // computed-only:
  formula?: FormulaAst;       // canonical AST (evaluator input)
  formulaSource?: string;     // user-authored text from Advanced mode (round-trip)
  formulaForm?: SimpleFormConfig; // Simple-mode config (round-trip)
  outputType?: ComputedOutput;
}
```

Storing **both** `formulaSource` and the canonical `FormulaAst` lets the builder round-trip between Simple and Advanced without lossy re-parsing, and lets the evaluator skip parsing on every render.

`Account.fields` is widened from `Record<string, string | number>` to `Record<string, string | number | boolean>` to carry boolean computed outputs. Computed values live under the same map as every other field — no separate storage.

Field references inside an AST are by stable `id`, not label. Renames don't break formulas; deletions are detected on evaluation.

## Modules

| Path | Responsibility |
|---|---|
| `lib/formula/ast.ts` | AST types: `Literal`, `FieldRef`, `BinaryOp`, `UnaryOp`, `IfExpr`, `AndOr`, `Compare` |
| `lib/formula/parse.ts` | Text → AST. Reports error position and message for the Advanced editor's squiggles |
| `lib/formula/evaluate.ts` | `(ast, account, fieldDefs) → EvalResult`. Pure; no React, no store access |
| `lib/formula/recompute.ts` | Topological order; cycle detection; batch recompute helper called from the store |
| `lib/formula/simpleForm.ts` | `SimpleFormConfig ↔ FormulaAst` converter; detects "too complex for Simple" |
| `components/accounts/formula/FormulaEditor.tsx` | Two-mode editor used inside `ManageFieldsModal` |

Existing files touched:

- `lib/accountFields.ts` — extend types; extend `formatFieldValue` to handle booleans.
- `types/account.ts` — widen `fields` value union.
- `store/territoryStore.ts` — wire `runComputedRecompute(accountIds, fieldDefIds)` into the tails of `updateAccount`, `addFieldDef`, `updateFieldDef`, `removeFieldDef`, and CSV-import completion.
- `components/accounts/ManageFieldsModal.tsx` — add `Computed` option to the Add Field type dropdown; render the new badge color (emerald); embed `FormulaEditor` for computed rows; surface "broken — references deleted field" indicators.
- `components/accounts/AddEditAccountModal.tsx` — render computed fields as read-only preview rows, evaluated against the draft account state on every render.
- `components/accounts/AccountsTable.tsx` — render the `ƒ` glyph in the column header; derive distinct-value options for text-output filter pills.
- `components/accounts/KanbanBoard.tsx` — allow text-output computed fields as the grouping field when observed distinct values ≤ ~12; disable drag-to-move with a banner when grouped by a computed field.
- `components/accounts/AccountsImportModal.tsx` — exclude computed fields from the target dropdown; surface skipped CSV columns in a labeled group.

## Evaluator

```ts
type EvalResult =
  | { ok: true;  value: string | number | boolean }
  | { ok: false; code: ErrorCode; message: string };

type ErrorCode =
  | 'MISSING_FIELD'    // AST references a field that no longer exists
  | 'MISSING_VALUE'    // referenced field is empty on this account
  | 'TYPE_MISMATCH'    // text used in arithmetic, etc.
  | 'DIV_BY_ZERO'
  | 'BAD_FORMULA'      // malformed AST (defensive; rejected at save)
  | 'CYCLE';           // defensive; cycles rejected at save
```

**Type rules:**

| Operator | Operand types | Result |
|---|---|---|
| `+ − × ÷` | number, number | number |
| `= ≠` | same type | boolean |
| `< > ≤ ≥` | number, number | boolean |
| `AND OR NOT` | boolean | boolean |
| `IF(cond, a, b)` | boolean, T, T | T |

**Coercion is strict.** A text field used in arithmetic returns `TYPE_MISMATCH`; no silent stringification of numbers. Missing values short-circuit the entire expression (including conditions inside `IF`) to a single `MISSING_VALUE` error — explained in the cell tooltip.

**Evaluation paths:**

1. **Editor preview** — Simple and Advanced modes both call `evaluate()` on a synthetic preview account (defaults to the first account; user can choose another via the "Preview against" selector in the editor header).
2. **On account write** — `updateAccount` and CSV-import writes call `runComputedRecompute(accountIds, allComputedFieldIds)`, which walks the topological order and writes results into `account.fields` in the same transaction. Errors leave the slot `undefined` (cell renders `—`).
3. **On formula change** — when a computed `FieldDefinition` is added or edited, the same helper runs workspace-wide; a progress toast appears for large workspaces.
4. **On source-field-def change** — renames are no-ops (ASTs ref by id). Deletions surface as `MISSING_FIELD` at evaluation time; the Manage Fields modal flags dependent computed fields with a red dot and "Broken: references deleted field" inline.

**Cycle detection** runs at formula save time via DFS from the new/edited field through `FieldRef` nodes. Cycles are rejected at the editor level; the runtime `CYCLE` code is cheap defensive insurance.

## Builder UI

The Add Field row in `ManageFieldsModal.tsx` gains **Computed** as a fourth type. Selecting it swaps the row body for `FormulaEditor`, used both in the Add form and as the per-row edit surface for existing computed fields.

### Editor header (always visible)

```
[ Field name: Weighted ARR              ]  [Type: Computed ▾]
Output:  ( ) Number  (•) Text  ( ) Boolean      [ $ Currency ] (only if Number)
Mode:    [ Simple │ Advanced ]                  Preview against: [Acme Corp ▾]
Result preview:  Enterprise                     (or "—" with tooltip on error)
```

`outputType` is selected at creation and disabled thereafter. A separate **Convert output type…** button opens a confirm dialog that clears the formula and runs a workspace backfill.

### Simple mode — three shapes

**Shape A — arithmetic combinator** *(default when output = Number)*
```
  [ Field ▾ ARR ]  [ × ]  [ Field or number ▾ Probability ]   [+ add term]
```
Chains left-to-right with standard precedence rendered visually.

**Shape B — bucket/tier** *(default when output = Text)*
```
  When  [ Field ▾ ARR ]  is  [ > ▾ ]  [ 100000 ]  →  [ Enterprise ]
  When  [ Field ▾ ARR ]  is  [ > ▾ ]  [ 10000  ]  →  [ Mid ]
  Otherwise                                       →  [ SMB ]           [+ add tier]
```
Compiles to nested `IF` in declared order.

**Shape C — flag** *(default when output = Boolean)*
```
  [ Field ▾ Score ]  [ > ▾ ]  [ 70 ]   AND
  [ Field ▾ Stage ]  [ = ▾ ]  [ Demo ]                            [+ add condition]
```
Chained `AND` (per-row toggle to `OR`).

If a formula authored in Advanced can't be represented by any shape (mixed AND/OR, nested IF inside arithmetic, field-to-field comparison, `NOT`, etc.), Simple mode shows a read-only summary banner: *"This formula is too complex for Simple mode — edit in Advanced."* `formulaSource` and `formulaForm` are both stored, so no data is lost on mode switches.

### Advanced mode

Multiline monospace textarea with:
- Field autocomplete on `{` — inserts `{Field Label}` in source, stable `id` in AST.
- Keyword highlighting (`IF`, `AND`, `OR`, `NOT`).
- Inline error markers with hover messages including "did you mean…" suggestions.
- Debounced (~150ms) live preview against the selected preview account.

### Manage Fields row

Computed fields share the standard `FieldRow` chrome plus an emerald `computed` badge, a truncated formula summary, and an **Edit formula** button that expands the editor inline (no nested dialog).

## Surface integration

### Accounts table

- Renders as a column like any other field. `formatFieldValue` extended for booleans: `✓` for true, `✗` for false, `—` reserved for missing/error so the two cases are visually distinct.
- Sortable & filterable via existing paths (values are materialized).
- Text-output filter pill enumerates *observed* distinct values from materialized data (no declared enum).
- Number-output behaves like an existing metric field.
- Boolean-output uses a tri-state pill: All / True / False.
- Column header shows `ƒ` + tooltip with the formula summary.

### Kanban

- Allowed as the grouping field only when `outputType === 'text'` **and** the observed distinct-value cardinality is ≤ ~12 (same practical ceiling as categorical fields). Otherwise hidden from the Group-by dropdown with a tooltip.
- Columns derived from observed values, sorted alphabetically, with the empty/`—` bucket last.
- **Drag-to-move disabled** when grouped by a computed field; banner above the board explains why.

### Add/Edit Account modal

- Computed fields appear in their position in the field order as read-only preview rows: label + `ƒ` badge + live-evaluated value against the modal's draft state.
- Materialization happens through the store on save; the modal never writes computed values directly.

### CSV import

- Computed fields excluded from the target-field dropdown. CSV columns matching a computed field by alias/name appear in a "Skipped — computed field" group with the explanation inline.
- After import completes, a single batched recompute pass backfills computed values for all newly-imported accounts. One progress toast.

### CSV export

- Computed fields export their materialized value as a normal column. Empty/error cells export as empty string.
- Header row marks computed columns with a leading `ƒ ` prefix (the same export re-imported skips those columns by name match).

### Detail page

- `/accounts/[id]` already iterates `fieldDefs` and reads from `account.fields`. No changes beyond the `ƒ` badge.

## Error handling

### Per-account evaluation (`—` cell)

| Code | Tooltip |
|---|---|
| `MISSING_VALUE` | "Field *X* has no value on this account." |
| `MISSING_FIELD` | "Field referenced by this formula was deleted." |
| `TYPE_MISMATCH` | "Can't use text field *X* in arithmetic." |
| `DIV_BY_ZERO` | "Divide by zero." |
| `BAD_FORMULA` | "Formula has a syntax error — edit in Manage Fields." |
| `CYCLE` | "Field depends on itself." |

Errors are not persisted; the slot is left `undefined`. Tooltips are recomputed lazily on render so they stay accurate as users fix formulas.

### Save-time validation (editor blocks Save)

- Advanced-mode parse error.
- Cycle (this formula would reference itself transitively).
- Referenced field's type incompatible with how it's used (AST type check).
- Declared `outputType` doesn't match the AST's inferred return type.
- Simple mode: any incomplete row.

### Soft warnings (non-blocking)

- Referenced field has zero non-empty values across accounts.
- `IF` nesting depth > 5.

### Workspace events

| Event | Behavior |
|---|---|
| Source field renamed | No-op (id-based refs). Advanced source string re-renders with new label. |
| Source field deleted | Dependent computed fields keep their last materialized values; new evaluations return `MISSING_FIELD`; flagged red in Manage Fields. |
| Computed field deleted | Materialized values under that key cleaned up in the same transaction. |
| Computed formula edited | Workspace backfill via `runComputedRecompute`; progress toast. |
| Categorical option renamed/removed | Soft warning next to any computed field whose formula compares against that option string; no auto-rewrite. |
| CSV import touches source fields | Single batched recompute pass at end of import. |
| Account created without source fields populated | Computed values evaluate to `MISSING_VALUE` → `—`. Expected. |
| Workspace switch | Computed-field state isolated to the active workspace as today. |

## Performance

- Evaluator is a recursive AST walk; no parsing on hot paths. Target <1ms per evaluation.
- Workspace backfill: O(accounts × computed-fields-in-topological-order). 10k × 5 ≈ 50k evaluations, tens of ms. Batched into the store's existing write path.
- No memoization at first — measure before adding.

## Testing

### Layer 1 — `lib/formula/*` unit tests (lands with feature)

- Parser: every Tier-2 construct; every error case; position info; autocomplete-marker handling.
- Evaluator: every row of the type-rules table; missing-value short-circuit; divide-by-zero; `AND`/`OR`/`IF` short-circuit semantics.
- Recompute: topological order correctness; cycle detection; "edit formula → affected accounts" set.
- Simple-form converter: round-trip property test (config → AST → config) for all three shapes; "too complex" detection.

### Layer 2 — store integration tests (lands with feature)

- `updateAccount` triggers recompute of dependent computed fields only.
- `addFieldDef` / `updateFieldDef` / `removeFieldDef` on source fields cascade correctly.
- Import path runs one batched recompute, not per-row.
- Workspace switch isolates computed state.

### Layer 3 — FormulaEditor component tests (incremental)

- Simple ↔ Advanced round-trip preserves the AST.
- Save blocked on each save-time-validation case.
- "Too complex for Simple mode" banner shows when expected.
- Field rename elsewhere updates the Advanced source string.

The repo has no UI-component test pattern today; layer 3 either introduces the pattern or defers and lands as bugs surface.

## Migration & rollout

- No data migration required. Existing accounts and field defs are forward-compatible (no schema change at runtime; only the `fields` map's value union widens).
- Feature is invisible until a user creates their first computed field.
- Rollout is per-workspace by default (matches existing field-management surface).

## Open questions

None blocking. Items deferred to follow-ups:

- Whether to add a fourth Simple-mode shape — driven by usage signal, not speculation.
- Whether boolean export should be `true`/`false`, `1`/`0`, or `Yes`/`No`. Defaulting to `true`/`false`; revisit when a real consumer asks.
- Whether to add a per-field "recompute now" admin action; not needed if backfill is reliable.

## Related & next

- This is sub-project **A** of the CRM evolution roadmap. Adjacent sub-projects (B: field-type & schema upgrades; C: contacts as first-class; D: activities timeline; E: saved views & bulk actions; F: audit log; G: automation) are scoped but not designed.
- Implementation plan to follow in `docs/superpowers/plans/`.
