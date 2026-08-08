import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Dove finiscono i PDF caricati.
 *
 * I file sono **indirizzati dal contenuto**: il nome sul disco è lo sha256,
 * non il nome che aveva sul computer di chi lo carica. Tre conseguenze, tutte
 * volute:
 *
 *  - due caricamenti dello stesso file occupano un posto solo;
 *  - un nome come `../../etc/passwd` o `listino (1).pdf` non tocca mai il
 *    filesystem — l'unico nome che ci arriva è un esadecimale di 64 cifre,
 *    e non c'è modo di farlo uscire dalla cartella;
 *  - il nome originale resta nel database, dove serve a mostrarlo, e non
 *    dove servirebbe a fare danni.
 */

const RADICE = process.env.STORAGE_DIR ?? join(process.cwd(), 'storage');

export class StorageError extends Error {
  override readonly name = 'StorageError';
}

export function sha256(dati: Uint8Array): string {
  return createHash('sha256').update(dati).digest('hex');
}

/**
 * Il percorso relativo di un PDF, dato il suo hash.
 *
 * I primi due caratteri diventano una sottocartella: con qualche migliaio di
 * listini una cartella piatta resta usabile ma scomoda da ispezionare, e
 * questa suddivisione costa una riga.
 */
export function percorsoPdf(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new StorageError('Hash del file non valido.');
  }
  return join('pdf', hash.slice(0, 2), `${hash}.pdf`);
}

/** Il percorso assoluto, verificato che resti dentro la cartella di storage. */
export function percorsoAssoluto(relativo: string): string {
  const radice = resolve(RADICE);
  const assoluto = resolve(radice, relativo);
  // La verifica c'e' anche se oggi il percorso lo costruiamo noi: e' il tipo
  // di invariante che regge quando qualcuno, fra sei mesi, passera' qui una
  // stringa che arriva dal database.
  if (assoluto !== radice && !assoluto.startsWith(`${radice}/`)) {
    throw new StorageError('Percorso fuori dalla cartella di storage.');
  }
  return assoluto;
}

export interface PdfSalvato {
  percorso: string;
  /**
   * `true` solo se **questa** chiamata ha creato il file.
   *
   * Serve a chi deve fare pulizia dopo un errore. Senza questa distinzione
   * accade una cosa brutta e silenziosa: caricando due volte lo stesso PDF, il
   * secondo caricamento viene rifiutato come doppione, la pulizia cancella il
   * file — e si porta via quello del **primo** listino, che era buono. Il
   * listino resta in elenco e il suo PDF non c'e' piu'. E' successo davvero,
   * ed e' saltato fuori solo perche' la ripresa dopo un riavvio non trovava
   * piu' il file da rileggere.
   */
  creato: boolean;
}

/**
 * Salva il PDF e dice se è stato lui a crearlo.
 *
 * Si scrive un temporaneo e poi si crea il nome definitivo con `link`, non con
 * `rename`: `rename` sovrascriverebbe in silenzio, mentre `link` fallisce con
 * `EEXIST` se il file c'è già — che qui è l'informazione che serve, ed è
 * atomica. Due caricamenti simultanei dello stesso file nuovo non possono
 * quindi dichiararsi creatori entrambi.
 *
 * Il temporaneo ha un nome irripetibile e viene rimosso in ogni caso: se il
 * processo muore a metà scrittura non resta un PDF troncato col nome buono.
 */
export async function salvaPdf(dati: Uint8Array, hash: string): Promise<PdfSalvato> {
  const relativo = percorsoPdf(hash);
  const assoluto = percorsoAssoluto(relativo);
  await mkdir(dirname(assoluto), { recursive: true });

  const temporaneo = `${assoluto}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaneo, dati, { flag: 'wx' });
    try {
      await link(temporaneo, assoluto);
      return { percorso: relativo, creato: true };
    } catch (errore) {
      // Il file c'era già: è lo stesso contenuto, per definizione di hash.
      if ((errore as { code?: string }).code === 'EEXIST') {
        return { percorso: relativo, creato: false };
      }
      throw errore;
    }
  } finally {
    await unlink(temporaneo).catch(() => {});
  }
}

export async function leggiPdf(relativo: string): Promise<Buffer> {
  return readFile(percorsoAssoluto(relativo));
}

/** Cancella un PDF salvato. Usato quando la riga di database non si crea. */
export async function rimuoviPdf(relativo: string): Promise<void> {
  await unlink(percorsoAssoluto(relativo)).catch(() => {});
}

/** Il PDF comincia sempre con `%PDF-`. Non è una garanzia di validità, ma
 *  scarta subito un file rinominato, che è l'errore più comune. */
export function sembraPdf(dati: Uint8Array): boolean {
  return (
    dati.length > 5 &&
    dati[0] === 0x25 &&
    dati[1] === 0x50 &&
    dati[2] === 0x44 &&
    dati[3] === 0x46 &&
    dati[4] === 0x2d
  );
}
