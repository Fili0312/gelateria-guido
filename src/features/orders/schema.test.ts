import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confermaOrdineSchema } from './schema';

describe('la versione della bozza usata per confermare', () => {
  const valida = {
    orderId: 'cm123ordine',
    updatedAt: '2026-08-10T17:12:34.567Z',
    priceVersion: 'a'.repeat(64),
    note: '  consegnare di mattina  ',
  };

  it('nomina ordine e versione, e normalizza la nota', () => {
    assert.deepEqual(confermaOrdineSchema.parse(valida), {
      orderId: 'cm123ordine',
      updatedAt: '2026-08-10T17:12:34.567Z',
      priceVersion: 'a'.repeat(64),
      note: 'consegnare di mattina',
    });
  });

  it('rifiuta una conferma senza la versione vista nel riepilogo', () => {
    const { updatedAt: _updatedAt, ...senzaVersione } = valida;
    assert.equal(confermaOrdineSchema.safeParse(senzaVersione).success, false);
    assert.equal(confermaOrdineSchema.safeParse({ ...valida, updatedAt: 'ieri' }).success, false);
  });

  it('rifiuta una conferma senza la fotografia dei prezzi vista', () => {
    const { priceVersion: _priceVersion, ...senzaPrezzi } = valida;
    assert.equal(confermaOrdineSchema.safeParse(senzaPrezzi).success, false);
    assert.equal(
      confermaOrdineSchema.safeParse({ ...valida, priceVersion: 'vecchia' }).success,
      false,
    );
  });

  it('rifiuta campi estranei e note oltre il limite', () => {
    assert.equal(confermaOrdineSchema.safeParse({ ...valida, status: 'CONFIRMED' }).success, false);
    assert.equal(
      confermaOrdineSchema.safeParse({ ...valida, note: 'x'.repeat(2_001) }).success,
      false,
    );
  });
});
