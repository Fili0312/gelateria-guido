import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { describe, it } from 'node:test';
import { normalizzaPrezzoIva } from '@/server/domain/pricing/vat';
import { riconcilia, riepiloga, type OffertaACatalogo, type RigaDelFile } from './reconcile';

/**
 * La regola di riconciliazione, sui casi che la specifica chiama per nome.
 *
 * Ogni test qui corrisponde a un criterio della Fase 10: è la logica che
 * decide se il catalogo resta pulito, e la si prova su casi costruiti a mano
 * perché su dati veri non si può mai far succedere apposta il caso che serve.
 */

function aCatalogo(dati: Partial<OffertaACatalogo> = {}): OffertaACatalogo {
  return {
    supplierProductId: 'sp-1',
    supplierCode: '20561',
    unitaDiVendita: 'CO',
    packQuantity: 24,
    unitSize: new Decimal('50'),
    unitOfMeasure: 'CL',
    prezzoNetto: new Decimal('4.72'),
    active: true,
    ...dati,
  };
}

function nelFile(dati: Partial<RigaDelFile> = {}): RigaDelFile {
  return {
    chiave: 'r-1',
    supplierCode: '20561',
    unitaDiVendita: 'CO',
    packQuantity: 24,
    unitSize: new Decimal('50'),
    unitOfMeasure: 'CL',
    prezzoNetto: new Decimal('4.90'),
    inclusa: true,
    ...dati,
  };
}

describe('prodotto identico: si aggiorna solo il prezzo', () => {
  const [c] = riconcilia([aCatalogo()], [nelFile()]);

  it('l’esito è un aggiornamento di prezzo, non una creazione', () => {
    assert.equal(c?.esito, 'PREZZO_AGGIORNATO');
    assert.equal(c?.supplierProductId, 'sp-1');
  });

  it('porta con sé il prima e il dopo, e la variazione', () => {
    assert.equal(c?.prezzoPrima?.toString(), '4.72');
    assert.equal(c?.prezzoDopo?.toString(), '4.9');
    assert.equal(c?.variazionePct?.toString(), '3.81');
  });
});

describe('prezzo invariato: non si scrive niente', () => {
  it('l’esito è INVARIATO', () => {
    // Uno storico pieno di righe uguali non racconta niente e rende
    // illeggibile il grafico.
    const [c] = riconcilia([aCatalogo()], [nelFile({ prezzoNetto: new Decimal('4.72') })]);
    assert.equal(c?.esito, 'INVARIATO');
  });
});

describe('stesso codice ma confezione diversa: NON si decide da soli', () => {
  it('finisce in revisione, con scritto cosa è cambiato', () => {
    // È il ramo delicato: aggiornare in silenzio farebbe sembrare un
    // dimezzamento di prezzo quello che è un dimezzamento di confezione.
    const [c] = riconcilia([aCatalogo({ packQuantity: 24 })], [nelFile({ packQuantity: 12 })]);
    assert.equal(c?.esito, 'CONFEZIONE_CAMBIATA');
    assert.deepEqual(c?.differenze, ['pezzi per confezione: 24 → 12']);
  });

  it('vale anche quando cambia il formato', () => {
    const [c] = riconcilia([aCatalogo()], [nelFile({ unitSize: new Decimal('33') })]);
    assert.equal(c?.esito, 'CONFEZIONE_CAMBIATA');
    assert.match(c!.differenze[0]!, /formato/);
  });

  it('e quando cambia l’unità di vendita', () => {
    const [c] = riconcilia(
      [aCatalogo({ unitaDiVendita: 'CO' })],
      [nelFile({ unitaDiVendita: 'BT' })],
    );
    assert.equal(c?.esito, 'CONFEZIONE_CAMBIATA');
    assert.match(c!.differenze[0]!, /unità di vendita/);
  });
});

describe('codice mai visto: prodotto nuovo', () => {
  it('non si aggancia a niente', () => {
    const [c] = riconcilia([aCatalogo()], [nelFile({ supplierCode: 'NUOVO1', chiave: 'r-2' })]);
    // La riga nuova più lo «sparito» del vecchio: due confronti.
    assert.equal(c?.esito, 'NUOVO');
    assert.equal(c?.supplierProductId, null);
  });

  it('un codice scritto con maiuscole diverse è lo stesso codice', () => {
    // «ap112» e «AP112» sono lo stesso articolo: trattarli come due
    // creerebbe un duplicato a ogni import.
    const [c] = riconcilia(
      [aCatalogo({ supplierCode: 'ap112' })],
      [nelFile({ supplierCode: 'AP112' })],
    );
    assert.equal(c?.esito, 'PREZZO_AGGIORNATO');
  });
});

describe('prodotto sparito dal listino', () => {
  it('viene segnalato, non cancellato', () => {
    const confronti = riconcilia([aCatalogo()], []);
    assert.equal(confronti.length, 1);
    assert.equal(confronti[0]?.esito, 'SPARITO');
    assert.equal(confronti[0]?.supplierProductId, 'sp-1');
  });

  it('un’offerta già disattivata non risparisce ogni volta', () => {
    assert.deepEqual(riconcilia([aCatalogo({ active: false })], []), []);
  });

  it('una riga ESCLUSA dall’operatore non fa sparire il prodotto', () => {
    // «non l'ho importata» non è «non c'è più nel listino»: confonderle
    // disattiverebbe prodotti che il fornitore vende ancora.
    const confronti = riconcilia([aCatalogo()], [nelFile({ inclusa: false })]);
    assert.deepEqual(confronti, []);
  });
});

describe('il perimetro: due coperture dello stesso fornitore', () => {
  it('quello che non è nel perimetro non risulta sparito', () => {
    // Chi chiama passa solo le offerte di quella copertura: è lì che il
    // perimetro viene imposto, ed è la ragione per cui la copertura esiste.
    // Caricando «vini», i liquori non entrano nemmeno nel confronto.
    const soloVini = [aCatalogo({ supplierProductId: 'vino-1', supplierCode: 'V1' })];
    const confronti = riconcilia(soloVini, [nelFile({ supplierCode: 'V1' })]);
    assert.equal(confronti.length, 1);
    assert.equal(confronti[0]?.esito, 'PREZZO_AGGIORNATO');
  });
});

describe('importare due volte lo stesso listino', () => {
  it('la seconda volta è tutto invariato', () => {
    const catalogo = [aCatalogo({ prezzoNetto: new Decimal('4.90') })];
    const confronti = riconcilia(catalogo, [nelFile()]);
    assert.equal(confronti.length, 1);
    assert.equal(confronti[0]?.esito, 'INVARIATO');
  });

  it('un listino lordo identico resta INVARIATO dopo lo scorporo a scrittura', () => {
    // Il primo import ha memorizzato l'imponibile canonico 10. Il secondo PDF
    // riporta ancora 12,20 IVA inclusa: confrontare il raw darebbe un falso
    // +22%, mentre la stessa normalizzazione della scrittura deve dare 10.
    const imponibile = normalizzaPrezzoIva({
      prezzoQuotato: '12.20',
      originePrezzo: 'PRICE_LIST',
      pricesIncludeVat: true,
      aliquotaOrganizzazione: 22,
    }).prezzoNetto;
    const [confronto] = riconcilia(
      [aCatalogo({ prezzoNetto: new Decimal('10') })],
      [nelFile({ prezzoNetto: imponibile })],
    );
    assert.equal(confronto?.esito, 'INVARIATO');
  });

  it('riconosce al secondo import una riga Barzelli senza codice tramite impronta', () => {
    const fingerprint = 'barzelli-caffe-moka-1l';
    const confronti = riconcilia(
      [
        aCatalogo({
          supplierCode: null,
          fingerprint,
          prezzoNetto: new Decimal('12.50'),
        }),
      ],
      [
        nelFile({
          supplierCode: null,
          fingerprint,
          prezzoNetto: new Decimal('12.50'),
        }),
      ],
    );
    assert.equal(confronti.length, 1);
    assert.equal(confronti[0]?.esito, 'INVARIATO');
    assert.equal(confronti[0]?.supplierProductId, 'sp-1');
  });

  it('una variazione prezzo senza codice aggiorna la stessa offerta', () => {
    const fingerprint = 'barzelli-caffe-moka-1l';
    const confronti = riconcilia(
      [aCatalogo({ supplierCode: null, fingerprint })],
      [nelFile({ supplierCode: null, fingerprint })],
    );
    assert.deepEqual(
      confronti.map((confronto) => confronto.esito),
      ['PREZZO_AGGIORNATO'],
    );
  });
});

describe('riepiloga', () => {
  const confronti = riconcilia(
    [
      aCatalogo({ supplierProductId: 'a', supplierCode: 'A', prezzoNetto: new Decimal('10') }),
      aCatalogo({ supplierProductId: 'b', supplierCode: 'B', prezzoNetto: new Decimal('10') }),
      aCatalogo({ supplierProductId: 'c', supplierCode: 'C', prezzoNetto: new Decimal('10') }),
      aCatalogo({ supplierProductId: 'd', supplierCode: 'D', prezzoNetto: new Decimal('10') }),
    ],
    [
      nelFile({ chiave: '1', supplierCode: 'A', prezzoNetto: new Decimal('11') }),
      nelFile({ chiave: '2', supplierCode: 'B', prezzoNetto: new Decimal('9') }),
      nelFile({ chiave: '3', supplierCode: 'C', prezzoNetto: new Decimal('10') }),
      nelFile({ chiave: '4', supplierCode: 'E' }),
      nelFile({ chiave: '5', supplierCode: 'D', prezzoNetto: new Decimal('30') }),
    ],
  );
  const r = riepiloga(confronti);

  it('conta ogni esito', () => {
    assert.equal(r.aggiornati, 3);
    assert.equal(r.invariati, 1);
    assert.equal(r.nuovi, 1);
    assert.equal(r.spariti, 0);
  });

  it('distingue aumenti e diminuzioni', () => {
    assert.equal(r.aumentati, 2);
    assert.equal(r.diminuiti, 1);
  });

  it('segnala le variazioni anomale, che vanno guardate prima di applicare', () => {
    // Da 10 a 30 è +200%: quasi sempre è una colonna letta male, non un
    // aumento vero.
    assert.equal(r.anomale, 1);
  });
});

describe('lo stesso codice due volte nello stesso file', () => {
  /**
   * Succede davvero: il preventivo Barzelli elenca «SC204 angostura BITTER
   * 0.200» due volte. Senza il controllo si creavano due offerte identiche
   * dello stesso fornitore, e l'import si schiantava sull'unicita'
   * dell'impronta — o peggio, se fosse passato, le due si sarebbero
   * confrontate fra loro come se fossero di fornitori diversi.
   */
  const confronti = riconcilia(
    [],
    [
      nelFile({ chiave: 'a', supplierCode: 'SC204' }),
      nelFile({ chiave: 'b', supplierCode: 'SC204' }),
    ],
  );

  it('la prima si crea, la seconda viene dichiarata duplicata', () => {
    assert.equal(confronti[0]?.esito, 'NUOVO');
    assert.equal(confronti[1]?.esito, 'DUPLICATO');
  });

  it('e il motivo si può mostrare', () => {
    assert.match(confronti[1]!.differenze[0]!, /compare più volte/);
  });

  it('il riepilogo le conta a parte', () => {
    const r = riepiloga(confronti);
    assert.equal(r.nuovi, 1);
    assert.equal(r.duplicati, 1);
  });
});

describe('la stessa riga senza codice due volte nello stesso file', () => {
  it('usa l’impronta anche per impedire duplicati', () => {
    const confronti = riconcilia(
      [],
      [
        nelFile({ chiave: 'a', supplierCode: null, fingerprint: 'senza-codice' }),
        nelFile({ chiave: 'b', supplierCode: null, fingerprint: 'senza-codice' }),
      ],
    );
    assert.equal(confronti[0]?.esito, 'NUOVO');
    assert.equal(confronti[1]?.esito, 'DUPLICATO');
    assert.match(confronti[1]!.differenze[0]!, /senza codice/);
  });
});

describe('aggiornamento parziale: non fa sparire niente', () => {
  // Il caso vero: il fornitore manda due pagine coi soli rincari. Le altre
  // trecento offerte non sono sparite — non sono state rimandate, che è una
  // cosa diversa, e trattarle come sparite disattiverebbe mezzo catalogo.
  const catalogo = [
    aCatalogo({ supplierProductId: 'sp-1', supplierCode: 'A1' }),
    aCatalogo({ supplierProductId: 'sp-2', supplierCode: 'A2' }),
    aCatalogo({ supplierProductId: 'sp-3', supplierCode: 'A3' }),
  ];
  const file = [nelFile({ supplierCode: 'A2', prezzoNetto: new Decimal('5.10') })];

  it('come listino completo le altre due spariscono', () => {
    const completo = riconcilia(catalogo, file);
    assert.equal(completo.filter((c) => c.esito === 'SPARITO').length, 2);
  });

  it('come parziale non ne sparisce nessuna', () => {
    const parziale = riconcilia(catalogo, file, { segnalaSpariti: false });
    assert.equal(parziale.filter((c) => c.esito === 'SPARITO').length, 0);
  });

  it('e per il resto si comporta esattamente come prima', () => {
    const parziale = riconcilia(catalogo, file, { segnalaSpariti: false });
    assert.equal(parziale.length, 1);
    assert.equal(parziale[0]!.esito, 'PREZZO_AGGIORNATO');
    assert.equal(parziale[0]!.prezzoDopo?.toString(), '5.1');
  });

  it('un articolo mai visto resta «nuovo»', () => {
    const parziale = riconcilia(catalogo, [nelFile({ supplierCode: 'MAI-VISTO' })], {
      segnalaSpariti: false,
    });
    assert.deepEqual(
      parziale.map((c) => c.esito),
      ['NUOVO'],
    );
  });

  it('una confezione cambiata si ferma e chiede, come sempre', () => {
    // La protezione che conta di più non dipende dalla modalità: stesso
    // codice con confezione diversa può essere lo stesso articolo reimballato
    // oppure un articolo diverso, e sbagliare falsa ogni confronto.
    const parziale = riconcilia(
      [aCatalogo({ supplierCode: 'A1', packQuantity: 6 })],
      [nelFile({ supplierCode: 'A1', packQuantity: 12 })],
      { segnalaSpariti: false },
    );
    assert.deepEqual(
      parziale.map((c) => c.esito),
      ['CONFEZIONE_CAMBIATA'],
    );
  });
});
