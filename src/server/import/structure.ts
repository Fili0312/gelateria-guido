import 'server-only';

import { chiediAlModello, leggiRisposta, type ProviderAi } from '@/server/ai';
import {
  rispostaProfiloSchema,
  rispostaRigheSchema,
  SISTEMA_PROFILO,
  SISTEMA_RIGHE,
  utenteProfilo,
  utenteRighe,
  VERSIONE_PROMPT,
} from '@/server/ai/prompts';
import { deduciProfilo, medianaColonna, SOGLIA_ARITMETICA } from './profile/infer';
import {
  applicaProfilo,
  verificaProfilo,
  type ProfiloColonne,
  type RigaCelle,
} from './profile/mapping';
import { validaTutte, type EsitoValidazione } from './validate';

/**
 * Dalle righe grezze ai campi, con l'IA usata solo dove serve davvero.
 *
 * L'ordine è deliberato e ribalta l'aspettativa della roadmap:
 *
 *  1. si prova a **dedurre** il profilo dall'aritmetica del documento;
 *  2. **solo se non si riesce** si chiede al modello;
 *  3. il profilo, comunque ottenuto, struttura tutte le righe in modo
 *     deterministico;
 *  4. le righe che restano senza prezzo vanno all'IA a lotti.
 *
 * Sui tre listini della gelateria il passo 1 basta: 142, 189 e 33 righe con
 * il conto che torna, zero chiamate. Non è un'ottimizzazione, è la differenza
 * fra un'estrazione **dimostrata** e una plausibile.
 */

export type FonteProfilo = 'aritmetica' | 'indizi' | 'ia' | 'salvato';

export interface EsitoStrutturazione {
  profilo: ProfiloColonne;
  fonteProfilo: FonteProfilo;
  /** Quante righe confermano il profilo con l'aritmetica. */
  confermate: number;
  smentite: number;
  validazione: EsitoValidazione;
  chiamateIa: number;
  costoUsd: number;
}

/** Quante righe si mandano al modello in un colpo. Piccoli, perché una
 *  risposta troncata perde tutto il lotto e non solo l'ultima riga. */
const DIMENSIONE_LOTTO_IA = 8;

export interface OpzioniStrutturazione {
  organizationId: string;
  priceListId?: string | null;
  /** Un profilo già salvato per questo fornitore: se c'è e regge, si riusa. */
  profiloSalvato?: ProfiloColonne | null;
  intestazioni?: readonly string[];
  provider?: ProviderAi;
}

/**
 * Chiede al modello quali colonne siano quali.
 *
 * Si chiama solo quando l'aritmetica non ha potuto decidere. La risposta
 * viene validata con zod e poi **rimessa alla prova** con lo stesso conto: se
 * neanche così torna, si tiene lo stesso, ma la fase resta dichiarata come
 * non provata e l'operatore la vede.
 */
async function chiediProfilo(
  righe: readonly RigaCelle[],
  opzioni: OpzioniStrutturazione,
): Promise<{ profilo: Partial<ProfiloColonne>; costoUsd: number; chiamate: number }> {
  const esito = await chiediAlModello(
    {
      sistema: SISTEMA_PROFILO,
      utente: utenteProfilo(righe, opzioni.intestazioni),
      versionePrompt: VERSIONE_PROMPT,
      massimoToken: 512,
    },
    {
      organizationId: opzioni.organizationId,
      scopo: 'INFER_PROFILE',
      priceListId: opzioni.priceListId,
    },
    opzioni.provider,
  );

  const risposta = leggiRisposta(esito.testo, rispostaProfiloSchema);
  return {
    profilo: {
      codice: risposta.codice,
      descrizione: risposta.descrizione,
      quantita: risposta.quantita,
      unitaDiVendita: risposta.unitaDiVendita,
      prezzoListino: risposta.prezzoListino,
      sconti: risposta.sconti,
      prezzoNetto: risposta.prezzoNetto,
      iva: risposta.iva,
    },
    costoUsd: esito.daCache ? 0 : esito.costoUsd,
    chiamate: esito.daCache ? 0 : 1,
  };
}

/**
 * Struttura un listino.
 *
 * Restituisce **anche** come ci è arrivato: `aritmetica` significa dimostrato,
 * `ia` significa proposto. Sono due cose diverse e l'interfaccia le mostra
 * diverse, perché un operatore che rivede un import deve sapere dove guardare
 * con più attenzione.
 */
export async function strutturaListino(
  righe: readonly RigaCelle[],
  opzioni: OpzioniStrutturazione,
): Promise<EsitoStrutturazione> {
  let chiamateIa = 0;
  let costoUsd = 0;

  const dedotto = deduciProfilo(righe);
  let profilo = dedotto.profilo;
  let fonte: FonteProfilo = dedotto.fonte === 'aritmetica' ? 'aritmetica' : 'indizi';

  // Il profilo salvato del fornitore vince **se regge ancora**, e la
  // differenza fra «vince» e «vince se regge» è tutta.
  //
  // Un profilo archiviato non si applica mai a scatola chiusa: si rimette
  // alla prova con lo stesso conto che l'aveva dimostrato. Un fornitore che
  // cambia impaginazione, o una copertura diversa dello stesso fornitore,
  // produrrebbero altrimenti righe sbagliate per sempre — e senza fallire,
  // che è il modo peggiore. È successo davvero: il profilo dei liquori
  // Cecconi applicato ai suoi vini leggeva 0 righe su 33.
  const salvatoRegge =
    opzioni.profiloSalvato !== null &&
    opzioni.profiloSalvato !== undefined &&
    (verificaProfilo(righe, opzioni.profiloSalvato).quota ?? 0) >= SOGLIA_ARITMETICA;

  if (salvatoRegge) {
    profilo = opzioni.profiloSalvato!;
    fonte = 'salvato';
  } else if (dedotto.fonte !== 'aritmetica') {
    // Qui, e solo qui, si spende.
    try {
      const chiesto = await chiediProfilo(righe, opzioni);
      profilo = { ...profilo, ...chiesto.profilo };
      fonte = 'ia';
      chiamateIa += chiesto.chiamate;
      costoUsd += chiesto.costoUsd;
    } catch (errore) {
      // Se il modello non risponde si va avanti con quello che si è dedotto:
      // un'estrazione parziale che l'operatore corregge è meglio di un import
      // che non parte.
      console.error('Inferenza del profilo con IA fallita, si prosegue con gli indizi:', errore);
    }
  }

  const strutturate = righe.map((r) => applicaProfilo(r, profilo));
  const validazione = validaTutte(strutturate, {
    medianaListino:
      profilo.prezzoListino !== null ? medianaColonna(righe, profilo.prezzoListino) : null,
  });

  const verifica = dedotto.verifica;
  return {
    profilo,
    fonteProfilo: fonte,
    confermate: verifica.confermate,
    smentite: verifica.smentite,
    validazione,
    chiamateIa,
    costoUsd,
  };
}

/**
 * Il ripiego riga per riga, per le righe che il profilo non spiega.
 *
 * Si usa quando dopo la strutturazione restano righe senza prezzo: sono
 * quelle con un'impaginazione fuori standard, e sono l'unico caso in cui
 * mandare il testo grezzo al modello ha senso.
 */
export async function strutturaRigheResidue(
  righe: readonly { indice: number; testo: string }[],
  opzioni: OpzioniStrutturazione,
): Promise<{ righe: Map<number, Record<string, unknown>>; chiamate: number; costoUsd: number }> {
  const risultato = new Map<number, Record<string, unknown>>();
  let chiamate = 0;
  let costoUsd = 0;

  for (let i = 0; i < righe.length; i += DIMENSIONE_LOTTO_IA) {
    const lotto = righe.slice(i, i + DIMENSIONE_LOTTO_IA);
    const esito = await chiediAlModello(
      {
        sistema: SISTEMA_RIGHE,
        utente: utenteRighe(lotto),
        versionePrompt: VERSIONE_PROMPT,
        massimoToken: 1024,
      },
      {
        organizationId: opzioni.organizationId,
        scopo: 'EXTRACT_ROWS',
        priceListId: opzioni.priceListId,
      },
      opzioni.provider,
    );
    if (!esito.daCache) {
      chiamate += 1;
      costoUsd += esito.costoUsd;
    }

    const risposta = leggiRisposta(esito.testo, rispostaRigheSchema);
    for (const r of risposta.righe) risultato.set(r.indice, r as Record<string, unknown>);
  }

  return { righe: risultato, chiamate, costoUsd };
}
