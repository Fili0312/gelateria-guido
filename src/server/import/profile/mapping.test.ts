import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applicaProfilo,
  numeroItaliano,
  PROFILO_VUOTO,
  profiloTornaSullaRiga,
  verificaProfilo,
  type ProfiloColonne,
  type RigaCelle,
} from './mapping';

/** Una riga come esce dal segmentatore: testo per indice di colonna. */
function riga(...testi: (string | null)[]): RigaCelle {
  return {
    celle: testi
      .map((testo, colonna) => ({ testo: testo ?? '', colonna }))
      .filter((c) => c.testo !== ''),
  };
}

/** Il profilo Cecconi, quello vero: dedotto dall'aritmetica sui 189 articoli. */
const CECCONI: ProfiloColonne = {
  codice: 0,
  descrizione: 1,
  quantita: 2,
  unitaDiVendita: 3,
  prezzoListino: 4,
  sconti: [5, 6],
  prezzoNetto: 7,
  iva: 8,
};

describe('numeroItaliano', () => {
  it('legge i numeri come li scrivono i listini', () => {
    assert.equal(numeroItaliano('5,25')?.toString(), '5.25');
    assert.equal(numeroItaliano('1.234,56')?.toString(), '1234.56');
    assert.equal(numeroItaliano('22')?.toString(), '22');
    assert.equal(numeroItaliano(' 0,00 ')?.toString(), '0');
  });

  it('non inventa un numero da ciò che non lo è', () => {
    // `CL.50` diventerebbe 50 con un parseFloat distratto, e quel 50
    // finirebbe in una colonna prezzo senza che nulla lo segnali.
    for (const testo of ['CL.50', '1/1', 'AP112', '', 'BT', '22%']) {
      assert.equal(numeroItaliano(testo), null, testo);
    }
  });
});

describe('applicaProfilo', () => {
  it('dà un nome alle celle di una riga Cecconi', () => {
    const s = applicaProfilo(
      riga('20561', 'ALISEA NATURALE CL.50 PET', '1', 'CO', '5,25', '10,00', '0,00', '4,72', '22'),
      CECCONI,
    );
    assert.deepEqual(s, {
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

  it('uno sconto a zero non entra nella cascata', () => {
    // Moltiplicare per (1 − 0) è un giro a vuoto, e mostrare «−0%» nella
    // catena degli sconti farebbe sembrare che ci sia uno sconto che non c'è.
    const s = applicaProfilo(
      riga('X', 'Y', '1', 'UN', '10,00', '0,00', '0,00', '10,00', '22'),
      CECCONI,
    );
    assert.deepEqual(s.sconti, []);
  });

  it('una colonna assente diventa null, non stringa vuota', () => {
    const s = applicaProfilo(riga('X', 'Y'), CECCONI);
    assert.equal(s.prezzoListino, null);
    assert.equal(s.iva, null);
  });

  it('scarta gli «sconti» fuori scala invece di applicarli', () => {
    // Un 150% in colonna sconti è una colonna letta male: applicarlo darebbe
    // un netto negativo, che poi qualcuno dovrebbe spiegarsi.
    const s = applicaProfilo(
      riga('X', 'Y', '1', 'UN', '10,00', '150', '0,00', '4,72', '22'),
      CECCONI,
    );
    assert.deepEqual(s.sconti, []);
  });
});

describe('profiloTornaSullaRiga — la prova che le colonne sono quelle giuste', () => {
  it('il conto quadra: 4,61 con −6% e −10% fa 3,90', () => {
    const s = applicaProfilo(
      riga('AP112', 'S.BENED.', '1,000', 'CT', '4,61', '6', '10', '3,90', '22'),
      CECCONI,
    );
    assert.equal(profiloTornaSullaRiga(s), true);
  });

  it('con le colonne sbagliate non quadra', () => {
    // Scambiando listino e netto il conto va all'incontrario: è così che la
    // ricerca del profilo scarta le combinazioni sbagliate.
    const storto: ProfiloColonne = { ...CECCONI, prezzoListino: 7, prezzoNetto: 4 };
    const s = applicaProfilo(
      riga('AP112', 'S.BENED.', '1,000', 'CT', '4,61', '6', '10', '3,90', '22'),
      storto,
    );
    assert.equal(profiloTornaSullaRiga(s), false);
  });

  it('senza netto dichiarato risponde «non lo so», non «è sbagliato»', () => {
    // Confondere le due cose farebbe scartare i listini che il netto non lo
    // pubblicano, che sono legittimi e vanno solo interpretati altrimenti.
    const senzaNetto: ProfiloColonne = { ...CECCONI, prezzoNetto: null };
    const s = applicaProfilo(
      riga('AP112', 'S.BENED.', '1,000', 'CT', '4,61', '6', '10', '3,90', '22'),
      senzaNetto,
    );
    assert.equal(profiloTornaSullaRiga(s), null);
  });
});

describe('verificaProfilo', () => {
  const righe = [
    riga('A', 'Uno', '1', 'CT', '4,61', '6', '10', '3,90', '22'),
    riga('B', 'Due', '1', 'BT', '18,18', '6', '', '17,09', '22'),
    riga('C', 'Tre', '1', 'BT', '10,00', '', '', '10,00', '22'),
  ];

  it('conta quante righe confermano il profilo', () => {
    const v = verificaProfilo(righe, CECCONI);
    assert.equal(v.confermate, 3);
    assert.equal(v.smentite, 0);
    assert.equal(v.quota, 1);
  });

  it('una quota nulla significa che nessuna riga può dire niente', () => {
    const v = verificaProfilo(righe, PROFILO_VUOTO);
    assert.equal(v.quota, null);
    assert.equal(v.mute, 3);
  });
});
