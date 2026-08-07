import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextResponse } from 'next/server';
import { clearSessionCookie, SESSION_COOKIE_NAME, setSessionCookie } from './cookie';

describe('cookie di sessione', () => {
  it('imposta gli attributi di sicurezza e una durata persistente', () => {
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, 'token-finto');
    const header = response.headers.get('set-cookie') ?? '';

    assert.match(header, new RegExp(`^${SESSION_COOKIE_NAME}=token-finto`));
    assert.match(header, /HttpOnly/i);
    assert.match(header, /Secure/i);
    assert.match(header, /SameSite=Lax/i);
    assert.match(header, /Max-Age=604800/i);
  });

  it('lo elimina usando gli stessi attributi', () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    const header = response.headers.get('set-cookie') ?? '';

    assert.match(header, new RegExp(`^${SESSION_COOKIE_NAME}=`));
    assert.match(header, /Max-Age=0/i);
    assert.match(header, /HttpOnly/i);
    assert.match(header, /Secure/i);
    assert.match(header, /SameSite=Lax/i);
  });
});
