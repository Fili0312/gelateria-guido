import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from './password';

describe('password Argon2id', () => {
  it('genera un hash verificabile senza contenere la password', async () => {
    const password = 'gelato con panna 2026';
    const encodedHash = await hashPassword(password);

    assert.match(encodedHash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(encodedHash.includes(password), false);
    assert.equal(await verifyPassword(password, encodedHash), true);
    assert.equal(await verifyPassword(`${password}!`, encodedHash), false);
  });

  it('rifiuta input vuoti e hash malformati', async () => {
    await assert.rejects(() => hashPassword('breve'), /da 7 a 256/);
    assert.equal(await verifyPassword('', 'non-un-hash'), false);
    assert.equal(await verifyPassword('breve', 'non-un-hash'), false);
    assert.equal(await verifyPassword('password', 'non-un-hash'), false);
  });
});
