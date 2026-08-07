import type { NextResponse } from 'next/server';
import { normalizeBasePath } from '@/server/base-path';
import { SESSION_DURATION_SECONDS } from './session-token';

export const SESSION_COOKIE_NAME = 'gelateria_session';

function cookiePath(): string {
  return normalizeBasePath(process.env.NEXT_BASE_PATH) || '/';
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: cookiePath(),
    maxAge: SESSION_DURATION_SECONDS,
    priority: 'high',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: cookiePath(),
    maxAge: 0,
    expires: new Date(0),
    priority: 'high',
  });
}
