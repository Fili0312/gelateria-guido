import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { describe, it } from 'node:test';
import type { RigaStrutturata } from './profile/mapping';
import { validaRiga, validaTutte } from './validate';

function strutturata(dati: Partial<RigaStrutturata> = {}): RigaStrutturata {
  return {
    codice: 'AP112',
    descrizione: 'S.BENED. ACQ. TOWER NAT. 1/1 ctx12',
    quantita: '1,000',
    unitaDiVendita: 'CT',
    prezzoListino: '4,61',
    sconti: [6, 10],
    prezzoNetto: '3,90',
    iva: '22',
    ...dati,
  };
}

const messaggi = (r: ReturnType<typeof validaRiga>, campo: string) =>
  r.segnalazioni.filter((s) => s.campo === campo).map((s) => s.gravita);

describe('validaRiga — la riga buona', () => {
  const esito = validaRiga(strutturata());

  it('è importabile e non segnala niente', () => {
    assert.equal(esito.importabile, true);
    assert.deepEqual(esito.segnalazioni, []);
  });

  it('ricalcola il netto dagli sconti e trova lo stesso valore dichiarato', () => {
    assert.equal(esito.prezzoNettoCalcolato, '3.90');
    assert.equal(esito.prezzoNettoDichiarato, '3.90');
    assert.equal(esito.prezzoNetto, '3.90');
  });

  it('ricava formato e confezione dalla descrizione', () => {
    assert.equal(esito.unitSize, '1');
    assert.equal(esito.unitOfMeasure, 'L');
    assert.equal(esito.packQuantity, 12);
    assert.equal(esito.contentPerPack, '12');
    assert.equal(esito.baseUnit, 'L');
  });
});

describe('quando il netto dichiarato non torna col calcolo', () => {
  /**
   * Il caso vero: HENDRICK'S GIN nel listino Barzelli. 27,48 con −6% e −7%
   * fa 24,0243, ma il documento dichiara 24,00.
   */
  const esito = validaRiga(
    strutturata({
      descrizione: "HENDRICK'S GIN 0.700",
      unitaDiVendita: 'BT',
      prezzoListino: '27,48',
      sconti: [6, 7],
      prezzoNetto: '24,00',
    }),
  );

  it('vale il dichiarato: è quello che si paga', () => {
    assert.equal(esito.prezzoNetto, '24.00');
    assert.equal(esito.prezzoNettoCalcolato, '24.02');
  });

  it('la discordanza è un avviso, non un errore: la riga si importa', () => {
    assert.deepEqual(messaggi(esito, 'prezzoNetto'), ['avviso']);
    assert.equal(esito.importabile, true);
  });

  it('e viene detta, non ingoiata', () => {
    const avviso = esito.segnalazioni.find((s) => s.campo === 'prezzoNetto')!;
    assert.match(avviso.messaggio, /non coincide/);
    assert.match(avviso.messaggio, /24\.02/);
  });
});

describe('gli errori che rendono una riga non importabile', () => {
  it('senza descrizione', () => {
    const esito = validaRiga(strutturata({ descrizione: null }));
    assert.equal(esito.importabile, false);
    assert.deepEqual(messaggi(esito, 'descrizione'), ['errore']);
  });

  it('senza nessun prezzo ricavabile', () => {
    const esito = validaRiga(strutturata({ prezzoListino: null, prezzoNetto: null }));
    assert.equal(esito.importabile, false);
    assert.deepEqual(messaggi(esito, 'prezzoNetto'), ['errore']);
  });

  it('con un prezzo che non è un numero', () => {
    const esito = validaRiga(strutturata({ prezzoListino: 'n.d.' }));
    assert.equal(esito.importabile, false);
  });

  it('con un listino a zero', () => {
    const esito = validaRiga(strutturata({ prezzoListino: '0,00', prezzoNetto: null }));
    assert.equal(esito.importabile, false);
  });
});

describe('gli avvisi che non fermano l’import', () => {
  it('la confezione non dichiarata su un collo', () => {
    // Il caso della decisione D17: si compra a collo ma i pezzi non sono
    // scritti. La riga entra, ma il prezzo per unità non sarà confrontabile.
    const esito = validaRiga(
      strutturata({ descrizione: 'ALISEA NATURALE CL.50 PET', unitaDiVendita: 'CO' }),
    );
    assert.equal(esito.importabile, true);
    assert.deepEqual(messaggi(esito, 'packQuantity'), ['avviso']);
    assert.equal(esito.packQuantityConfirmed, false);
  });

  it('a pezzo singolo la confezione 1 è un dato e non si segnala', () => {
    const esito = validaRiga(strutturata({ descrizione: 'GRAPPA CL.70', unitaDiVendita: 'BT' }));
    assert.deepEqual(messaggi(esito, 'packQuantity'), []);
    assert.equal(esito.packQuantityConfirmed, true);
  });

  it('un’aliquota IVA che in Italia non esiste', () => {
    const esito = validaRiga(strutturata({ iva: '17' }));
    assert.deepEqual(messaggi(esito, 'iva'), ['avviso']);
    assert.equal(esito.importabile, true);
  });

  it('un prezzo fuori scala rispetto al resto del documento', () => {
    // Tipicamente è il totale di riga finito nella colonna dell'unitario.
    const esito = validaRiga(strutturata({ prezzoListino: '9.999,00', prezzoNetto: '9.999,00' }), {
      medianaListino: new Decimal(15),
    });
    assert.deepEqual(messaggi(esito, 'prezzoListino'), ['avviso']);
    assert.equal(esito.importabile, true);
  });
});

describe('validaTutte', () => {
  it('la mediana si calcola sul documento, non su una costante', () => {
    // Un listino di semilavorati ha prezzi dieci volte quelli di uno di
    // bibite: una soglia assoluta segnalerebbe tutto l'uno o niente dell'altro.
    const semilavorati = [
      strutturata({ prezzoListino: '62,50', prezzoNetto: '62,50', sconti: [] }),
      strutturata({ prezzoListino: '58,00', prezzoNetto: '58,00', sconti: [] }),
      strutturata({ prezzoListino: '71,00', prezzoNetto: '71,00', sconti: [] }),
    ];
    const esito = validaTutte(semilavorati);
    assert.equal(esito.conAvvisi, 0, 'prezzi alti ma coerenti fra loro non sono sospetti');
  });

  it('conta importabili, errori e avvisi', () => {
    const esito = validaTutte([
      strutturata(),
      strutturata({ descrizione: null }),
      strutturata({ iva: '17' }),
    ]);
    assert.equal(esito.importabili, 2);
    assert.equal(esito.conErrori, 1);
    assert.equal(esito.conAvvisi, 1);
  });

  it('nessuna riga sparisce, nemmeno quelle con errori', () => {
    // Scartare in silenzio è il modo in cui un import perde prodotti senza
    // che nessuno se ne accorga.
    const esito = validaTutte([strutturata(), strutturata({ descrizione: null })]);
    assert.equal(esito.righe.length, 2);
  });
});
