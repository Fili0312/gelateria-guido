import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prezzoAllaData, prezzoCorrente, prezzoStantio, serieStorica, variazione } from './history';

/**
 * Lo storico dell'esempio del punto 4 della specifica:
 *
 *   Birra XYZ   01/05 -> 9,50   01/06 -> 9,80   01/07 -> 10,20
 */
const STORICO_BIRRA = [
  { priceNet: '9.50', validFrom: '2026-05-01', validTo: '2026-06-01' },
  { priceNet: '9.80', validFrom: '2026-06-01', validTo: '2026-07-01' },
  { priceNet: '10.20', validFrom: '2026-07-01', validTo: null },
];

describe('variazione', () => {
  it('calcola assoluta e percentuale sull esempio della specifica', () => {
    const v = variazione('9.80', '10.20');
    assert.equal(v.assoluta.toFixed(2), '0.40');
    assert.equal(v.percentuale.toFixed(2), '4.08');
    assert.equal(v.direzione, 'AUMENTO');
  });

  it('la percentuale e riferita al prezzo precedente, non al nuovo', () => {
    // Da 9,80 a 10,20 sono +4,08%, non +3,92%.
    assert.equal(variazione('9.80', '10.20').percentuale.toFixed(2), '4.08');
  });

  it('riconosce una diminuzione', () => {
    const v = variazione('10.20', '9.80');
    assert.equal(v.direzione, 'DIMINUZIONE');
    assert.equal(v.percentuale.toFixed(2), '-3.92');
  });

  it('riconosce un prezzo invariato', () => {
    assert.equal(variazione('9.80', '9.80').direzione, 'INVARIATO');
  });

  it('non esplode su un prezzo precedente a zero', () => {
    assert.equal(variazione('0', '5').percentuale.toFixed(2), '0.00');
  });
});

describe('serieStorica', () => {
  it('produce la tabella del punto 4 della specifica', () => {
    const serie = serieStorica(STORICO_BIRRA);
    assert.equal(serie.length, 3);

    assert.equal(serie[0]!.da, '2026-05-01');
    assert.equal(serie[0]!.variazione, null, 'il primo prezzo non ha un precedente');

    assert.equal(serie[1]!.prezzo.toFixed(2), '9.80');
    assert.equal(serie[1]!.variazione?.percentuale.toFixed(2), '3.16');

    assert.equal(serie[2]!.prezzo.toFixed(2), '10.20');
    assert.equal(serie[2]!.variazione?.percentuale.toFixed(2), '4.08');
    assert.equal(serie[2]!.variazione?.direzione, 'AUMENTO');
  });

  it('ordina per data anche se lo storico arriva mescolato', () => {
    const serie = serieStorica([STORICO_BIRRA[2]!, STORICO_BIRRA[0]!, STORICO_BIRRA[1]!]);
    assert.deepEqual(
      serie.map((p) => p.da),
      ['2026-05-01', '2026-06-01', '2026-07-01'],
    );
  });
});

describe('prezzoAllaData — rileggere un ordine vecchio', () => {
  it('a meta giugno valeva 9,80', () => {
    assert.equal(prezzoAllaData(STORICO_BIRRA, '2026-06-15')?.priceNet, '9.80');
  });

  it('il giorno di stacco appartiene al prezzo nuovo', () => {
    assert.equal(prezzoAllaData(STORICO_BIRRA, '2026-06-01')?.priceNet, '9.80');
    assert.equal(prezzoAllaData(STORICO_BIRRA, '2026-05-31')?.priceNet, '9.50');
  });

  it('oggi vale il prezzo aperto', () => {
    assert.equal(prezzoAllaData(STORICO_BIRRA, '2026-08-07')?.priceNet, '10.20');
  });

  it('prima del primo listino non c era prezzo', () => {
    assert.equal(prezzoAllaData(STORICO_BIRRA, '2026-04-01'), null);
  });

  it('accetta anche un oggetto Date', () => {
    assert.equal(prezzoAllaData(STORICO_BIRRA, new Date('2026-06-15T10:00:00Z'))?.priceNet, '9.80');
  });
});

describe('prezzoCorrente', () => {
  it('e quello senza data di fine', () => {
    assert.equal(prezzoCorrente(STORICO_BIRRA)?.priceNet, '10.20');
  });

  it('non esiste se sono tutti chiusi (prodotto sparito)', () => {
    const chiusi = STORICO_BIRRA.map((r) => ({ ...r, validTo: r.validTo ?? '2026-08-01' }));
    assert.equal(prezzoCorrente(chiusi), null);
  });
});

describe('prezzoStantio', () => {
  it('un listino di sei mesi fa e fermo, con soglia a sei mesi', () => {
    // I listini Cecconi in mano alla gelateria sono di febbraio 2025.
    assert.equal(prezzoStantio('2025-02-28', '2026-08-07', 6), true);
  });

  it('un listino di ieri no', () => {
    assert.equal(prezzoStantio('2026-08-06', '2026-08-07', 6), false);
  });
});
