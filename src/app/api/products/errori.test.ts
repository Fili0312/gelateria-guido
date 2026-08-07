import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERRORI_CATALOGO } from './errori';

describe('ERRORI_CATALOGO', () => {
  it('tratta una categoria non più disponibile come errore del campo, non come 500', () => {
    const regola = ERRORI_CATALOGO.find((voce) => voce.nome === 'TaxonomyNotFoundError');
    assert.ok(regola);
    assert.equal(regola.status, 400);
    assert.deepEqual(regola.fields?.(new Error('categoria assente')), {
      categoryId: ['La categoria indicata non esiste più.'],
    });
  });
});
