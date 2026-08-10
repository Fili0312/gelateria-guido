import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERRORI_ORDINE } from './errori';

describe('gli errori attesi dell’ordine', () => {
  it('una versione superata è un conflitto, non un errore interno', () => {
    assert.deepEqual(
      ERRORI_ORDINE.find((errore) => errore.nome === 'OrderVersionError'),
      { nome: 'OrderVersionError', status: 409 },
    );
  });

  it('rigenerare documenti di un ordine annullato è un conflitto', () => {
    assert.deepEqual(
      ERRORI_ORDINE.find((errore) => errore.nome === 'DocumentiConflictError'),
      { nome: 'DocumentiConflictError', status: 409 },
    );
  });
});
