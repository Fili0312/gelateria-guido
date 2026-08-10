import 'server-only';

import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import {
  entroTempo,
  LimiteConcorrente,
  MAX_GENERAZIONI_PDF_CONCORRENTI,
  MAX_HTML_PDF_BYTES,
  OperazioneScadutaError,
  TIMEOUT_AVVIO_CHROMIUM_MS,
  TIMEOUT_CARICAMENTO_HTML_MS,
  TIMEOUT_GENERAZIONE_PDF_MS,
} from './pdf-limits';

/**
 * Da HTML a PDF, col Chromium che sul server c'è già.
 *
 * ── Perché il browser e non una libreria ────────────────────────────────
 * Un documento d'ordine è una tabella con un'intestazione e dei totali:
 * esattamente ciò che l'HTML e il CSS fanno bene e che una libreria di
 * disegno PDF fa posizionando rettangoli a mano. Con il browser il template è
 * una pagina — la si apre in un browser normale per vederla, la si cambia
 * senza ricompilare niente, e le interruzioni di pagina su una tabella lunga
 * le gestisce lui.
 *
 * Il prezzo è un processo esterno da avviare. Lo si paga **una volta per
 * infornata**: `conStampante` apre il browser, ci passa dentro tutti i PDF di
 * un ordine e lo chiude. Tre fornitori costano un avvio, non tre.
 */

export class PdfError extends Error {
  override readonly name = 'PdfError';
}

export class PdfCapacityError extends Error {
  override readonly name = 'PdfCapacityError';
}

export class PdfTimeoutError extends Error {
  override readonly name = 'PdfTimeoutError';
}

type GlobalePdf = typeof globalThis & { __gelateriaPdfLimit?: LimiteConcorrente };
const globalePdf = globalThis as GlobalePdf;
const LIMITE_GLOBALE = (globalePdf.__gelateriaPdfLimit ??= new LimiteConcorrente(
  MAX_GENERAZIONI_PDF_CONCORRENTI,
));

/**
 * Il binario di Chromium.
 *
 * `CHROMIUM_PATH` ha la precedenza perché il browser non è installato da
 * questo progetto — sta nella cache condivisa della macchina, e il giorno che
 * si sposta o che si aggiorna playwright-core la variabile evita di dover
 * ricostruire l'applicazione per cambiare un percorso.
 */
export function percorsoChromium(): string {
  const dallAmbiente = process.env.CHROMIUM_PATH;
  if (dallAmbiente) {
    if (!existsSync(dallAmbiente)) {
      throw new PdfError(`CHROMIUM_PATH punta a un file che non esiste: ${dallAmbiente}`);
    }
    return dallAmbiente;
  }
  const atteso = chromium.executablePath();
  if (!existsSync(atteso)) {
    throw new PdfError(
      `Chromium non trovato in ${atteso}. Installalo con «pnpm exec playwright install chromium» ` +
        'oppure indica un binario esistente con CHROMIUM_PATH.',
    );
  }
  return atteso;
}

/**
 * Gli argomenti di avvio.
 *
 * **Il sandbox resta acceso.** In produzione il servizio gira come
 * `gelateria-app`, non come root, e lì il sandbox parte senza problemi:
 * spegnerlo sarebbe stato buttare via una barriera vera per comodità. Si
 * disattiva **solo** girando da root — cioè negli script di collaudo — perché
 * in quel caso Chromium si rifiuta di partire e basta.
 */
function argomenti(): string[] {
  const daRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  // `/dev/shm` piccolo fa morire Chromium a metà rendering, e succede solo
  // con documenti lunghi: il guasto arriverebbe quando l'ordine è grosso.
  return daRoot ? ['--no-sandbox', '--disable-dev-shm-usage'] : ['--disable-dev-shm-usage'];
}

/**
 * Una `HOME` scrivibile per Chromium.
 *
 * Il servizio gira con `HOME=/nonexistent` — è la scelta giusta per un demone
 * che non deve avere una cartella personale. Ma Chromium ci vuole scrivere il
 * suo crashpad, e senza riuscirci **muore all'avvio**, con un errore che
 * parla di `--database is required` e non ha niente a che vedere con la
 * causa: ci si perde un pomeriggio.
 *
 * Si passa una cartella sotto quella temporanea, che con `PrivateTmp=yes` è
 * privata del servizio e sparisce al riavvio. La correzione sta qui e non
 * nell'unità systemd perché è un'esigenza di Chromium, non del servizio:
 * cambiare `HOME` a tutto il processo per accontentare una libreria sposta il
 * problema addosso a chiunque altro legga `HOME`.
 */
function casaPerChromium(): string {
  const cartella = join(tmpdir(), 'chromium-gelateria');
  mkdirSync(cartella, { recursive: true });
  return cartella;
}

/** Apre un browser, esegue il lavoro, lo chiude comunque vada. */
export async function conStampante<T>(
  lavoro: (stampaPdf: (html: string) => Promise<Uint8Array>) => Promise<T>,
): Promise<T> {
  const rilascia = LIMITE_GLOBALE.provaAcquisire();
  if (!rilascia) {
    throw new PdfCapacityError(
      'Sono già in corso troppe generazioni PDF. Attendi che finiscano e riprova.',
    );
  }

  let browser: Browser;
  try {
    browser = await entroTempo(
      chromium.launch({
        executablePath: percorsoChromium(),
        args: argomenti(),
        env: { ...process.env, HOME: casaPerChromium() },
        timeout: TIMEOUT_AVVIO_CHROMIUM_MS,
      }),
      TIMEOUT_AVVIO_CHROMIUM_MS,
    );
  } catch (errore) {
    rilascia();
    if (errore instanceof OperazioneScadutaError) {
      throw new PdfTimeoutError('Chromium non si è avviato entro 30 secondi.');
    }
    throw new PdfError(
      `Non è stato possibile avviare Chromium: ${errore instanceof Error ? errore.message : String(errore)}`,
    );
  }

  try {
    try {
      return await entroTempo(
        lavoro(async (html) => {
          if (Buffer.byteLength(html, 'utf8') > MAX_HTML_PDF_BYTES) {
            throw new PdfError('Il documento è troppo grande per essere trasformato in PDF.');
          }
          const pagina = await browser.newPage();
          try {
            // `setContent` e non un file temporaneo: niente da scrivere su disco
            // e niente da ripulire se il processo muore a metà.
            await pagina.setContent(html, {
              waitUntil: 'load',
              timeout: TIMEOUT_CARICAMENTO_HTML_MS,
            });
            const pdf = await pagina.pdf({
              format: 'A4',
              printBackground: true,
              margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
              // I margini sopra li riempiono intestazione e piè di pagina del
              // template, che deve poterci mettere il numero di pagina.
              displayHeaderFooter: true,
              headerTemplate: '<span></span>',
              footerTemplate:
                '<div style="width:100%;font-size:8px;color:#737373;padding:0 12mm;' +
                'display:flex;justify-content:space-between;font-family:sans-serif">' +
                '<span class="title"></span>' +
                '<span>pagina <span class="pageNumber"></span> di <span class="totalPages"></span></span>' +
                '</div>',
            });
            if (pdf.length === 0) throw new PdfError('Chromium ha prodotto un PDF vuoto.');
            return new Uint8Array(pdf);
          } finally {
            await pagina.close().catch(() => {});
          }
        }),
        TIMEOUT_GENERAZIONE_PDF_MS,
        () => browser.close().catch(() => {}),
      );
    } catch (errore) {
      if (errore instanceof OperazioneScadutaError) {
        throw new PdfTimeoutError('La generazione PDF ha superato il limite di 120 secondi.');
      }
      throw errore;
    }
  } finally {
    await browser.close().catch(() => {});
    rilascia();
  }
}
