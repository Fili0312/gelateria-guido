import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { describe, it } from 'node:test';
import { confezioniValide, totaliOrdine, totaliRiga, type RigaDaSommare } from './totals';

function riga(dati: Partial<RigaDaSommare> = {}): RigaDaSommare {
  return { prezzoConfezione: '4.72', confezioni: 3, aliquotaIva: '22', ...dati };
}

describe('il totale di una riga', () => {
  it('è il prezzo della confezione per il numero di confezioni', () => {
    // L'invariante della fattura: chi controlla rifà questo conto a mano.
    const t = totaliRiga(riga());
    assert.equal(t.netto.toString(), '14.16');
  });

  it('l’IVA si calcola sul netto già arrotondato', () => {
    const t = totaliRiga(riga());
    assert.equal(t.iva.toString(), '3.12');
    assert.equal(t.lordo.toString(), '17.28');
  });

  it('senza aliquota dichiarata l’IVA è zero, non il 22% supposto', () => {
    // Un'aliquota inventata produce un totale credibile e sbagliato — il tipo
    // di errore che nessuno ricontrolla.
    const t = totaliRiga(riga({ aliquotaIva: null }));
    assert.equal(t.iva.toString(), '0');
    assert.equal(t.lordo.toString(), t.netto.toString());
  });

  it('arrotonda all’even, come i netti di listino', () => {
    // 0,125 × 1 = 0,125 → 0,12 (non 0,13): la stessa regola dei listini.
    assert.equal(
      totaliRiga(riga({ prezzoConfezione: '0.125', confezioni: 1 })).netto.toString(),
      '0.12',
    );
    assert.equal(
      totaliRiga(riga({ prezzoConfezione: '0.135', confezioni: 1 })).netto.toString(),
      '0.14',
    );
  });

  it('il prezzo al litro non entra nel conto', () => {
    // Un collo da 24 bottiglie da mezzo litro a 4,72 € costa 4,72 €, non
    // 4,72 × 12. Sembra ovvio finché non si sbaglia campo.
    assert.equal(totaliRiga(riga({ confezioni: 1 })).netto.toString(), '4.72');
  });
});

describe('i totali dell’ordine', () => {
  const righe = [
    riga({ prezzoConfezione: '4.72', confezioni: 3, aliquotaIva: '22' }),
    riga({ prezzoConfezione: '9.72', confezioni: 2, aliquotaIva: '22' }),
    riga({ prezzoConfezione: '17.09', confezioni: 1, aliquotaIva: null }),
  ];
  const t = totaliOrdine(righe);

  it('contano le righe e le confezioni separatamente', () => {
    // «12 prodotti · 37 confezioni» sono due numeri diversi, e la barra li
    // mostra tutti e due perché rispondono a due domande diverse.
    assert.equal(t.righe, 3);
    assert.equal(t.confezioni, 6);
  });

  it('la somma delle righe è il totale, al centesimo', () => {
    // 14,16 + 19,44 + 17,09
    assert.equal(t.netto.toString(), '50.69');
  });

  it('l’IVA somma solo le righe che ce l’hanno', () => {
    // 3,12 + 4,28 + 0
    assert.equal(t.iva.toString(), '7.4');
    assert.equal(t.lordo.toString(), '58.09');
  });

  it('sommando i totali di riga si riottiene il totale dell’ordine', () => {
    // È il controllo che farebbe una persona con la stampa in mano: se questo
    // non torna, la colonna non torna con la sua somma.
    const somma = righe.reduce((acc, r) => acc.plus(totaliRiga(r).netto), new Decimal(0));
    assert.equal(somma.toString(), t.netto.toString());
  });

  it('un ordine vuoto vale zero, non NaN', () => {
    const vuoto = totaliOrdine([]);
    assert.equal(vuoto.netto.toString(), '0');
    assert.equal(vuoto.lordo.toString(), '0');
    assert.equal(vuoto.confezioni, 0);
  });
});

describe('quante confezioni si possono ordinare', () => {
  it('almeno una', () => {
    // Zero non è una quantità: è la rimozione della riga, e va chiesta come
    // rimozione. Una riga a zero è una domanda a cui il fornitore non sa
    // rispondere.
    assert.equal(confezioniValide(0), false);
    assert.equal(confezioniValide(1), true);
  });

  it('intere', () => {
    assert.equal(confezioniValide(1.5), false);
  });

  it('non negative e non assurde', () => {
    assert.equal(confezioniValide(-3), false);
    assert.equal(confezioniValide(10_000), false);
    assert.equal(confezioniValide(9_999), true);
  });
});
