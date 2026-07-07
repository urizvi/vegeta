import { redirect } from 'next/navigation';

// WaferIQ pivot: root lands on the ingestion surface (P1). Was /accounts
// as a P0 placeholder; now that /ingest is the wedge-agnostic entry
// point, redirect there. Will move to the P4 results view when it ships.
export default function Home() {
  redirect('/ingest');
}
