import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERRORI_PREZZI } from './[id]/prices/errori';

describe('ERRORI_PREZZI', () => {
  it('non trasforma gli errori attesi dello storico in errori interni', () => {
    assert.equal(
      ERRORI_PREZZI.find((voce) => voce.nome === 'PriceHistoryNotFoundError')?.status,
      404,
    );
  });

  it('inoltra gli errori di validazione associati ai campi', () => {
    const regola = ERRORI_PREZZI.find((voce) => voce.nome === 'PriceHistoryValidationError');
    assert.ok(regola);

    const errore = Object.assign(new Error('Prezzo non valido.'), {
      fields: { priceList: ['Il prezzo deve essere maggiore di zero.'] },
    });
    assert.deepEqual(regola.fields?.(errore), errore.fields);
  });
});
