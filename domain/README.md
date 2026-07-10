# domain/

WaferIQ P2+ — wedge-locked entities and core engine logic.

Populated once discovery names the wedge:

- **If POS / sell-through recon:** POS records, ship-and-debit claims,
  price-protection claims, reconciliation results, discrepancy flags,
  matching + tolerance rules.
- **If design-win funnel:** design-win records with stage (DIN/DWIN/DC),
  stage transitions, expected revenue, stall / at-risk detection,
  conversion math.

Claude Agent SDK integration (fuzzy column mapping, entity matching)
lives here as an isolated, swappable module.

Empty on purpose — do not populate before P2.
