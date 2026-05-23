import { NextResponse } from 'next/server';

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? process.env.NEXT_PUBLIC_DIRECTUS_URL;

export async function POST(req: Request) {
  if (!DIRECTUS_URL) {
    return NextResponse.json({ error: 'DIRECTUS_URL not configured' }, { status: 500 });
  }

  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const upstream = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, mode: 'session' }),
  });

  if (!upstream.ok) {
    const payload = (await upstream.json().catch(() => null)) as
      | { errors?: Array<{ message?: string }> }
      | null;
    const message = payload?.errors?.[0]?.message ?? 'Invalid credentials';
    return NextResponse.json({ error: message }, { status: upstream.status });
  }

  const res = NextResponse.json({ ok: true });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) res.headers.set('set-cookie', setCookie);
  return res;
}
