import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scegliPrezzoDaMostrare, type OffertaPerCatalogo } from './catalog-price';

/**
 * La scelta del prezzo da mostrare in catalogo.
 *
 * Il caso che conta è il terzo: due offerte i cui netti si ordinano al
 * contrario dei prezzi unitari. È lì che «il più basso» sbaglia, ed è la
 * ragione per cui questa funzione esiste.
 */

function offerta(dati: Partial<OffertaPerCatalogo> = {}): OffertaPerCatalogo {
  return {
    id: 'o-1',
    attiva: true,
    prezzoNetto: '9.00',
    contenutoPerConfezione: '6',
    base: 'L',
    confezioneCerta: true,
    ...dati,
  };
}

describe('senza prezzi non si inventa niente', () => {
  it('nessuna offerta', () => {
    assert.equal(scegliPrezzoDaMostrare([]), null);
  });

  it('offerte senza prezzo corrente', () => {
    assert.equal(scegliPrezzoDaMostrare([offerta({ prezzoNetto: null })]), null);
  });

  it('un’offerta disattivata non è il prezzo del prodotto', () => {
    // Resta a storico, ma proporla significherebbe indicare un fornitore che
    // non lo vende più.
    assert.equal(scegliPrezzoDaMostrare([offerta({ attiva: false })]), null);
  });
});

describe('una sola offerta', () => {
  it('si mostra, ma non è un confronto', () => {
    const scelta = scegliPrezzoDaMostrare([offerta()]);
    assert.equal(scelta?.id, 'o-1');
    assert.equal(scelta?.conPrezzo, 1);
    assert.equal(scelta?.confrontato, false);
    assert.equal(scelta?.risparmioPct, null);
  });

  it('anche se la confezione non è dichiarata', () => {
    // Il prezzo è scritto sul listino: mostrare «—» farebbe pensare che manchi.
    const scelta = scegliPrezzoDaMostrare([offerta({ confezioneCerta: false })]);
    assert.equal(scelta?.id, 'o-1');
    assert.equal(scelta?.confrontato, false);
  });
});

describe('il netto più basso non è il prezzo migliore', () => {
  /**
   * 9 euro per 12 bottiglie da mezzo litro (6 L) contro 16 euro per 24 (12 L):
   * guardando i netti vince il primo, guardando il prezzo al litro vince il
   * secondo — 1,50 contro 1,33 €/L.
   */
  const offerte = [
    offerta({ id: 'piccola', prezzoNetto: '9.00', contenutoPerConfezione: '6' }),
    offerta({ id: 'grande', prezzoNetto: '16.00', contenutoPerConfezione: '12' }),
  ];

  it('vince quella col prezzo unitario più basso, non col netto più basso', () => {
    const scelta = scegliPrezzoDaMostrare(offerte);
    assert.equal(scelta?.id, 'grande');
  });

  it('ed è dichiarata come confronto vero', () => {
    assert.equal(scegliPrezzoDaMostrare(offerte)?.confrontato, true);
  });

  it('col risparmio rispetto alla più cara', () => {
    // (1,50 − 1,333…) / 1,50 = 11,1%
    assert.equal(scegliPrezzoDaMostrare(offerte)?.risparmioPct?.toString(), '11.1');
  });
});

describe('offerte non confrontabili', () => {
  it('kg contro litri: si mostra un prezzo, ma non è una classifica', () => {
    // Servirebbe una densità che non abbiamo: il risultato sarebbe plausibile
    // e falso.
    const scelta = scegliPrezzoDaMostrare([
      offerta({ id: 'a-litri', base: 'L' }),
      offerta({ id: 'a-chili', base: 'KG', prezzoNetto: '4.00' }),
    ]);
    assert.equal(scelta?.confrontato, false);
    assert.equal(scelta?.conPrezzo, 2);
    assert.equal(scelta?.risparmioPct, null);
  });

  it('e non si sceglie il netto più basso', () => {
    // Sarebbe una convenienza che nessuno ha verificato: si prende la prima
    // in ordine di fornitore, che è deterministica e non suggerisce nulla.
    const scelta = scegliPrezzoDaMostrare([
      offerta({ id: 'a-litri', prezzoNetto: '9.00', base: 'L' }),
      offerta({ id: 'a-chili', prezzoNetto: '4.00', base: 'KG' }),
    ]);
    assert.equal(scelta?.id, 'a-litri');
  });

  it('tutte con la confezione ignota: nessun confronto', () => {
    const scelta = scegliPrezzoDaMostrare([
      offerta({ id: 'x', confezioneCerta: false }),
      offerta({ id: 'y', confezioneCerta: false, prezzoNetto: '7.00' }),
    ]);
    assert.equal(scelta?.confrontato, false);
    assert.equal(scelta?.id, 'x');
  });
});

describe('confronto parziale', () => {
  it('con un’offerta esclusa la scelta resta vera ma non si dichiara confronto', () => {
    // Il confronto è avvenuto solo fra due delle tre: dire «la migliore»
    // sarebbe più di quello che si sa.
    const scelta = scegliPrezzoDaMostrare([
      offerta({ id: 'certa-1', prezzoNetto: '9.00', contenutoPerConfezione: '6' }),
      offerta({ id: 'certa-2', prezzoNetto: '16.00', contenutoPerConfezione: '12' }),
      offerta({ id: 'ignota', prezzoNetto: '1.00', confezioneCerta: false }),
    ]);
    assert.equal(scelta?.id, 'certa-2');
    assert.equal(scelta?.confrontato, false);
    assert.equal(scelta?.conPrezzo, 3);
  });
});
