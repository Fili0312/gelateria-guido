import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeBasePath, withBasePath } from './base-path';

describe('base path', () => {
  it('usa /gelateria quando la variabile non e configurata', () => {
    assert.equal(normalizeBasePath(undefined), '/gelateria');
  });

  it('permette di neutralizzare il prefisso in sviluppo', () => {
    assert.equal(normalizeBasePath(''), '');
    assert.equal(normalizeBasePath('/'), '');
    assert.equal(withBasePath('/api/auth/logout', ''), '/api/auth/logout');
  });

  it('normalizza slash iniziale e finale', () => {
    assert.equal(normalizeBasePath('gelateria///'), '/gelateria');
    assert.equal(withBasePath('login', '/gelateria'), '/gelateria/login');
  });
});
