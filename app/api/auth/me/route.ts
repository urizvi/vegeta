import { NextResponse } from 'next/server';

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? process.env.NEXT_PUBLIC_DIRECTUS_URL;

export async function GET(req: Request) {
  if (!DIRECTUS_URL) {
    return NextResponse.json({ error: 'DIRECTUS_URL not configured' }, { status: 500 });
  }

  const cookie = req.headers.get('cookie') ?? '';
  const upstream = await fetch(`${DIRECTUS_URL}/users/me?fields=id,email,first_name,last_name,role`, {
    headers: { cookie },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const payload = (await upstream.json().catch(() => null)) as { data?: unknown } | null;
  return NextResponse.json({ user: payload?.data ?? null });
}
