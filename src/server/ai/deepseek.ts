import 'server-only';

import { AiError, type ProviderAi, type RichiestaAi, type RispostaAi } from './provider';

/**
 * DeepSeek.
 *
 * L'unico punto dell'applicazione che conosce la chiave API. Non la
 * restituisce, non la logga, non la scrive da nessuna parte: la usa e basta.
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
const MODELLO = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
const TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 60_000);

/**
 * Prezzo per milione di token, in dollari.
 *
 * Serve a stimare il costo di ogni chiamata e a far scattare il tetto di
 * spesa. E' una **stima**: la fattura vera la fa il provider, e se cambiasse
 * listino questi numeri andrebbero aggiornati. Meglio una stima dichiarata
 * che nessun conto.
 */
const COSTO_PER_MILIONE = {
  ingresso: Number(process.env.DEEPSEEK_COSTO_INGRESSO ?? 0.14),
  uscita: Number(process.env.DEEPSEEK_COSTO_USCITA ?? 0.28),
};

interface RispostaApi {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export function creaDeepSeek(): ProviderAi {
  const chiave = process.env.DEEPSEEK_API_KEY;
  if (!chiave) {
    throw new AiError(
      'DEEPSEEK_API_KEY non configurata. Imposta AI_MOCK=1 per lavorare senza modello.',
    );
  }

  return {
    nome: 'deepseek',
    modello: MODELLO,

    async chiedi(richiesta: RichiestaAi): Promise<RispostaAi> {
      const inizio = performance.now();
      const controller = new AbortController();
      const scadenza = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const risposta = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${chiave}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODELLO,
            messages: [
              { role: 'system', content: richiesta.sistema },
              { role: 'user', content: richiesta.utente },
            ],
            // Zero: su un compito di estrazione la creativita' e' un difetto,
            // e la ripetibilita' rende utile la cache.
            temperature: 0,
            max_tokens: richiesta.massimoToken ?? 2048,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        const corpo = (await risposta.json().catch(() => null)) as RispostaApi | null;
        if (!risposta.ok || !corpo) {
          // Il messaggio del provider puo' contenere frammenti della richiesta:
          // resta nei log, non nella risposta HTTP.
          console.error('DeepSeek ha risposto male:', risposta.status, corpo?.error?.message);
          throw new AiError(`Il modello ha risposto con un errore (${risposta.status}).`);
        }

        const testo = corpo.choices?.[0]?.message?.content;
        if (typeof testo !== 'string') throw new AiError('Il modello non ha restituito testo.');

        // Risposta vuota avendo speso tutto il tetto: il modello ha ragionato
        // fino a esaurire i token e non è arrivato a scrivere niente. Va detto
        // così com'è, perché l'errore che ne usciva a valle — «la risposta non
        // contiene JSON» — manda a cercare un difetto nel formato quando il
        // problema è la dimensione della richiesta.
        if (testo.trim() === '') {
          const usati = corpo.usage?.completion_tokens ?? 0;
          throw new AiError(
            `Il modello non ha risposto: ha esaurito i ${usati} token disponibili ragionando. ` +
              'Riduci quanti elementi si mandano in una volta, oppure alza il tetto.',
          );
        }

        const tokenIngresso = corpo.usage?.prompt_tokens ?? 0;
        const tokenUscita = corpo.usage?.completion_tokens ?? 0;

        return {
          testo,
          tokenIngresso,
          tokenUscita,
          costoUsd:
            (tokenIngresso / 1_000_000) * COSTO_PER_MILIONE.ingresso +
            (tokenUscita / 1_000_000) * COSTO_PER_MILIONE.uscita,
          modello: MODELLO,
          latenzaMs: Math.round(performance.now() - inizio),
        };
      } catch (errore) {
        if (errore instanceof AiError) throw errore;
        if ((errore as Error).name === 'AbortError') {
          throw new AiError(`Il modello non ha risposto entro ${TIMEOUT_MS / 1000} secondi.`);
        }
        console.error('Chiamata a DeepSeek fallita:', errore);
        throw new AiError('Non è stato possibile contattare il modello.');
      } finally {
        clearTimeout(scadenza);
      }
    },
  };
}
