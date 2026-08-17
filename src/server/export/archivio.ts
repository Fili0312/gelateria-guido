import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ZipArchive } from 'archiver';
import { percorsoAssoluto } from '@/server/import/storage';

/**
 * Dove finiscono i documenti generati, e come si rileggono.
 *
 * ── Perché ogni generazione ha una cartella sua ─────────────────────────
 * Il percorso è `exports/<ordine>/<generazione>/<nome leggibile>`. La cartella
 * intermedia è un identificatore irripetibile, e serve a una cosa sola:
 * **rigenerare non sovrascrive**. Chi ha già mandato un PDF al fornitore e poi
 * rigenera con un template diverso deve poter tornare a vedere esattamente il
 * file che ha mandato — altrimenti, quando il fornitore contesta una riga, non
 * si ha più il documento su cui si stava discutendo.
 *
 * Il nome leggibile resta l'ultimo pezzo del percorso, così una cartella
 * ispezionata a mano si capisce senza consultare il database.
 */

export class ArchivioError extends Error {
  override readonly name = 'ArchivioError';
}

/** Un identificatore per la generazione: niente che arrivi da fuori. */
export function nuovaGenerazione(): string {
  return randomUUID();
}

export function percorsoDocumento(orderId: string, generazione: string, nome: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) {
    throw new ArchivioError('Identificativo ordine non valido.');
  }
  if (!/^[0-9a-f-]{36}$/.test(generazione)) {
    throw new ArchivioError('Identificativo generazione non valido.');
  }
  // Il nome lo costruisce `nome-file.ts` e non contiene barre; la verifica
  // c'è comunque, perché fra sei mesi qui potrebbe arrivare una stringa dal
  // database che nessuno ha più in mente da dove venga.
  if (nome.includes('/') || nome.includes('\\') || nome.includes('..')) {
    throw new ArchivioError('Nome del documento non valido.');
  }
  return join('exports', orderId, generazione, nome);
}

export async function salvaDocumento(relativo: string, dati: Uint8Array): Promise<number> {
  const assoluto = percorsoAssoluto(relativo);
  await mkdir(dirname(assoluto), { recursive: true });
  // `wx`: la cartella di generazione è nuova, quindi il file non può esserci.
  // Se c'è, qualcosa è andato storto e sovrascriverlo nasconderebbe il
  // problema invece di mostrarlo.
  await writeFile(assoluto, dati, { flag: 'wx' });
  return dati.byteLength;
}

export async function leggiDocumento(relativo: string): Promise<Buffer> {
  return readFile(percorsoAssoluto(relativo));
}

/** Cancella un singolo documento dal disco. */
export async function rimuoviDocumento(relativo: string): Promise<void> {
  await rm(percorsoAssoluto(relativo), { force: true }).catch(() => {});
}

/** Cancella una generazione intera. Usata quando le righe non si creano. */
export async function rimuoviGenerazione(orderId: string, generazione: string): Promise<void> {
  await rm(percorsoAssoluto(join('exports', orderId, generazione)), {
    recursive: true,
    force: true,
  }).catch(() => {});
}

/**
 * Tutti i documenti di un ordine in un file solo.
 *
 * Chi ordina da tre fornitori scarica tre PDF e un Excel, e li scarica per
 * allegarli: quattro clic e quattro finestre di salvataggio, ogni volta.
 *
 * `store: true`, cioè nessuna compressione: dentro ci sono già un PDF e un
 * xlsx, che sono entrambi archivi compressi. Ricomprimerli costa CPU e non
 * toglie byte.
 */
export async function zipDi(
  file: readonly { nome: string; percorso: string }[],
): Promise<Uint8Array> {
  if (file.length === 0) throw new ArchivioError('Non c’è niente da archiviare.');

  const zip = new ZipArchive({ store: true });
  const pezzi: Buffer[] = [];
  zip.on('data', (pezzo: Buffer) => pezzi.push(pezzo));

  const finito = new Promise<void>((risolvi, rifiuta) => {
    zip.on('end', () => risolvi());
    zip.on('error', rifiuta);
    // `warning` con code ENOENT significa file mancante: qui è un errore vero,
    // perché produrrebbe uno zip a cui manca un allegato senza dirlo.
    zip.on('warning', rifiuta);
  });

  const visti = new Map<string, number>();
  for (const f of file) {
    // Due template diversi potrebbero produrre lo stesso nome: nello zip un
    // duplicato sovrascriverebbe il primo in silenzio.
    const quante = visti.get(f.nome) ?? 0;
    visti.set(f.nome, quante + 1);
    const nome = quante === 0 ? f.nome : f.nome.replace(/(\.[^.]+)?$/, `-${quante + 1}$&`);
    zip.append(await leggiDocumento(f.percorso), { name: nome });
  }

  await zip.finalize();
  await finito;
  return new Uint8Array(Buffer.concat(pezzi));
}
