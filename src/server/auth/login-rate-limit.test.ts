import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearLoginAttempts,
  consumeLoginAttempt,
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_ATTEMPT_WINDOW_MS,
  loginClientKey,
} from './login-rate-limit';

describe('limite tentativi login', () => {
  it('blocca dopo il numero previsto e comunica quando riprovare', () => {
    const store = new Map();
    for (let attempt = 0; attempt < LOGIN_ATTEMPT_LIMIT; attempt += 1) {
      assert.equal(consumeLoginAttempt('127.0.0.1', 1_000, store).allowed, true);
    }

    assert.deepEqual(consumeLoginAttempt('127.0.0.1', 1_000, store), {
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it('riapre la finestra col tempo e si azzera dopo un successo', () => {
    const store = new Map();
    consumeLoginAttempt('127.0.0.1', 1_000, store);
    assert.equal(
      consumeLoginAttempt('127.0.0.1', 1_000 + LOGIN_ATTEMPT_WINDOW_MS, store).allowed,
      true,
    );

    clearLoginAttempts('127.0.0.1', store);
    assert.equal(store.size, 0);
  });

  it('usa solo l’indirizzo impostato dal reverse proxy e limita valori anomali', () => {
    assert.equal(loginClientKey(new Headers({ 'X-Real-IP': '192.0.2.10' })), '192.0.2.10');
    assert.equal(
      loginClientKey(new Headers({ 'X-Forwarded-For': '198.51.100.2' })),
      'connessione-diretta',
    );
    assert.equal(
      loginClientKey(new Headers({ 'X-Real-IP': 'x'.repeat(65) })),
      'connessione-diretta',
    );
  });
});
