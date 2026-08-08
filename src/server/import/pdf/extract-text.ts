import 'server-only';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { contaParole, leggiBbox, type DocumentoParole } from './bbox';

const esegui = promisify(execFile);

/**
 * L'estrazione del testo da un PDF, con poppler.
 *
 * `pdftotext` è un processo esterno, e questo modulo è l'unico punto in cui
 * viene lanciato. Tre precauzioni, tutte perché il file arriva da fuori:
 *
 *  - **argomenti come array**, mai una stringa di shell: un nome di file con
 *    un apice o un `;` non deve poter diventare un comando;
 *  - **timeout e tetto all'output**, perché un PDF costruito apposta può far
 *    girare a lungo l'estrattore o produrre centinaia di MB;
 *  - **nessun messaggio di poppler nella risposta HTTP**: contiene percorsi
 *    del server.
 */

/** La versione dell'estrattore finisce su `price_list.extractor_version`:
 *  serve a sapere, guardando un listino importato mesi fa, con quali regole
 *  era stato letto. Va alzata quando cambia il comportamento, non la forma. */
export const VERSIONE_ESTRATTORE = 'poppler-1';

const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTE = 64 * 1024 * 1024;

/** Sotto questa soglia di parole per pagina il PDF non ha testo utile. */
const PAROLE_MINIME_PER_PAGINA = 5;

export class PdfSenzaTestoError extends Error {
  override readonly name = 'PdfSenzaTestoError';
}

export class PdfIllegibileError extends Error {
  override readonly name = 'PdfIllegibileError';
}

export interface TestoEstratto {
  documento: DocumentoParole;
  /** Il testo allineato di `-layout`, pagina per pagina. Serve a mostrare
   *  all'operatore la riga com'era, non a decidere le colonne. */
  testoPerPagina: string[];
  pagine: number;
  parole: number;
  versione: string;
}

async function poppler(argomenti: string[]): Promise<string> {
  try {
    const { stdout } = await esegui('pdftotext', argomenti, {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTE,
      encoding: 'utf8',
      windowsHide: true,
    });
    return stdout;
  } catch (errore) {
    // Il messaggio di poppler resta nei log del server e non nella risposta:
    // contiene il percorso del file, che è informazione sull'infrastruttura.
    console.error('pdftotext ha fallito:', errore);
    const causa = errore as { killed?: boolean; code?: unknown };
    if (causa.killed) {
      throw new PdfIllegibileError(
        'La lettura del PDF ha superato il tempo massimo. Il file potrebbe essere troppo grande o danneggiato.',
      );
    }
    throw new PdfIllegibileError(
      'Il PDF non è leggibile. Potrebbe essere danneggiato o protetto da password.',
    );
  }
}

/**
 * Estrae testo e coordinate da un PDF già salvato su disco.
 *
 * Distingue due fallimenti che l'operatore vive in modo diverso:
 * **illeggibile** (file rotto o protetto: non c'è niente da fare) e
 * **scansionato** (il file è a posto ma è una fotografia: serve un altro
 * file, o l'OCR che non abbiamo). Un errore generico costringerebbe a
 * indovinare quale dei due sia.
 */
export async function estraiTesto(percorsoFile: string): Promise<TestoEstratto> {
  const [xml, layout] = await Promise.all([
    poppler(['-bbox-layout', '-enc', 'UTF-8', percorsoFile, '-']),
    poppler(['-layout', '-enc', 'UTF-8', percorsoFile, '-']),
  ]);

  const documento = leggiBbox(xml);
  const parole = contaParole(documento);
  const pagine = documento.pagine.length;

  if (pagine === 0) {
    throw new PdfIllegibileError('Il PDF non contiene pagine leggibili.');
  }

  if (parole < PAROLE_MINIME_PER_PAGINA * pagine) {
    throw new PdfSenzaTestoError(
      `Il PDF sembra scansionato: ${pagine === 1 ? 'la pagina non contiene' : `le ${pagine} pagine non contengono`} testo selezionabile, ` +
        'ma solo immagini. Serve il file originale del fornitore, oppure un PDF con il testo.',
    );
  }

  return {
    documento,
    // `pdftotext` separa le pagine con il carattere di avanzamento modulo.
    testoPerPagina: layout.split('\f').slice(0, pagine),
    pagine,
    parole,
    versione: VERSIONE_ESTRATTORE,
  };
}
