/** Limiti puri della stampa PDF, separati da Playwright per poterli provare. */

export const MAX_GENERAZIONI_PDF_CONCORRENTI = 2;
export const TIMEOUT_AVVIO_CHROMIUM_MS = 30_000;
export const TIMEOUT_GENERAZIONE_PDF_MS = 120_000;
export const TIMEOUT_CARICAMENTO_HTML_MS = 15_000;
export const MAX_HTML_PDF_BYTES = 5_000_000;
export const MAX_DOCUMENTI_PER_GENERAZIONE = 50;

export class LimiteConcorrente {
  private inCorso = 0;

  constructor(readonly massimo: number) {
    if (!Number.isInteger(massimo) || massimo < 1) {
      throw new Error('Il limite concorrente deve essere un intero positivo.');
    }
  }

  /** Restituisce un rilascio idempotente, oppure `null` quando è pieno. */
  provaAcquisire(): (() => void) | null {
    if (this.inCorso >= this.massimo) return null;
    this.inCorso += 1;
    let rilasciato = false;
    return () => {
      if (rilasciato) return;
      rilasciato = true;
      this.inCorso -= 1;
    };
  }
}

export class OperazioneScadutaError extends Error {
  override readonly name = 'OperazioneScadutaError';
}

/** Timeout esplicito; `allaScadenza` serve a interrompere la risorsa esterna. */
export async function entroTempo<T>(
  operazione: Promise<T>,
  millisecondi: number,
  allaScadenza: () => void | Promise<void> = () => {},
): Promise<T> {
  if (!Number.isFinite(millisecondi) || millisecondi < 1) {
    throw new Error('Il timeout deve essere positivo.');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const scadenza = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Il chiamante deve ricevere il timeout anche se la risorsa esterna non
      // collabora alla chiusura. La pulizia parte subito ma resta best-effort:
      // attenderla qui renderebbe il timeout dipendente proprio dal processo
      // bloccato che sta cercando di interrompere.
      try {
        void Promise.resolve(allaScadenza()).catch(() => {});
      } catch {
        // Anche una pulizia sincrona difettosa non nasconde la scadenza.
      }
      reject(new OperazioneScadutaError(`Operazione scaduta dopo ${millisecondi} ms.`));
    }, millisecondi);
  });

  try {
    return await Promise.race([operazione, scadenza]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function numeroDocumentiConsentito(numero: number): boolean {
  return Number.isInteger(numero) && numero >= 1 && numero <= MAX_DOCUMENTI_PER_GENERAZIONE;
}
