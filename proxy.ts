import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'directus_session_token';

export function proxy(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/auth|_next|favicon.ico|geo).*)'],
};
