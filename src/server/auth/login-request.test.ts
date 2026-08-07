import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LoginBodyTooLargeError, MAX_LOGIN_BODY_BYTES, readLoginPassword } from './login-request';

describe('corpo della richiesta di login', () => {
  it('legge JSON e form URL-encoded', async () => {
    const json = new Request('https://example.test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'gelato sicuro' }),
    });
    const form = new Request('https://example.test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=gelato+con+panna',
    });

    assert.equal(await readLoginPassword(json), 'gelato sicuro');
    assert.equal(await readLoginPassword(form), 'gelato con panna');
  });

  it('rifiuta contenuti malformati o non supportati', async () => {
    const malformed = new Request('https://example.test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    const text = new Request('https://example.test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'password=gelato',
    });

    assert.equal(await readLoginPassword(malformed), null);
    assert.equal(await readLoginPassword(text), null);
  });

  it('interrompe il body prima di materializzarlo oltre il limite', async () => {
    const declaredTooLarge = new Request('https://example.test/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(MAX_LOGIN_BODY_BYTES + 1),
      },
      body: '{}',
    });
    const streamedTooLarge = new Request('https://example.test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'x'.repeat(MAX_LOGIN_BODY_BYTES) }),
    });

    await assert.rejects(() => readLoginPassword(declaredTooLarge), LoginBodyTooLargeError);
    await assert.rejects(() => readLoginPassword(streamedTooLarge), LoginBodyTooLargeError);
  });
});
