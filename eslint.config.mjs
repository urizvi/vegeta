import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Territory-owned internals. membersSlice is intentionally NOT here — it is
// Core (shared identity directory) per the entitlements seam spec.
// ─── Boundary seam documentation ──────────────────────────────────────────────
// The override blocks below forbid DIRECT imports of module-internal store
// slices (e.g. geoSlice, tasksSlice, tasksSelectors).  They intentionally do
// NOT restrict `@/store/territoryStore` (the combined Zustand store) or
// `@/store/selectors` — those are Core-owned aggregation points that any
// module may legitimately use (e.g. Tasks reading `s.members`).  The seam
// enforced here is naming/direct-slice-access discipline, not deep
// store-access discipline.
// ──────────────────────────────────────────────────────────────────────────────
const TERRITORY_INTERNALS = [
  "@/store/slices/geoSlice",
  "@/store/slices/geoSelectionSlice",
  "@/store/slices/regionsSlice",
  "@/store/slices/subregionsSlice",
  "@/store/slices/assignmentsSlice",
  "@/store/slices/teamsSlice",
  "@/store/slices/hierarchyLevelsSlice",
  "@/store/slices/mapUiSlice",
];
const TASKS_INTERNALS = ["@/store/slices/tasksSlice", "@/store/slices/tasksSelectors"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["components/tasks/**/*.{ts,tsx}", "app/tasks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...TERRITORY_INTERNALS.map((p) => ({ group: [p], message: "Tasks must not import Territory internals (Core ← Tasks only)." })),
      ] }],
    },
  },
  {
    files: ["components/territory/**/*.{ts,tsx}", "app/territory/**/*.{ts,tsx}", "components/teams/**/*.{ts,tsx}", "app/teams/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...TASKS_INTERNALS.map((p) => ({ group: [p], message: "Territory must not import Tasks internals (Tasks ⊥ Territory)." })),
      ] }],
    },
  },
  {
    files: ["components/accounts/**/*.{ts,tsx}", "app/accounts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...[...TERRITORY_INTERNALS, ...TASKS_INTERNALS].map((p) => ({ group: [p], message: "Core must not import add-on internals." })),
      ] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
