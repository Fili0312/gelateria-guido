import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { describe, it } from 'node:test';
import {
  calcolaCambio,
  confrontaPerAvviso,
  contenutoConfezioneFotografato,
  type OffertaPerAvviso,
} from './alert';

/**
 * L'avviso «lo trovi a meno da un altro».
 *
 * Il primo blocco è l'esempio che la specifica cita per nome: 10,50 € contro
 * 9,80 €. Se si rompe, si è rotta la funzionalità così com'è stata chiesta.
 */

function offerta(dati: Partial<OffertaPerAvviso> = {}): OffertaPerAvviso {
  return {
    supplierProductId: 'a',
    supplierName: 'Fornitore A',
    prezzoConfezione: '10.50',
    contenutoPerConfezione: '6',
    pezziPerConfezione: 12,
    ...dati,
  };
}

describe('l’esempio della specifica: 10,50 € contro 9,80 €', () => {
  const scelta = offerta();
  const alternativa = offerta({
    supplierProductId: 'b',
    supplierName: 'Fornitore B',
    prezzoConfezione: '9.80',
  });

  it('l’avviso c’è e indica il fornitore giusto', () => {
    const a = confrontaPerAvviso(scelta, [alternativa], 4, { percentuale: 3, euro: 0.3 });
    assert.equal(a?.migliore.supplierName, 'Fornitore B');
  });

  it('si risparmia 0,70 € a confezione', () => {
    const a = confrontaPerAvviso(scelta, [alternativa], 4, { percentuale: 3, euro: 0.3 });
    assert.equal(a?.risparmioPerConfezione.toString(), '0.7');
  });

  it('e 2,80 € sulle quattro confezioni', () => {
    // È il numero della specifica: «€0,70 a confezione (€2,80 su 4)».
    const a = confrontaPerAvviso(scelta, [alternativa], 4, { percentuale: 3, euro: 0.3 });
    assert.equal(a?.risparmioTotale.toString(), '2.8');
  });

  it('supera entrambe le soglie predefinite', () => {
    const a = confrontaPerAvviso(scelta, [alternativa], 4, { percentuale: 3, euro: 0.3 });
    assert.equal(a?.meritaAvviso, true);
  });
});

describe('quando NON si deve avvisare', () => {
  it('sotto la soglia in euro, anche se la percentuale c’è', () => {
    // Il 30% su una bottiglia da mezzo euro è quindici centesimi: riempire
    // l'elenco di queste lo rende inutile proprio quando servirebbe.
    const scelta = offerta({ prezzoConfezione: '0.50', contenutoPerConfezione: '1' });
    const b = offerta({
      supplierProductId: 'b',
      prezzoConfezione: '0.35',
      contenutoPerConfezione: '1',
    });
    const a = confrontaPerAvviso(scelta, [b], 1, { percentuale: 3, euro: 0.3 });
    assert.equal(a?.risparmioPct.gte(30), true);
    assert.equal(a?.meritaAvviso, false);
  });

  it('sotto la soglia percentuale, anche se gli euro ci sono', () => {
    const scelta = offerta({ prezzoConfezione: '100', contenutoPerConfezione: '1' });
    const b = offerta({
      supplierProductId: 'b',
      prezzoConfezione: '99',
      contenutoPerConfezione: '1',
    });
    const a = confrontaPerAvviso(scelta, [b], 1, { percentuale: 3, euro: 0.3 });
    assert.equal(a?.risparmioPerConfezione.toString(), '1');
    assert.equal(a?.meritaAvviso, false);
  });

  it('quella scelta è già la più conveniente: nessun avviso', () => {
    // Non un avviso con risparmio zero: quello è rumore travestito da
    // informazione.
    const scelta = offerta({ prezzoConfezione: '9.00' });
    const b = offerta({ supplierProductId: 'b', prezzoConfezione: '12.00' });
    assert.equal(confrontaPerAvviso(scelta, [b], 1, { percentuale: 0, euro: 0 }), null);
  });

  it('non c’è alternativa', () => {
    assert.equal(confrontaPerAvviso(offerta(), [], 1, { percentuale: 0, euro: 0 }), null);
  });

  it('l’unica alternativa è l’offerta stessa', () => {
    assert.equal(confrontaPerAvviso(offerta(), [offerta()], 1, { percentuale: 0, euro: 0 }), null);
  });
});

describe('il cambio fornitore fra confezioni diverse', () => {
  /**
   * Il criterio della roadmap: «lo swap fra 12 e 24 pezzi mantiene i pezzi
   * totali e lo dichiara». Quattro colli da 12 sono due colli da 24.
   */
  const da12 = offerta({
    pezziPerConfezione: 12,
    contenutoPerConfezione: '6',
    prezzoConfezione: '10.50',
  });
  const da24 = offerta({
    supplierProductId: 'b',
    supplierName: 'Fornitore B',
    pezziPerConfezione: 24,
    contenutoPerConfezione: '12',
    prezzoConfezione: '19.60',
  });

  const cambio = calcolaCambio(da12, da24, 4);

  it('quattro colli da 12 diventano due colli da 24', () => {
    assert.equal(cambio.confezioni, 2);
  });

  it('i pezzi totali restano gli stessi', () => {
    assert.equal(cambio.pezziPrima, 48);
    assert.equal(cambio.pezziDopo, 48);
  });

  it('e lo dichiara, con il conto scritto', () => {
    // Un cambio di quantità fatto in silenzio si scopre alla consegna.
    assert.equal(cambio.descrizione, '4 × 12 = 48 pz → 2 × 24 = 48 pz');
    assert.equal(cambio.esatto, true);
  });

  it('la spesa cambia di conseguenza', () => {
    assert.equal(cambio.spesaPrima.toString(), '42');
    assert.equal(cambio.spesaDopo.toString(), '39.2');
    assert.equal(cambio.risparmio.toString(), '2.8');
  });
});

describe('la vecchia confezione usata nel cambio è quella fotografata', () => {
  it('non cambia quantità se l’anagrafica viva della vecchia offerta è stata modificata', () => {
    // La riga fotografava 12 bottiglie da 33 cl (= 3,96 L). Dopo l'aggiunta
    // il listino vivo potrebbe essere stato corretto a 24 bottiglie: usare
    // quel nuovo valore trasformerebbe erroneamente quattro colli in quattro.
    const contenutoSnapshot = contenutoConfezioneFotografato('33', 'CL', 12);
    const cambio = calcolaCambio(
      offerta({
        pezziPerConfezione: 12,
        contenutoPerConfezione: contenutoSnapshot,
      }),
      offerta({
        supplierProductId: 'b',
        pezziPerConfezione: 24,
        contenutoPerConfezione: '7.92',
      }),
      4,
    );

    assert.equal(contenutoSnapshot.toString(), '3.96');
    assert.equal(cambio.confezioni, 2);
    assert.equal(cambio.pezziPrima, 48);
    assert.equal(cambio.pezziDopo, 48);
  });
});

describe('quando il cambio NON torna esatto', () => {
  it('lo dice invece di arrotondare di nascosto', () => {
    // Tre colli da 12 fanno 36 pezzi: con colli da 24 sarebbero una e mezza.
    // Si arrotonda a due, e si dichiara che la quantità non è la stessa.
    const da12 = offerta({ pezziPerConfezione: 12, contenutoPerConfezione: '6' });
    const da24 = offerta({
      supplierProductId: 'b',
      pezziPerConfezione: 24,
      contenutoPerConfezione: '12',
    });
    const cambio = calcolaCambio(da12, da24, 3);

    assert.equal(cambio.confezioni, 2);
    assert.equal(cambio.esatto, false);
    assert.match(cambio.descrizione, /non è la stessa quantità/);
    assert.equal(cambio.quantitaPrima.toString(), '18');
    assert.equal(cambio.quantitaDopo.toString(), '24');
  });

  it('non scende mai sotto una confezione', () => {
    // Meglio una in più che zero: un ordine di zero confezioni è una riga che
    // il fornitore non sa come evadere.
    const piccola = offerta({ contenutoPerConfezione: '1', pezziPerConfezione: 1 });
    const grande = offerta({
      supplierProductId: 'b',
      contenutoPerConfezione: '24',
      pezziPerConfezione: 24,
    });
    assert.equal(calcolaCambio(piccola, grande, 1).confezioni, 1);
  });
});

describe('lo sconto concordato conta anche nell’avviso', () => {
  // Il caso vero, dal catalogo della gelateria: il succo Amita pesca.
  //
  //   AD Beverage  15,52 € a listino, ma rimborsa il 5% → 14,744 €
  //   Barzetti     14,88 € a listino, nessun rimborso   → 14,880 €
  //
  // A listino conviene Barzetti; contando il rimborso conviene AD Beverage.
  // L'elenco d'ordine ordinava già sull'effettivo e segnava AD Beverage
  // «migliore»; l'avviso del riepilogo confrontava i listini e consigliava di
  // passare a Barzetti «per risparmiare». Seguirlo faceva spendere di più.
  const contenuto = new Decimal('4.8'); // 24 × 20 cl

  const adBeverage = {
    supplierProductId: 'ad',
    supplierName: 'AD Beverage',
    prezzoConfezione: new Decimal('14.744'),
    contenutoPerConfezione: contenuto,
    pezziPerConfezione: 24,
  };
  const barzetti = {
    supplierProductId: 'bz',
    supplierName: 'Barzetti',
    prezzoConfezione: new Decimal('14.88'),
    contenutoPerConfezione: contenuto,
    pezziPerConfezione: 24,
  };

  it('scelto AD Beverage, non consiglia di cambiare', () => {
    const avviso = confrontaPerAvviso(adBeverage, [adBeverage, barzetti], 1, {
      percentuale: 3,
      euro: 0.3,
    });
    assert.equal(avviso, null);
  });

  it('scelto Barzetti, il migliore è AD Beverage', () => {
    const avviso = confrontaPerAvviso(barzetti, [adBeverage, barzetti], 1, {
      percentuale: 0,
      euro: 0,
    });
    assert.equal(avviso?.migliore.supplierName, 'AD Beverage');
  });

  it('sui listini invece direbbe il contrario: è l’errore che si sta evitando', () => {
    const aListino = confrontaPerAvviso(
      { ...adBeverage, prezzoConfezione: new Decimal('15.52') },
      [
        { ...adBeverage, prezzoConfezione: new Decimal('15.52') },
        { ...barzetti, prezzoConfezione: new Decimal('14.88') },
      ],
      1,
      { percentuale: 3, euro: 0.3 },
    );
    assert.equal(aListino?.migliore.supplierName, 'Barzetti');
  });
});
