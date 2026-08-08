import { z } from 'zod';

/**
 * L'interfaccia dietro cui vive qualunque modello.
 *
 * Il resto dell'applicazione non sa che esiste DeepSeek. Vede una funzione
 * che riceve un prompt e restituisce testo con il conto dei token — e questo
 * è ciò che permette al criterio della fase «cambiare `AI_PROVIDER` non
 * richiede modifiche al codice» di essere vero invece che sperato.
 *
 * La chiave API vive **solo** dentro l'implementazione DeepSeek, che gira
 * solo sul server. Non passa da qui, non finisce nei log, non va a database.
 */

export type NomeProvider = 'deepseek' | 'mock';

export interface RichiestaAi {
  /** Istruzioni fisse: cosa deve fare il modello. */
  sistema: string;
  /** I dati su cui lavorare. */
  utente: string;
  /** Serve alla chiave di cache e alla riga di `ai_call`. */
  versionePrompt: string;
  /** Tetto di token in uscita: una risposta troncata è meglio di una infinita. */
  massimoToken?: number;
}

export interface RispostaAi {
  testo: string;
  tokenIngresso: number;
  tokenUscita: number;
  /** In dollari, come fattura il provider. */
  costoUsd: number;
  modello: string;
  latenzaMs: number;
}

export interface ProviderAi {
  readonly nome: NomeProvider;
  readonly modello: string;
  chiedi(richiesta: RichiestaAi): Promise<RispostaAi>;
}

export class AiError extends Error {
  override readonly name = 'AiError';
}

export class AiBudgetError extends Error {
  override readonly name = 'AiBudgetError';
}

/**
 * Estrae il JSON da una risposta.
 *
 * I modelli lo incorniciano volentieri con ```json e con una frase di
 * cortesia. Pretendere che non lo facciano è una battaglia persa; toglierlo
 * costa tre righe.
 */
export function estraiJson(testo: string): unknown {
  const pulito = testo
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(pulito);
  } catch {
    // Ultimo tentativo: il primo oggetto o array bilanciato nel testo.
    const inizio = pulito.search(/[[{]/);
    if (inizio < 0) throw new AiError('La risposta del modello non contiene JSON.');
    const apertura = pulito[inizio]!;
    const chiusura = apertura === '[' ? ']' : '}';
    const fine = pulito.lastIndexOf(chiusura);
    if (fine <= inizio) throw new AiError('La risposta del modello non contiene JSON completo.');
    try {
      return JSON.parse(pulito.slice(inizio, fine + 1));
    } catch {
      throw new AiError('La risposta del modello non è JSON valido.');
    }
  }
}

/** Valida la risposta con uno schema: quello che il modello dice non entra
 *  mai nell'applicazione senza essere stato controllato. */
export function leggiRisposta<T>(testo: string, schema: z.ZodType<T>): T {
  const esito = schema.safeParse(estraiJson(testo));
  if (!esito.success) {
    throw new AiError(
      `La risposta del modello non ha la forma attesa: ${esito.error.issues
        .map((i) => `${i.path.join('.') || 'radice'} ${i.message}`)
        .join('; ')}`,
    );
  }
  return esito.data;
}
