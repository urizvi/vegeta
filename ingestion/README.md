# ingestion/

WaferIQ P1 — wedge-agnostic data intake.

Owns everything from raw file drop → validated canonical dataset:

- CSV / XLSX parsing (SheetJS)
- Column-mapping layer (configurable per source; distributor POS files and
  design-win exports both ship with inconsistent headers)
- Row-level validation + user-facing error surfacing
- Canonical internal model (adaptable until P2 locks the wedge)
- Persistence into the Zustand store

Empty on purpose — start filling in P1.
