import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthConfigurationError, getSessionSecret } from '@/server/auth/config';
import { clearSessionCookie, SESSION_COOKIE_NAME } from '@/server/auth/cookie';
import { verifySessionToken } from '@/server/auth/session-token';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout', '/api/health']);

function normalizedPathname(request: NextRequest): string {
  const pathname = request.nextUrl.pathname.replace(/\/+$/, '');
  return pathname || '/';
}

function unauthenticatedResponse(request: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, error: 'Autenticazione richiesta.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  const requestedPath = `${pathname}${request.nextUrl.search}`;
  // Conserviamo anche `/`: oltre a rendere esplicita la destinazione, evita
  // che Next normalizzi due volte il basePath quando la richiesta iniziale e'
  // esattamente `/gelateria` (senza slash finale).
  loginUrl.searchParams.set('next', requestedPath);
  return NextResponse.redirect(loginUrl);
}

/**
 * Controllo ottimistico: valida firma e scadenza senza interrogare Postgres.
 * Le route e i Server Component usano poi getCurrentUser() per verificare che
 * l'utente esista ancora e sia attivo.
 */
export function proxy(request: NextRequest) {
  const pathname = normalizedPathname(request);
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let authenticated = false;
  if (token) {
    try {
      authenticated = verifySessionToken(token, getSessionSecret()) !== null;
    } catch (error) {
      if (!(error instanceof AuthConfigurationError)) throw error;
    }
  }

  if (authenticated) return NextResponse.next();

  const response = unauthenticatedResponse(request, pathname);
  if (token) clearSessionCookie(response);
  return response;
}

export const config = {
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
