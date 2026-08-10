import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formattaCodiceOrdine, progressivoDi, prossimoCodiceOrdine } from './code';

const NEL_2026 = new Date('2026-08-10T12:00:00Z');

describe('come si scrive un codice', () => {
  it('anno e progressivo a quattro cifre', () => {
    assert.equal(formattaCodiceOrdine(2026, 42), '2026-0042');
    assert.equal(formattaCodiceOrdine(2026, 1), '2026-0001');
  });

  it('oltre le quattro cifre non si tronca', () => {
    // Meglio un codice lungo che due ordini con lo stesso numero.
    assert.equal(formattaCodiceOrdine(2026, 12_345), '2026-12345');
  });
});

describe('il prossimo codice', () => {
  it('il primo dell’anno è 0001', () => {
    assert.equal(prossimoCodiceOrdine([], NEL_2026), '2026-0001');
  });

  it('prende il massimo e aggiunge uno', () => {
    assert.equal(
      prossimoCodiceOrdine(['2026-0001', '2026-0002', '2026-0003'], NEL_2026),
      '2026-0004',
    );
  });

  it('NON conta quanti ce ne sono', () => {
    // Contare darebbe un duplicato appena un ordine viene cancellato, e il
    // duplicato si scoprirebbe quando due PDF arrivano allo stesso fornitore
    // con lo stesso numero sopra.
    assert.equal(prossimoCodiceOrdine(['2026-0001', '2026-0003'], NEL_2026), '2026-0004');
  });

  it('riparte da uno in un anno nuovo', () => {
    assert.equal(prossimoCodiceOrdine(['2025-0042', '2025-0043'], NEL_2026), '2026-0001');
  });

  it('il Capodanno segue Europe/Rome anche se il server è in UTC', () => {
    const mezzanotteItaliana = new Date('2025-12-31T23:30:00.000Z');
    assert.equal(prossimoCodiceOrdine(['2025-0042'], mezzanotteItaliana), '2026-0001');
  });

  it('prima della mezzanotte italiana resta nell’anno precedente', () => {
    const primaDiMezzanotte = new Date('2026-12-31T22:30:00.000Z');
    assert.equal(prossimoCodiceOrdine(['2026-0042'], primaDiMezzanotte), '2026-0043');
  });

  it('ignora i codici di altri anni anche se più alti', () => {
    assert.equal(prossimoCodiceOrdine(['2025-9999', '2026-0002'], NEL_2026), '2026-0003');
  });

  it('ignora quello che non riconosce invece di interpretarlo', () => {
    // Un codice scritto a mano letto come «9999» bloccherebbe la numerazione
    // per sempre: meglio saltarlo.
    assert.equal(
      prossimoCodiceOrdine(['ordine di prova', '2026-A', null, '2026-0007'], NEL_2026),
      '2026-0008',
    );
  });
});

describe('leggere il progressivo', () => {
  it('lo estrae quando l’anno coincide', () => {
    assert.equal(progressivoDi('2026-0042', 2026), 42);
  });

  it('null per un altro anno', () => {
    assert.equal(progressivoDi('2025-0042', 2026), null);
  });

  it('null per zero, che non è un progressivo valido', () => {
    assert.equal(progressivoDi('2026-0000', 2026), null);
  });

  it('null per quello che non è un codice', () => {
    assert.equal(progressivoDi(null, 2026), null);
    assert.equal(progressivoDi('', 2026), null);
    assert.equal(progressivoDi('2026-42', 2026), null);
  });
});
