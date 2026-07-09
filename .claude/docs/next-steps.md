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
  `import.ts`, three new store slices on `useWaferiqStore`.
- [x] **P2→P3 bridge UI.** `EntityMappingPanel` on each saved dataset
  in `/ingest`: pick entity kind, auto-seeded column mapping via the
  suggester heuristic, run mapper, push results into the store.
- [x] **P3 — POS-recon matching engine.** `domain/pos-recon/engine.ts`
  + `matcher.ts` + `normalize.ts`. Reconcile POS ↔ claims with qty
  tolerance, soft + hard date windows, per-claim-type price checks,
  duplicate detection, calculated-credit math. `Matcher` interface is
  the seam for a future Agent SDK integration.
- [x] **P4 — recon dashboard.** `/recon` route with summary metrics +
  distribution bar + filters (status/flag/search) + drill-down rows
  showing POS record and linked claims + CSV/XLSX export. Top nav
  in `RootLayout` (WaferIQ / Ingest / Recon). `ReconRunner` on
  `/ingest` shrunk to a "go to /recon" nudge.

## Next

- [ ] **P5 — design-partner hardening.** Robust to malformed / large /
  multi-period / multi-distributor inputs, self-serve onboarding, usage
  instrumentation for the retention thesis, pricing-gating hooks.
- [ ] **Manual browser verification of the whole chain.** With P4
  landed, one session can now exercise P1 → P2 → P3 → P4. Drop a
  real POS file, drop a claims file, map both, hit Reconcile on
  `/recon`, filter/drill-down/export. This is the "under 10 minutes,
  unaided" done-when the plan set for P4.

## Deferred to when we can wire it

- [ ] **Real partner data as engine fixtures.** P3 tests are synthetic
  and cover every flag kind, but the plan calls for anonymized partner
  data. Do this alongside the first discovery conversation that
  produces real files.
- [ ] **AgentMatcher.** `Matcher` interface exists; a Claude
  Agent SDK-backed implementation of `customerScore` / `partScore`
  slots in without touching engine code. Blocked on wiring API keys
  and picking a matching prompt.

## Anti-list (rejected / shelved — don't accidentally revive)

- The CRM evolution roadmap (Phases 2–4: decouple jargon, CRM
  primitives, onboarding polish). Superseded 2026-07-06 by WaferIQ.
  See `[[crm-evolution]]` memory (marked SHELVED).
- Design-win funnel tracking as the P2 wedge — considered and deferred
  2026-07-09 in favor of POS recon. Not killed; may return as a sibling
  wedge under `domain/design-win-funnel/`.
- Shelved smoke matrix items 5–11 from the computed-fields closeout —
  paused indefinitely, not resuming without user ask.
