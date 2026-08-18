import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comuniDaNomi } from './parole-comuni';
import { eanValido, formatoLeggibile, nomePulito, normalizza } from './normalizza';
import { inBase, SOGLIA_AUTOMATICA, valuta, type Candidato } from './punteggio';

/**
 * Le prove che contano qui sono i **rifiuti**, non le accettazioni.
 *
 * Una foto mancante si vede e non fa danni; una foto sbagliata è credibile e
 * fa ordinare la cosa sbagliata. Ogni caso qui sotto è preso da un prodotto
 * vero del catalogo, e per ciascuno è scritto perché la risposta giusta è
 * quella e non l'altra.
 */

const scheda = (p: Partial<Candidato>): Candidato => ({
  nome: '',
  marche: null,
  quantita: null,
  codice: null,
  ...p,
});

describe('pulizia del nome di listino', () => {
  it('toglie formati, gradazioni e imballi', () => {
    assert.equal(nomePulito('ABSOLUT CITRON VODKA LITRO'), 'absolut citron vodka');
    assert.equal(nomePulito('AMARO CALAMARO 34% CL 70'), 'amaro calamaro');
    assert.equal(nomePulito('ALISEA GASSATA CL.50 PET X24'), 'alisea gassata');
    assert.equal(nomePulito('ACQUA LITRO NAT O GAS PET X 12'), 'acqua');
  });

  it('non lascia in giro i numeri rimasti senza la loro unità', () => {
    assert.equal(nomePulito('BIRRA 3 LT'), 'birra');
  });
});

describe('EAN', () => {
  it('accetta un barcode con la cifra di controllo giusta', () => {
    assert.equal(eanValido('8000815004233'), '8000815004233');
  });

  it('rifiuta tredici cifre che non sono un barcode', () => {
    // Senza questa verifica si finisce a chiedere alla fonte codici
    // inventati — e ogni tanto uno esiste davvero, con la foto di un altro
    // prodotto e la confidenza massima.
    assert.equal(eanValido('8000815004234'), null);
    assert.equal(eanValido('1234567890123'), null);
  });

  it('rifiuta lunghezze che non sono di nessun formato', () => {
    assert.equal(eanValido('12345'), null);
    assert.equal(eanValido(null), null);
  });
});

describe('formato', () => {
  it('lo scrive come una persona', () => {
    assert.equal(formatoLeggibile('1', 'LITER'), '1 L');
    assert.equal(formatoLeggibile('0.5', 'LITER'), '0.5 L');
    assert.equal(formatoLeggibile('0', 'LITER'), null);
  });

  it('riporta tutto alla stessa base per poterlo confrontare', () => {
    assert.equal(inBase('75 cl'), 750);
    assert.equal(inBase('0.7l'), 700);
    assert.equal(inBase('senza numeri'), null);
  });
});

describe('punteggio di somiglianza', () => {
  const comuni = new Set(['vodka', 'amaro', 'acqua', 'liquore', 'gin']);

  it('l’EAN uguale vale uno e chiude il discorso', () => {
    const esito = valuta(
      { nome: 'qualunque cosa', marca: null, variante: null, formato: null, ean: '8000815004233' },
      scheda({ nome: 'Tutt’altro nome', codice: '8000815004233' }),
    );
    assert.equal(esito.confidenza, 1);
  });

  it('rifiuta la scheda di un altro produttore, per quanto somigli', () => {
    // «AMARO DELL'ERBORISTA VARNELLI» contro un amaro dell'erborista di
    // chiunque altro: le parole si assomigliano quasi tutte, ma la
    // bottiglia è di un'altra azienda.
    const esito = valuta(
      {
        nome: 'amaro erborista varnelli',
        marca: 'Varnelli',
        variante: null,
        formato: null,
        ean: null,
      },
      scheda({ nome: 'Amaro dell’Erborista', marche: 'Altra Distilleria' }),
    );
    assert.equal(esito.confidenza, 0);
    assert.match(esito.motivo, /marca diversa/);
  });

  it('rifiuta la variante sbagliata della stessa marca', () => {
    // È il caso peggiore: stessa forma, stessa etichetta, colore diverso.
    // Nessuno lo ricontrolla, e arriva la cassa sbagliata.
    const esito = valuta(
      {
        nome: 'absolut citron vodka',
        marca: 'Absolut',
        variante: 'Citron',
        formato: null,
        ean: null,
      },
      scheda({ nome: 'Absolut Kurant Vodka', marche: 'Absolut' }),
    );
    assert.equal(esito.confidenza, 0);
    assert.match(esito.motivo, /variante/);
  });

  it('accetta la scheda giusta anche se descritta più riccamente', () => {
    const esito = valuta(
      {
        nome: 'amaretto di saronno',
        marca: 'Amaretto di Saronno',
        variante: null,
        formato: '1 L',
        ean: null,
      },
      scheda({
        nome: 'Amaretto di Saronno Originale',
        marche: 'Disaronno',
        quantita: '1 l',
      }),
    );
    assert.ok(
      esito.confidenza >= SOGLIA_AUTOMATICA,
      `attesa sopra soglia, ottenuta ${esito.confidenza} (${esito.motivo})`,
    );
  });

  it('non associa niente a un prodotto senza identità', () => {
    // «ACQUA LITRO NAT O GAS PET X 12» si riduce a «acqua»: è l'acqua senza
    // marca del fornitore, e senza questa regola qualunque bottiglia
    // d'acqua la copriva al cento per cento.
    const esito = valuta(
      { nome: 'acqua', marca: null, variante: null, formato: null, ean: null },
      scheda({ nome: 'Acqua Minerale Naturale', marche: 'Chiunque' }),
      comuni,
    );
    assert.equal(esito.confidenza, 0);
    assert.match(esito.motivo, /generico/);
  });

  it('un formato dieci volte diverso è un altro prodotto', () => {
    const grande = valuta(
      { nome: 'alchermes baldoni', marca: 'Baldoni', variante: null, formato: '2 L', ean: null },
      scheda({ nome: 'Alchermes Baldoni', marche: 'Baldoni', quantita: '100 ml' }),
    );
    const giusto = valuta(
      { nome: 'alchermes baldoni', marca: 'Baldoni', variante: null, formato: '2 L', ean: null },
      scheda({ nome: 'Alchermes Baldoni', marche: 'Baldoni', quantita: '2 l' }),
    );
    assert.ok(
      grande.confidenza < giusto.confidenza,
      'il formato molto diverso deve valere meno di quello uguale',
    );
  });
});

describe('parole comuni del catalogo', () => {
  it('riconosce come generico ciò che compare ovunque', () => {
    // Otto gin su dieci prodotti: «gin» non identifica nessuno di loro.
    const nomi = [
      ...Array.from({ length: 8 }, (_, i) => `GIN NUMERO ${i} CL.70`),
      'AMARO MONTENEGRO CL.100',
      'ACQUA PANNA CL.50',
    ];
    const comuni = comuniDaNomi(nomi);
    assert.ok(comuni.has('gin'), 'gin deve risultare comune');
    assert.ok(!comuni.has('montenegro'), 'montenegro deve restare distintivo');
  });
});

describe('normalizzazione completa', () => {
  it('mette insieme la stringa da cercare senza ripetere la marca', () => {
    const dati = normalizza({
      name: 'ABSOLUT CITRON VODKA LITRO',
      brand: 'Absolut',
      unitSize: '1',
      unitOfMeasure: 'LITER',
    });
    assert.equal(dati.imageQuery, 'absolut citron vodka 1 L');
    assert.equal(dati.brand, 'absolut');
  });

  it('antepone la marca quando non è già nel nome', () => {
    const dati = normalizza({
      name: 'AMARO CALAMARO 34% CL 70',
      brand: 'Calamaro',
      unitSize: '0.7',
      unitOfMeasure: 'LITER',
    });
    assert.equal(dati.imageQuery, 'amaro calamaro 0.7 L');
  });
});
