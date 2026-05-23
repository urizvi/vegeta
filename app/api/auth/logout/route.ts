import { NextResponse } from 'next/server';

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? process.env.NEXT_PUBLIC_DIRECTUS_URL;

export async function POST(req: Request) {
  if (!DIRECTUS_URL) {
    return NextResponse.json({ error: 'DIRECTUS_URL not configured' }, { status: 500 });
  }

  const cookie = req.headers.get('cookie') ?? '';
  const upstream = await fetch(`${DIRECTUS_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ mode: 'session' }),
  });

  const res = NextResponse.json({ ok: true });
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) res.headers.set('set-cookie', setCookie);
  return res;
}
