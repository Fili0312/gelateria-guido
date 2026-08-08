import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

/**
 * Lo storage dei PDF, provato su una cartella vera.
 *
 * `STORAGE_DIR` viene letta quando il modulo si carica, quindi va impostata
 * **prima** dell'import: e' il motivo per cui il modulo si importa a mano
 * dentro `before` invece che in cima al file.
 */

let cartella: string;
let storage: typeof import('./storage');

before(async () => {
  cartella = await mkdtemp(join(tmpdir(), 'gelateria-storage-'));
  process.env.STORAGE_DIR = cartella;
  storage = await import('./storage');
});

after(async () => {
  await rm(cartella, { recursive: true, force: true });
});

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x41]);

describe('salvaPdf', () => {
  it('salva il file col nome del suo hash e dichiara di averlo creato', async () => {
    const hash = storage.sha256(PDF);
    const esito = await storage.salvaPdf(PDF, hash);
    assert.equal(esito.creato, true);
    assert.equal(esito.percorso, join('pdf', hash.slice(0, 2), `${hash}.pdf`));
    assert.deepEqual(new Uint8Array(await readFile(join(cartella, esito.percorso))), PDF);
  });

  it('la seconda volta NON dichiara di averlo creato', async () => {
    // E' la distinzione che impedisce alla pulizia di un caricamento
    // rifiutato come doppione di portarsi via il PDF del listino originale.
    const hash = storage.sha256(PDF);
    const esito = await storage.salvaPdf(PDF, hash);
    assert.equal(esito.creato, false);
    // E il contenuto e' rimasto quello di prima, non e' stato riscritto.
    assert.deepEqual(new Uint8Array(await readFile(join(cartella, esito.percorso))), PDF);
  });

  it('non lascia file temporanei in giro', async () => {
    const { readdir } = await import('node:fs/promises');
    const hash = storage.sha256(PDF);
    const dentro = await readdir(join(cartella, 'pdf', hash.slice(0, 2)));
    assert.deepEqual(
      dentro.filter((f) => f.endsWith('.tmp')),
      [],
    );
  });
});

describe('percorsoPdf e percorsoAssoluto', () => {
  it('rifiuta un hash che non e un hash', async () => {
    for (const cattivo of ['../etc/passwd', 'abc', '', 'A'.repeat(64)]) {
      assert.throws(() => storage.percorsoPdf(cattivo), /Hash del file non valido/, cattivo);
    }
  });

  it('rifiuta un percorso che esce dalla cartella di storage', async () => {
    // Il nome sul disco lo costruiamo noi, ma il percorso arriva dal
    // database: fra sei mesi potrebbe arrivarci qualcosa di diverso.
    assert.throws(() => storage.percorsoAssoluto('../../etc/passwd'), /fuori dalla cartella/);
    assert.throws(() => storage.percorsoAssoluto('/etc/passwd'), /fuori dalla cartella/);
  });
});

describe('sembraPdf', () => {
  it('riconosce un PDF dai primi byte', () => {
    assert.equal(storage.sembraPdf(PDF), true);
  });

  it('scarta un file rinominato', async () => {
    // L'errore piu' comune: un .doc o un .xls salvato come .pdf. Senza questo
    // controllo arriverebbe fino a poppler e fallirebbe con un messaggio che
    // non aiuta.
    const finto = new TextEncoder().encode('questo non e un pdf');
    assert.equal(storage.sembraPdf(finto), false);
    assert.equal(storage.sembraPdf(new Uint8Array([0x25, 0x50])), false);
  });
});

describe('rimuoviPdf', () => {
  it('cancella il file e non protesta se non c era', async () => {
    const dati = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x39]);
    const hash = storage.sha256(dati);
    const { percorso } = await storage.salvaPdf(dati, hash);
    await storage.rimuoviPdf(percorso);
    await assert.rejects(() => readFile(join(cartella, percorso)));
    await storage.rimuoviPdf(percorso);
  });
});

describe('la cartella e quella dichiarata', () => {
  it('scrive dentro STORAGE_DIR e non altrove', async () => {
    await writeFile(join(cartella, 'sentinella'), 'x');
    assert.ok(storage.percorsoAssoluto('pdf').startsWith(cartella));
  });
});
