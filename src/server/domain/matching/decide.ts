import type { PunteggioAbbinamento } from './score';

/**
 * Dalla somiglianza alla decisione.
 *
 * Tre esiti, e la differenza fra loro è chi decide:
 *
 *  - `AUTO` — abbina da solo. Riservato ai casi in cui non c'è margine di
 *    dubbio: codice del fornitore già visto, alias confermato da un umano,
 *    somiglianza altissima **con formato identico**.
 *  - `PENDING` — propone e aspetta. È la zona grigia, e finisce in revisione.
 *  - `NUOVO` — nessun candidato credibile: si crea un prodotto nuovo.
 *
 * Il modo peggiore di sbagliare qui è fondere due prodotti diversi: il prezzo
 * di uno finirebbe nello storico dell'altro, e nessuna schermata lo
 * mostrerebbe come un errore. Per questo le soglie sono alte e la zona grigia
 * è larga: un abbinamento in più da confermare a mano costa trenta secondi,
 * un abbinamento sbagliato costa una caccia al perché fra sei mesi.
 */

export type EsitoAbbinamento = 'AUTO' | 'PENDING' | 'NUOVO';

export type MetodoAbbinamento = 'GTIN' | 'CODE' | 'ALIAS' | 'TRIGRAM' | 'LLM' | 'MANUAL';

export interface SoglieAbbinamento {
  /** Sopra questa, e con formato identico, si abbina da solo. */
  automatica: number;
  /** Sotto questa non si propone nemmeno: si crea un prodotto nuovo. */
  minima: number;
  /** Sotto questa confidenza, l'IA non può far scattare un AUTO. */
  confidenzaIa: number;
  /** Quanti candidati al massimo si mostrano in revisione. */
  massimoCandidati: number;
}

/**
 * Le soglie vivono in `setting`, non nel codice.
 *
 * Vanno tarate sui dati veri, e chi le tara non deve fare un deploy per
 * provare un valore. Questi sono i valori di partenza di ANALISI §5.2.
 */
export const SOGLIE_PREDEFINITE: SoglieAbbinamento = {
  automatica: 0.92,
  minima: 0.65,
  confidenzaIa: 0.85,
  massimoCandidati: 5,
};

export interface DecisioneAbbinamento {
  esito: EsitoAbbinamento;
  metodo: MetodoAbbinamento;
  punteggio: number;
  /** Perché si è deciso così: si mostra in revisione, non nei log. */
  motivo: string;
}

/**
 * Decide sulla base del punteggio testuale.
 *
 * Non gestisce i casi certi — codice fornitore e alias — che stanno a monte
 * nella cascata e non passano di qui: se ci passassero, una soglia numerica
 * potrebbe respingere un abbinamento che un umano aveva già confermato.
 */
export function decidiDaPunteggio(
  candidato: PunteggioAbbinamento,
  soglie: SoglieAbbinamento = SOGLIE_PREDEFINITE,
): DecisioneAbbinamento {
  if (!candidato.formato.compatibile) {
    return {
      esito: 'NUOVO',
      metodo: 'TRIGRAM',
      punteggio: 0,
      motivo: `Formato incompatibile (${candidato.formato.motivo}): sono due prodotti diversi.`,
    };
  }

  if (candidato.punteggio >= soglie.automatica) {
    return {
      esito: 'AUTO',
      metodo: 'TRIGRAM',
      punteggio: candidato.punteggio,
      motivo: `Somiglianza ${candidato.punteggio} e stesso formato.`,
    };
  }

  if (candidato.punteggio >= soglie.minima) {
    return {
      esito: 'PENDING',
      metodo: 'TRIGRAM',
      punteggio: candidato.punteggio,
      motivo: `Somiglianza ${candidato.punteggio}: plausibile ma non certo, decide una persona.`,
    };
  }

  return {
    esito: 'NUOVO',
    metodo: 'TRIGRAM',
    punteggio: candidato.punteggio,
    motivo: `Somiglianza ${candidato.punteggio}, troppo bassa per proporre un abbinamento.`,
  };
}

export interface RispostaArbitrato {
  stesso: boolean;
  confidenza: number;
  motivo?: string | null;
}

/**
 * L'arbitrato del modello sulla zona grigia.
 *
 * **L'IA non decide mai da sola.** Anche quando è sicura, il risultato è un
 * `AUTO` che l'interfaccia mostra evidenziato: la revisione della Fase 10 lo
 * vede diverso da un abbinamento per alias. E sotto la soglia di confidenza
 * la sua risposta non vale più di un suggerimento — resta `PENDING`.
 *
 * Un «no» del modello non crea un prodotto nuovo da solo: lo dice, e la
 * decisione resta all'operatore. Sbagliare un «sono diversi» è meno visibile
 * che sbagliare un «sono uguali», ma produce due prodotti duplicati che
 * nessuno noterà mai.
 */
export function decidiDaArbitrato(
  risposta: RispostaArbitrato,
  punteggio: number,
  soglie: SoglieAbbinamento = SOGLIE_PREDEFINITE,
): DecisioneAbbinamento {
  const confidenza = Number.isFinite(risposta.confidenza)
    ? Math.min(1, Math.max(0, risposta.confidenza))
    : 0;
  const motivo = risposta.motivo?.trim();

  if (risposta.stesso && confidenza >= soglie.confidenzaIa) {
    return {
      esito: 'AUTO',
      metodo: 'LLM',
      punteggio,
      motivo: `Il modello lo dà per lo stesso prodotto con confidenza ${confidenza.toFixed(2)}${
        motivo ? `: ${motivo}` : '.'
      }`,
    };
  }

  return {
    esito: 'PENDING',
    metodo: 'LLM',
    punteggio,
    motivo: risposta.stesso
      ? `Il modello propende per lo stesso prodotto ma con confidenza ${confidenza.toFixed(2)}, sotto la soglia: decide una persona.`
      : `Il modello li dà per diversi${motivo ? ` (${motivo})` : ''}: conferma tu prima di creare un prodotto nuovo.`,
  };
}

/** L'abbinamento certo per codice o alias: nessuna soglia da superare. */
export function decisioneCerta(
  metodo: 'CODE' | 'ALIAS' | 'GTIN',
  motivo: string,
): DecisioneAbbinamento {
  return { esito: 'AUTO', metodo, punteggio: 1, motivo };
}
