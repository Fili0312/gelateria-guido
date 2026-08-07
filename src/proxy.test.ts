import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';
import { SESSION_COOKIE_NAME } from '@/server/auth/cookie';
import { createSessionToken } from '@/server/auth/session-token';

const SECRET = 'proxy-test-secret-longer-than-thirty-two-bytes';
let previousSecret: string | undefined;

function request(path: string, cookie?: string) {
  return new NextRequest(`https://example.test/gelateria${path}`, {
    nextConfig: { basePath: '/gelateria' },
    headers: cookie ? { cookie } : undefined,
  });
}

function requestAtBasePath(cookie?: string) {
  return new NextRequest('https://example.test/gelateria', {
    nextConfig: { basePath: '/gelateria' },
    headers: cookie ? { cookie } : undefined,
  });
}

describe('proxy autenticazione', () => {
  before(() => {
    previousSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = SECRET;
  });

  after(() => {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  });

  it('lascia pubblici login e health check', () => {
    assert.equal(proxy(request('/login')).headers.get('x-middleware-next'), '1');
    assert.equal(proxy(request('/api/health')).headers.get('x-middleware-next'), '1');
  });

  it('il matcher reale copre la radice esatta e ignora gli asset Next', () => {
    const nextConfig = { basePath: '/gelateria' };

    assert.equal(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: 'https://example.test/gelateria',
      }),
      true,
    );
    assert.equal(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: 'https://example.test/gelateria/_next/static/app.js',
      }),
      false,
    );
  });

  it('reindirizza una pagina conservando basePath e destinazione', () => {
    const response = proxy(request('/fornitori?pagina=2'));

    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get('location'),
      'https://example.test/gelateria/login?next=%2Ffornitori%3Fpagina%3D2',
    );
  });

  it('reindirizza anche la radice esatta senza duplicare il basePath', () => {
    const response = proxy(requestAtBasePath());

    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), 'https://example.test/gelateria/login?next=%2F');
  });

  it('risponde 401 alle API senza sessione', async () => {
    const response = proxy(request('/api/fornitori'));

    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: false, error: 'Autenticazione richiesta.' });
  });

  it('accetta un token valido e rifiuta quello alterato', () => {
    const token = createSessionToken({ userId: 'u1', organizationId: 'o1' }, SECRET);
    const validCookie = `${SESSION_COOKIE_NAME}=${token}`;
    assert.equal(proxy(request('/fornitori', validCookie)).headers.get('x-middleware-next'), '1');

    const invalidResponse = proxy(request('/fornitori', `${validCookie}x`));
    assert.equal(invalidResponse.status, 307);
    assert.match(invalidResponse.headers.get('set-cookie') ?? '', /Max-Age=0/i);
  });
});
