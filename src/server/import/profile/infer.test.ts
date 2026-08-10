import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { leggiBbox } from '../pdf/bbox';
import { segmenta } from '../pdf/segment';
import { deduciProfilo, indiziPerColonna } from './infer';
import { applicaProfilo, type RigaCelle } from './mapping';

/**
 * L'inferenza del profilo, misurata sui listini veri.
 *
 * Il punto di questi test non è che il codice giri: è che sui tre documenti
 * della gelateria il profilo venga dedotto **dall'aritmetica**, cioè senza
 * chiamare nessun modello. Se un giorno smettesse di funzionare, la Fase 8
 * ricomincerebbe a spendere per farsi dire cose che poteva dimostrare.
 */

const LISTINI = join(import.meta.dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'listini');
const BARZELLI = '29.04.26 listino BARZELLI.pdf';
const CECCONI = 'Cecconi Listino prezzi al 28.02.25 (escluso Vino_spumante).pdf';
const VINI = 'Cecconi Listino Vini e Spumanti al 26.03.25.pdf';
const LISTINI_REALI_DISPONIBILI = [BARZELLI, CECCONI, VINI].every((file) =>
  existsSync(join(LISTINI, file)),
);

if (process.env.REQUIRE_REAL_PDF_FIXTURES === '1' && !LISTINI_REALI_DISPONIBILI) {
  throw new Error(
    'Fixture PDF riservate assenti. Copiale in tests/fixtures/listini prima di eseguire test:real-pdf.',
  );
}

const describeConListiniReali = LISTINI_REALI_DISPONIBILI ? describe : describe.skip;

function prodottiDi(file: string): RigaCelle[] {
  const xml = execFileSync(
    'pdftotext',
    ['-bbox-layout', '-enc', 'UTF-8', join(LISTINI, file), '-'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return segmenta(leggiBbox(xml).pagine).righe.filter((r) => r.tipo === 'prodotto');
}

describeConListiniReali('il profilo si deduce dall’aritmetica, senza IA', () => {
  for (const file of [BARZELLI, CECCONI, VINI]) {
    it(`${file}: profilo provato dal conto che torna`, () => {
      const esito = deduciProfilo(prodottiDi(file));
      assert.equal(
        esito.fonte,
        'aritmetica',
        `dedotto per ${esito.fonte}: incerti ${esito.incerti.join(', ')}`,
      );
      assert.ok(
        (esito.verifica.quota ?? 0) >= 0.95,
        `solo il ${((esito.verifica.quota ?? 0) * 100).toFixed(1)}% delle righe conferma il profilo`,
      );
      assert.deepEqual(esito.incerti, [], 'non deve restare niente da chiedere');
    });
  }
});

describeConListiniReali('i campi che ne escono sono quelli giusti', () => {
  it('Cecconi: codice, descrizione, unità di vendita, prezzo, sconti, netto, IVA', () => {
    const righe = prodottiDi(CECCONI);
    const { profilo } = deduciProfilo(righe);
    const alisea = righe.find((r) => r.celle[0]?.testo === '20561');
    assert.ok(alisea);

    assert.deepEqual(applicaProfilo(alisea, profilo), {
      codice: '20561',
      descrizione: 'ALISEA NATURALE CL.50 PET',
      quantita: '1',
      unitaDiVendita: 'CO',
      prezzoListino: '5,25',
      sconti: [10],
      prezzoNetto: '4,72',
      iva: '22',
    });
  });

  it('Barzelli: due sconti in cascata sulla stessa riga', () => {
    const righe = prodottiDi(BARZELLI);
    const { profilo } = deduciProfilo(righe);
    const acqua = righe.find((r) => r.celle[0]?.testo === 'AP112');
    assert.ok(acqua);

    const s = applicaProfilo(acqua, profilo);
    assert.equal(s.prezzoListino, '4,61');
    assert.deepEqual(s.sconti, [6, 10]);
    assert.equal(s.prezzoNetto, '3,90');
  });

  it('la descrizione non è la colonna del codice', () => {
    // Sono entrambe testuali e adiacenti: distinguerle è il primo modo in cui
    // un'inferenza del profilo può sbagliare in modo plausibile.
    for (const file of [BARZELLI, CECCONI]) {
      const { profilo } = deduciProfilo(prodottiDi(file));
      assert.notEqual(profilo.codice, profilo.descrizione, file);
      assert.equal(profilo.codice, 0, `${file}: il codice sta nella prima colonna`);
    }
  });
});

describeConListiniReali('gli indizi per colonna', () => {
  it('riconosce la colonna dell’IVA dalle aliquote che contiene', () => {
    const indizi = indiziPerColonna(prodottiDi(CECCONI));
    const { profilo } = deduciProfilo(prodottiDi(CECCONI));
    const iva = indizi.find((i) => i.colonna === profilo.iva);
    assert.ok(iva);
    assert.equal(iva.aliquote, iva.numeriche, 'la colonna IVA contiene solo aliquote');
  });

  it('la descrizione è la colonna col testo più lungo', () => {
    const indizi = indiziPerColonna(prodottiDi(CECCONI));
    const { profilo } = deduciProfilo(prodottiDi(CECCONI));
    const descrizione = indizi.find((i) => i.colonna === profilo.descrizione)!;
    const piuLunga = [...indizi].sort((a, b) => b.lunghezzaMedia - a.lunghezzaMedia)[0]!;
    assert.equal(descrizione.colonna, piuLunga.colonna);
  });
});

describeConListiniReali('quando il conto non torna', () => {
  it('Barzelli ha una riga che il fornitore ha arrotondato a modo suo', () => {
    // HENDRICK'S GIN: 27,48 con −6% e −7% fa 24,0243, ma il documento dichiara
    // 24,00. Non è un errore di lettura, è il fornitore che ha arrotondato
    // altrimenti — e va segnalato, non ingoiato: il netto dichiarato resta
    // quello che si paga.
    const esito = deduciProfilo(prodottiDi(BARZELLI));
    assert.equal(esito.verifica.smentite, 1);
    assert.equal(esito.verifica.confermate, 141);
  });
});
