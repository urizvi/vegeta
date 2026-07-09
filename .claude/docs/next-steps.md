# WaferIQ — next steps

Living punch list. Keep short. When an item lands, remove it and add a
one-line reference in `task-summary.md`. When new items surface, add them
here.

Sibling: `.claude/docs/store-shape.md` (pre-P2 store audit).
Memory pointer: `[[waferiq-pivot]]`.

**Wedge locked 2026-07-09: POS / sell-through reconciliation.** Design-win
funnel deferred as a possible sibling wedge later.

## Immediately actionable (no gate)

- [ ] **Manual browser verification of P1.** `npm run dev`, drop a real
  messy CSV/XLSX at `/ingest`, confirm the parse → column-mapping →
  validation → save round-trip. P1's plan done-when is empirical; unit
  tests + build pass but the interaction isn't verified.
- [ ] **ESLint module boundaries.** `eslint.config.mjs` still targets
  `components/territory/**` and `app/territory/**` — those globs now
  match nothing (code lives under `legacy/`). Either retarget to
  `legacy/components/territory/**` or drop the block. Test at
  `test/eslint-boundaries.test.ts` synthesizes fake paths so it passes
  regardless; both files move or both stay.
- [ ] **Nav.** No shared nav lives in `RootLayout`. Users reach `/ingest`
  via the root redirect, but there's no way to jump between
  `/ingest` ↔ `/accounts` ↔ (later) `/results`. A minimal top-bar link
  set would help even before P4.
- [ ] **Manual browser verification of the ingest → mapping flow.**
  Now that the bridge UI (`EntityMappingPanel` under each dataset in
  `/ingest`) is wired, this is the moment to `npm run dev` + drop a
  real POS file + hit "Map to POS-recon" and confirm the round-trip.
  Verification blocked purely on doing it, not on any missing code.

## Nice-to-have between phases

- [ ] Local persistence for the ingest + entity stores. Datasets +
  posRecords + claims currently die on refresh. Bump to P5 unless a
  discovery interview needs it sooner.
- [ ] Sample POS + claims fixture CSVs in `public/` for demoing without
  a real file.
- [ ] Staged-import name defaulting: use XLSX sheet name for
  multi-sheet workbooks; today falls back to filename-sans-ext.
- [ ] Shared-lib pruning: `lib/territoryIndex.ts`, `lib/regionData.ts`,
  `lib/geoTreeFilter.ts`, `lib/choropleth.ts`, `lib/geoUtils.ts`,
  `hooks/useGeoData.ts` still colocated with active code. Prune when
  accounts is out of the critical path.

## In progress / just landed

- [x] **P2 — POS-recon data model.** `domain/pos-recon/entities.ts` +
  `import.ts`, three new store slices on `useWaferiqStore`
  (`posRecordsSlice`, `claimsSlice`, `reconResultsSlice`).
- [x] **P2→P3 bridge UI.** `EntityMappingPanel` on each saved dataset
  in `/ingest`: pick entity kind (POS records / S&D / PP), auto-seeded
  column-mapping via `domain/pos-recon/suggest.ts` synonym heuristic,
  run mapper, push results into the corresponding slice. Entity counts
  surface on each dataset row. See P2-bridge entry in `task-summary.md`.

## Next

- [ ] **P3 — POS recon matching engine.** Consumes `POSRecord[]` +
  `Claim[]`, produces `ReconciliationResult[]`. Owns the matching
  algorithm (part-number + customer + date-window + qty tolerance),
  discrepancy-flag generation, and calculated-credit math. Claude Agent
  SDK integration for fuzzy column mapping / entity matching lives here
  as an isolated, swappable module — not baked through the codebase.
  Test against fixtures built from a partner's real (anonymized) data,
  per the plan's cross-cutting rule.
- [ ] **P4 — recon dashboard.** One view: matched vs flagged, drill-down
  on discrepancies. D3, no chart library. CSV/XLSX export round-trip.
  Under-10-minute unaided time-to-first-value target.
- [ ] **P5 — design-partner hardening.** Robust to malformed / large /
  multi-period / multi-distributor inputs, self-serve onboarding, usage
  instrumentation for the retention thesis, pricing-gating hooks.

## Anti-list (rejected / shelved — don't accidentally revive)

- The CRM evolution roadmap (Phases 2–4: decouple jargon, CRM
  primitives, onboarding polish). Superseded 2026-07-06 by WaferIQ.
  See `[[crm-evolution]]` memory (marked SHELVED).
- Design-win funnel tracking as the P2 wedge — considered and deferred
  2026-07-09 in favor of POS recon. Not killed; may return as a sibling
  wedge under `domain/design-win-funnel/`.
- Shelved smoke matrix items 5–11 from the computed-fields closeout —
  paused indefinitely, not resuming without user ask.
