import { redirect } from 'next/navigation';

// WaferIQ pivot (2026-07-06): root used to redirect to /territory. That
// route is now flag-gated legacy. Until the P4 results UI ships, land on
// /accounts — the highest-fidelity surface still live. See
// docs/waferiq-pivot.md.
export default function Home() {
  redirect('/accounts');
}
