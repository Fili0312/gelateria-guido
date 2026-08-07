import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applicaSconti, scontiPuliti, scontoEquivalente, verificaNetto } from './discounts.js';

/**
 * L'aritmetica degli sconti, verificata contro i listini veri.
 *
 * Ogni caso e' una riga copiata da Barzelli o Cecconi: prezzo di listino,
 * sconti come stampati, e il netto che il fornitore ha calcolato lui. Se
 * questi test passano, il nostro conto e' lo stesso del loro gestionale —
 * ed e' l'unico modo di saperlo senza aspettare la prima fattura.
 */

interface RigaReale {
  fornitore: string;
  articolo: string;
  listino: string;
  sconti: number[];
  netto: string;
}

const RIGHE_REALI: RigaReale[] = [
  // Barzelli, 29/04/2026 — due colonne di sconto
  {
    fornitore: 'Barzelli',
    articolo: 'S.BENED. ACQ. TOWER NAT.',
    listino: '4.61',
    sconti: [6, 10],
    netto: '3.90',
  },
  {
    fornitore: 'Barzelli',
    articolo: 'BRAULIO AMARO',
    listino: '18.33',
    sconti: [6, 4],
    netto: '16.54',
  },
  {
    fornitore: 'Barzelli',
    articolo: 'BRAULIO AMARO RISERVA',
    listino: '26.41',
    sconti: [6, 4],
    netto: '23.83',
  },
  {
    fornitore: 'Barzelli',
    articolo: 'TONICA MEDITERRANEA POLARA',
    listino: '0.71',
    sconti: [6, 25],
    netto: '0.50',
  },
  {
    fornitore: 'Barzelli',
    articolo: 'AMARETTO DI SARONNO',
    listino: '18.18',
    sconti: [6],
    netto: '17.09',
  },
  {
    fornitore: 'Barzelli',
    articolo: 'MONTENEGRO AMARO',
    listino: '19.67',
    sconti: [6],
    netto: '18.49',
  },
  // Cecconi, 28/02/2025 — cinque colonne, una sola usata
  {
    fornitore: 'Cecconi',
    articolo: 'ALISEA NATURALE CL.50',
    listino: '5.25',
    sconti: [10],
    netto: '4.72',
  },
  {
    fornitore: 'Cecconi',
    articolo: 'GOLDBERG TONIC WATER',
    listino: '21.45',
    sconti: [10],
    netto: '19.30',
  },
  {
    fornitore: 'Cecconi',
    articolo: 'RECOARO ACQUA BRILLANTE',
    listino: '15.29',
    sconti: [10],
    netto: '13.76',
  },
  {
    fornitore: 'Cecconi',
    articolo: 'HAVANA CLUB 3Y RON',
    listino: '16.50',
    sconti: [10],
    netto: '14.85',
  },
  {
    fornitore: 'Cecconi',
    articolo: 'KALTERN GEWURZTRAMINER',
    listino: '10.30',
    sconti: [24],
    netto: '7.83',
  },
  {
    fornitore: 'Cecconi',
    articolo: 'SPAGNOL PROSECCO',
    listino: '6.80',
    sconti: [],
    netto: '6.80',
  },
];

describe('applicaSconti — contro i listini veri', () => {
  for (const riga of RIGHE_REALI) {
    it(`${riga.fornitore}: ${riga.articolo}`, () => {
      const calcolato = applicaSconti(riga.listino, riga.sconti);
      assert.equal(
        calcolato.toFixed(2),
        riga.netto,
        `${riga.listino} con sconti [${riga.sconti.join(', ')}]`,
      );
    });
  }
});

describe('applicaSconti — proprieta della cascata', () => {
  it('gli sconti si applicano in sequenza, non si sommano', () => {
    // 6% + 10% non fanno 16%: fanno 15,4%.
    const cascata = applicaSconti('100', [6, 10]);
    const somma = applicaSconti('100', [16]);
    assert.equal(cascata.toFixed(2), '84.60');
    assert.equal(somma.toFixed(2), '84.00');
    assert.notEqual(cascata.toFixed(2), somma.toFixed(2));
  });

  it('lo sconto equivalente lo dice in chiaro', () => {
    assert.equal(scontoEquivalente([6, 10]).toFixed(2), '15.40');
    assert.equal(scontoEquivalente([]).toFixed(2), '0.00');
  });

  it('arrotonda al pari, come i listini dei fornitori', () => {
    // 5,25 -10% = 4,725 esatti. Cecconi stampa 4,72, non 4,73.
    assert.equal(applicaSconti('5.25', [10]).toFixed(2), '4.72');
    // 21,45 -10% = 19,305 esatti. Cecconi stampa 19,30.
    assert.equal(applicaSconti('21.45', [10]).toFixed(2), '19.30');
  });

  it('nessuno sconto lascia il prezzo dov era', () => {
    assert.equal(applicaSconti('6.80', []).toFixed(2), '6.80');
    assert.equal(applicaSconti('6.80', [0, 0]).toFixed(2), '6.80');
  });
});

describe('verificaNetto — il controllo sulla lettura del PDF', () => {
  it('accetta il netto stampato quando i conti tornano', () => {
    const esito = verificaNetto('4.61', [6, 10], '3.90');
    assert.equal(esito.coerente, true);
    assert.equal(esito.scarto.abs().toFixed(2), '0.00');
  });

  it('tollera un centesimo di differenza di arrotondamento', () => {
    assert.equal(verificaNetto('4.61', [6, 10], '3.91').coerente, true);
  });

  it('segnala uno sconto letto male', () => {
    // Il PDF diceva 6 e 10, ma l'estrattore ha letto solo il 6:
    // il netto dichiarato non torna, e il sistema deve accorgersene.
    const esito = verificaNetto('4.61', [6], '3.90');
    assert.equal(esito.coerente, false);
    assert.ok(esito.scarto.abs().gt('0.4'), `scarto ${esito.scarto}`);
  });
});

describe('scontiPuliti', () => {
  it('scarta vuoti, zeri e valori impossibili', () => {
    assert.deepEqual(scontiPuliti([6, 0, null, '', '10,00', undefined, 120, -5]), [6, 10]);
  });
});
