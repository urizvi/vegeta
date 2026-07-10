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
  distribution bar + filters + drill-down + CSV/XLSX export. Top nav in
  `RootLayout`. `ReconRunner` on `/ingest` shrunk to a nudge.
- [x] **P5 — design-partner hardening infrastructure.** Local
  persistence via zustand `persist` + size-guarded storage adapter.
  Usage counters (visit-days, recon runs, exports, dataset imports)
  persisted in a `usageSlice`. `HealthPanel` on `/recon` surfaces the
  return-rate metric. Pricing-gate seam via `checkGate`/`useGate` +
  `ExportButtons` consumer. Onboarding card on `/ingest` with "Load
  sample data" button; three sample CSVs in `public/sample/`. Large-
  file warning (>10 MB) and clearer parse-error UI.
- [x] **Home page at `/`.** State-aware landing (empty → sample loader,
  intermediate → next-step CTA, results → dashboard link). Snapshot
  grid, "What is WaferIQ" details, `HealthPanel`. Nav gets a Home link
  ahead of Ingest / Recon. Sample-data loader extracted to
  `lib/loadSampleData.ts` so both `/` and `/ingest` share it.

## Next

- [ ] **Manual browser verification of the whole chain.** Drop a real
  POS file, drop a claims file, map both, hit Reconcile on `/recon`,
  filter/drill-down/export. The plan's under-10-minute-unaided
  done-when. Now that persistence is live, this can be verified across
  refreshes too.
- [ ] **First partner conversation.** The plan's real P5 done-when is
  "1–2 partners use it weekly on live data and you can measure whether
  they return." The infrastructure is here; this item is the actual
  partner outreach + onboarding.

## Deferred to when we can wire it

- [ ] **Real partner data as engine fixtures.** P3 tests are synthetic
  and cover every flag kind, but the plan calls for anonymized partner
  data. Do this alongside the first discovery conversation that
  produces real files.
- [ ] **AgentMatcher.** `Matcher` interface exists; a Claude
  Agent SDK-backed implementation of `customerScore` / `partScore`
  slots in without touching engine code. Blocked on wiring API keys
  and picking a matching prompt.
- [ ] **Server-side analytics beacon.** Local usage counters are
  self-visible for the partner but not visible to us. Needs a small
  backend endpoint + a periodic beacon. Blocked on picking a hosting
  target for the backend.
- [ ] **Lightweight auth.** Same story — needs a backend. Local
  persistence covers durability for a single-user browser; multi-user
  or workspace-level auth is separate.
- [ ] **Large-file virtualization.** Column-mapping table + results
  table both render every row. Fine at a few thousand; punt on
  virtualization until someone brings a file that hurts.
- [ ] **Real pricing tier plumbing.** `checkGate` returns true for
  everything today. When tiers exist, they hook into that function —
  probably driven by a workspace-scoped entitlement fetched from the
  backend (needs backend).

## Anti-list (rejected / shelved — don't accidentally revive)

- The CRM evolution roadmap (Phases 2–4: decouple jargon, CRM
  primitives, onboarding polish). Superseded 2026-07-06 by WaferIQ.
  See `[[crm-evolution]]` memory (marked SHELVED).
- Design-win funnel tracking as the P2 wedge — considered and deferred
  2026-07-09 in favor of POS recon. Not killed; may return as a sibling
  wedge under `domain/design-win-funnel/`.
- Shelved smoke matrix items 5–11 from the computed-fields closeout —
  paused indefinitely, not resuming without user ask.
