import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { leggiBbox, type PaginaParole, type Parola } from './bbox';
import { righeDiPagina, segmenta, sembraNumero, trovaColonne, trovaIntestazioni } from './segment';

/**
 * Il segmentatore misurato sui listini veri, più i casi costruiti a mano che
 * fissano le regole scoperte leggendoli.
 *
 * I conteggi di riferimento stanno in `tests/fixtures/listini/atteso.json` e
 * sono stati contati a mano dal testo dei documenti: se li producesse questo
 * codice, il test direbbe solo che il programma è d'accordo con sé stesso.
 */

const LISTINI = join(import.meta.dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'listini');

const ATTESO: Record<string, { prodotti: number }> = JSON.parse(
  readFileSync(join(LISTINI, 'atteso.json'), 'utf8'),
);

function parole(righe: [number, number, string][]): PaginaParole {
  const elenco: Parola[] = righe.map(([x, y, testo]) => ({
    testo,
    x,
    y,
    xFine: x + testo.length * 5,
    yFine: y + 8,
  }));
  return { numero: 1, larghezza: 595, altezza: 842, parole: elenco };
}

// ─────────────────────────────────────────────────────────────────────────
//  Le regole, sui casi minimi
// ─────────────────────────────────────────────────────────────────────────

describe('celle e numeri', () => {
  it('due numeri vicini non finiscono nella stessa cella', () => {
    // Il caso Cecconi: prezzo e primo sconto distano 5,4 punti, meno di
    // quanto distino due parole di una descrizione. Senza la regola sul
    // contenuto sarebbero una cella sola, e il prezzo verrebbe letto male.
    const pagina = parole([
      [20, 100, '20561'],
      [57, 100, 'ALISEA'],
      [90, 100, 'PET'],
      [342, 100, '5,25'],
      [349, 100, '10,00'],
    ]);
    const celle = righeDiPagina(pagina)[0]!.celle.map((c) => c.testo);
    assert.deepEqual(celle, ['20561', 'ALISEA PET', '5,25', '10,00']);
  });

  it('le parole di una descrizione restano attaccate', () => {
    const pagina = parole([
      [57, 100, 'SAN'],
      [78, 100, 'PELLEGRINO'],
      [130, 100, 'CL.20'],
    ]);
    assert.deepEqual(
      righeDiPagina(pagina)[0]!.celle.map((c) => c.testo),
      ['SAN PELLEGRINO CL.20'],
    );
  });

  it('riconosce i numeri come li scrivono i listini italiani', () => {
    for (const buono of ['5,25', '1.234,56', '22', '0,00', '-3,5', '1000']) {
      assert.equal(sembraNumero(buono), true, buono);
    }
    for (const cattivo of ['1/1', 'CL.50', 'AP112', '22%', '']) {
      assert.equal(sembraNumero(cattivo), false, cattivo);
    }
  });
});

describe('intestazioni ripetute', () => {
  /**
   * Tre pagine con «Pag. N» sempre in cima, e un prodotto per pagina il cui
   * nome differisce solo per un numero — quindi con la **stessa** chiave
   * normalizzata dell'intestazione. È il caso che distingue le due regole.
   */
  const treePagine = (yProdotto: (n: number) => number) =>
    [1, 2, 3].map((n) =>
      righeDiPagina({
        numero: n,
        larghezza: 595,
        altezza: 842,
        parole: [
          { testo: 'Pag.', x: 500, y: 20, xFine: 520, yFine: 28 },
          { testo: String(n), x: 522, y: 20, xFine: 530, yFine: 28 },
          { testo: 'SCATOLA', x: 20, y: yProdotto(n), xFine: 70, yFine: yProdotto(n) + 8 },
          { testo: String(n), x: 74, y: yProdotto(n), xFine: 80, yFine: yProdotto(n) + 8 },
        ],
      }),
    );

  it('«Pag. 1», «Pag. 2», «Pag. 3» sono la stessa intestazione', () => {
    // Senza normalizzare via i numeri non verrebbero mai riconosciute come
    // la stessa riga, e resterebbero in mezzo ai dati su ogni pagina.
    const intestazioni = trovaIntestazioni(treePagine(() => 100));
    assert.ok(intestazioni.has('pag. #'));
  });

  it('un prodotto che si ripete ad altezze diverse NON è cornice', () => {
    // «SCATOLA 1», «SCATOLA 2», «SCATOLA 3» hanno la stessa chiave
    // normalizzata dell'intestazione, ma compaiono a altezze diverse: sono
    // dati. Senza il vincolo sull'altezza sparirebbero dall'import, e nulla
    // lo segnalerebbe.
    const intestazioni = trovaIntestazioni(treePagine((n) => 100 + n * 60));
    assert.equal(intestazioni.has('scatola #'), false);
    assert.ok(intestazioni.has('pag. #'), 'la vera intestazione va comunque riconosciuta');
  });

  it('se invece sta sempre alla stessa altezza, è cornice', () => {
    const intestazioni = trovaIntestazioni(treePagine(() => 100));
    assert.ok(intestazioni.has('scatola #'));
  });

  it('con una pagina sola non dichiara intestazioni', () => {
    // Su un documento di una pagina «ripetuto su più pagine» non vuol dire
    // niente, e cancellerebbe righe di dati.
    assert.equal(trovaIntestazioni([[]]).size, 0);
  });
});

describe('colonne', () => {
  it('una colonna esiste se molte righe cominciano allo stesso punto', () => {
    const righe = Array.from({ length: 20 }, (_, i) =>
      righeDiPagina(
        parole([
          [20, 100 + i * 13, `COD${i}`],
          [57, 100 + i * 13, 'Descrizione'],
          [342, 100 + i * 13, '5,25'],
        ]),
      )[0]!,
    );
    const colonne = trovaColonne(righe);
    assert.deepEqual(
      colonne.map((c) => Math.round(c)),
      [20, 57, 342],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
//  I listini veri
// ─────────────────────────────────────────────────────────────────────────

function segmentaFile(file: string) {
  const xml = execFileSync('pdftotext', ['-bbox-layout', '-enc', 'UTF-8', join(LISTINI, file), '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return segmenta(leggiBbox(xml).pagine);
}

describe('copertura sui listini veri — criterio della Fase 7', () => {
  const SOGLIA = 0.9;

  for (const [file, riferimento] of Object.entries(ATTESO)) {
    if (file.startsWith('_')) continue;

    it(`${file}: almeno il ${SOGLIA * 100}% delle ${riferimento.prodotti} righe prodotto`, () => {
      const esito = segmentaFile(file);
      const quota = esito.diagnostica.prodotti / riferimento.prodotti;
      assert.ok(
        quota >= SOGLIA,
        `individuati ${esito.diagnostica.prodotti} su ${riferimento.prodotti} (${(quota * 100).toFixed(1)}%)`,
      );
      // Anche il verso opposto: inventare righe è grave quanto perderle, e
      // un test che guarda solo il minimo non se ne accorgerebbe.
      assert.ok(
        quota <= 1.05,
        `individuate più righe di quante ce ne siano: ${esito.diagnostica.prodotti} su ${riferimento.prodotti}`,
      );
    });
  }
});

describe('il caso più insidioso: le descrizioni che vanno a capo', () => {
  const CECCONI = 'Cecconi Listino prezzi al 28.02.25 (escluso Vino_spumante).pdf';

  it('ricompone la descrizione spezzata su due righe', () => {
    const esito = segmentaFile(CECCONI);
    const prodotti = esito.righe.filter((r) => r.tipo === 'prodotto');

    const pellegrino = prodotti.find((r) => r.celle[0]?.testo === '53827');
    assert.ok(pellegrino, 'il prodotto 53827 deve esserci');
    assert.match(pellegrino.testo, /SAN PELLEGRINO GINGER BEER CL\.20 VAP/);

    const grappa = prodotti.find((r) => r.celle[0]?.testo === '7A0063');
    assert.ok(grappa);
    assert.match(grappa.testo, /BERTAGNOLLI GRAPPA GEWURZTRAMINER 42% CL\.70/);
  });

  it('un quarto dei prodotti ha la descrizione a capo: non è un caso limite', () => {
    const prodotti = segmentaFile(CECCONI).righe.filter((r) => r.tipo === 'prodotto');
    const aCapo = prodotti.filter((r) => r.continuazioni.length > 0);
    assert.ok(
      aCapo.length > prodotti.length * 0.2,
      `solo ${aCapo.length} su ${prodotti.length}: se questo numero crolla, la fusione si è rotta`,
    );
  });
});

describe('la cornice di pagina viene davvero riconosciuta', () => {
  /**
   * Il conteggio dei prodotti non basta a dire che la segmentazione sta bene.
   * Un giro in cui il riconoscimento delle intestazioni si era spento da 8
   * pattern a 1 lasciava passare 250 righe di cornice fra i dati, e i
   * prodotti restavano 189: giusti per caso, perche' il classificatore e'
   * robusto. Questo controlla la cosa che quel conteggio non vede.
   */
  it('su un listino di 9 pagine trova la cornice che si ripete', () => {
    const esito = segmentaFile('Cecconi Listino prezzi al 28.02.25 (escluso Vino_spumante).pdf');
    assert.ok(
      esito.intestazioni.length >= 3,
      `solo ${esito.intestazioni.length} pattern di cornice riconosciuti: ` +
        'il riconoscimento delle intestazioni si e rotto',
    );
    // La riga delle colonne c'e' su tutte le pagine ed e' la piu' importante:
    // se resta fra i dati, la Fase 8 prova a interpretarla come un prodotto.
    assert.ok(
      esito.intestazioni.some((i) => i.testo.includes('codice descrizione')),
      'la riga di intestazione delle colonne deve essere riconosciuta come cornice',
    );
  });

  it('le righe non capite restano poche: sono la cornice della prima pagina e i totali', () => {
    const esito = segmentaFile('Cecconi Listino prezzi al 28.02.25 (escluso Vino_spumante).pdf');
    const ignote = esito.righe.filter((r) => r.tipo === 'ignota');
    assert.ok(
      ignote.length < 40,
      `${ignote.length} righe non capite su 9 pagine: sono troppe, la cornice sta rientrando fra i dati`,
    );
  });
});

describe('i totali di fine documento non entrano nell’ultimo prodotto', () => {
  it('nessun listino finisce con «Totale» dentro l’ultima riga', () => {
    // È l'errore che il conteggio non vede: le righe restano 189, ma
    // l'ultima porta dentro «Totale ordine: 5.287,11» e in fase di import
    // diventerebbe un prezzo sbagliato.
    for (const file of Object.keys(ATTESO)) {
      if (file.startsWith('_')) continue;
      const prodotti = segmentaFile(file).righe.filter((r) => r.tipo === 'prodotto');
      const ultimo = prodotti.at(-1)!;
      assert.doesNotMatch(
        ultimo.testo,
        /totale|imponibile|scadenze|tot\.? pagare/i,
        `${file}: l'ultimo prodotto ha assorbito il blocco dei totali — «${ultimo.testo.slice(0, 120)}»`,
      );
    }
  });
});
