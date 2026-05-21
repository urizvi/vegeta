# field_definitions: new columns (2026-05-19)

Added to support the Computed Fields feature (`docs/superpowers/specs/2026-05-19-computed-fields-design.md`):

- `output_type` (string, nullable, dropdown: number | text | boolean)
- `formula_source` (text, nullable)
- `formula_form` (JSON, nullable)
- `formula_ast` (JSON, nullable)

All four are nullable so existing non-computed rows are unaffected. Mappers in `lib/directus-mappers.ts` round-trip them.
