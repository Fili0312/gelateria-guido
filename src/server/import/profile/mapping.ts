import { Decimal } from 'decimal.js';
import { applicaSconti } from '../../domain/pricing/discounts';

/**
 * Il profilo di un fornitore: quale colonna contiene cosa.
 *
 * È il cuore della Fase 8, e la ragione per cui l'IA diventa progressivamente
 * superflua. Una volta stabilito che nei listini Cecconi la colonna 4 è il
 * prezzo e le 5-6 sono gli sconti, tutti i listini Cecconi successivi si
 * leggono senza chiamare nessun modello.
 *
 * ── Perché questo modulo non sa niente dell'IA ──────────────────────────
 * Qui dentro c'è solo: dato un profilo, applicalo; e dato un insieme di
 * righe, dimmi se un profilo le spiega. Chi il profilo lo *indovina* — con
 * l'aritmetica o con un modello — sta altrove. La separazione serve a poter
 * verificare l'applicazione senza rete e senza chiave API.
 */

/** L'indice di una colonna, oppure `null` quando il listino non ha quel dato. */
export type Colonna = number | null;

export interface ProfiloColonne {
  codice: Colonna;
  descrizione: Colonna;
  /** La quantità della riga. Nei preventivi vale sempre 1 e NON è la confezione. */
  quantita: Colonna;
  /** Il codice U.M. del fornitore: BT, CO, UN… Serve a sapere se si compra a pezzo o a collo. */
  unitaDiVendita: Colonna;
  prezzoListino: Colonna;
  /** Le colonne degli sconti in cascata, nell'ordine in cui vanno applicati. */
  sconti: number[];
  prezzoNetto: Colonna;
  iva: Colonna;
}

export const PROFILO_VUOTO: ProfiloColonne = {
  codice: null,
  descrizione: null,
  quantita: null,
  unitaDiVendita: null,
  prezzoListino: null,
  sconti: [],
  prezzoNetto: null,
  iva: null,
};

/** Una riga come esce dal segmentatore: le celle in ordine di colonna. */
export interface RigaCelle {
  /** Il testo di ogni cella, indicizzato per **colonna riconosciuta**. */
  celle: { testo: string; colonna: number }[];
}

export interface RigaStrutturata {
  codice: string | null;
  descrizione: string | null;
  quantita: string | null;
  unitaDiVendita: string | null;
  prezzoListino: string | null;
  sconti: number[];
  prezzoNetto: string | null;
  iva: string | null;
}

/** Un numero come lo scrivono i listini italiani: `1.234,56` → `1234.56`. */
export function numeroItaliano(testo: string): Decimal | null {
  const pulito = testo.trim().replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(pulito)) return null;
  try {
    const n = new Decimal(pulito);
    return n.isFinite() ? n : null;
  } catch {
    return null;
  }
}

function cella(riga: RigaCelle, colonna: Colonna): string | null {
  if (colonna === null) return null;
  const trovata = riga.celle.find((c) => c.colonna === colonna);
  const testo = trovata?.testo.trim();
  return testo ? testo : null;
}

/**
 * Applica il profilo a una riga: da celle anonime a campi con un nome.
 *
 * Non valida e non converte: prende il testo dov'è dichiarato che stia. La
 * validazione è un passo a parte, di proposito — così un profilo sbagliato
 * produce campi *implausibili* e visibili, invece di un errore che nasconde
 * quale colonna fosse stata letta male.
 */
export function applicaProfilo(riga: RigaCelle, profilo: ProfiloColonne): RigaStrutturata {
  const sconti: number[] = [];
  for (const colonna of profilo.sconti) {
    const testo = cella(riga, colonna);
    if (!testo) continue;
    const n = numeroItaliano(testo);
    // Uno sconto a zero è un dato — la colonna c'è ed è vuota di sconto — ma
    // non va nella cascata: moltiplicare per (1 − 0) è un giro a vuoto che
    // sporca la catena mostrata all'operatore.
    if (n && n.gt(0) && n.lt(100)) sconti.push(n.toNumber());
  }

  return {
    codice: cella(riga, profilo.codice),
    descrizione: cella(riga, profilo.descrizione),
    quantita: cella(riga, profilo.quantita),
    unitaDiVendita: cella(riga, profilo.unitaDiVendita),
    prezzoListino: cella(riga, profilo.prezzoListino),
    sconti,
    prezzoNetto: cella(riga, profilo.prezzoNetto),
    iva: cella(riga, profilo.iva),
  };
}

/**
 * Il profilo torna, su questa riga?
 *
 * È la domanda che rende la Fase 8 molto meno dipendente dall'IA di quanto
 * sembri. Quando un listino dichiara **sia** il prezzo di listino **sia** gli
 * sconti **sia** il netto, la mappatura non è un'opinione: o l'aritmetica
 * torna, o le colonne sono state lette male.
 *
 *   4,61 × (1−0,06) × (1−0,10) = 3,90   → il profilo è giusto, dimostrato
 *
 * Restituisce `null` quando la verifica non è possibile (manca il netto o il
 * listino): «non lo so» e «è sbagliato» sono risposte diverse, e confonderle
 * farebbe scartare i listini che semplicemente non espongono il netto.
 */
export function profiloTornaSullaRiga(
  strutturata: RigaStrutturata,
  tolleranza: Decimal.Value = '0.01',
): boolean | null {
  const listino = strutturata.prezzoListino ? numeroItaliano(strutturata.prezzoListino) : null;
  const netto = strutturata.prezzoNetto ? numeroItaliano(strutturata.prezzoNetto) : null;
  if (!listino || !netto || listino.lte(0)) return null;

  const calcolato = applicaSconti(listino, strutturata.sconti);
  return calcolato.minus(netto).abs().lte(new Decimal(tolleranza));
}

export interface EsitoVerifica {
  /** Righe su cui l'aritmetica è verificabile e torna. */
  confermate: number;
  /** Righe su cui è verificabile e **non** torna: il profilo è sbagliato. */
  smentite: number;
  /** Righe su cui non si può dire nulla (manca il netto o il listino). */
  mute: number;
  /** `confermate / (confermate + smentite)`, oppure `null` se nessuna parla. */
  quota: number | null;
}

/**
 * Mette alla prova un profilo su un campione di righe.
 *
 * Una sola riga che torna può essere un caso; centottantanove no. È la misura
 * con cui si decide se un profilo si può usare senza chiedere niente a
 * nessuno.
 */
export function verificaProfilo(
  righe: readonly RigaCelle[],
  profilo: ProfiloColonne,
  tolleranza?: Decimal.Value,
): EsitoVerifica {
  let confermate = 0;
  let smentite = 0;
  let mute = 0;

  for (const riga of righe) {
    const esito = profiloTornaSullaRiga(applicaProfilo(riga, profilo), tolleranza);
    if (esito === null) mute += 1;
    else if (esito) confermate += 1;
    else smentite += 1;
  }

  const parlanti = confermate + smentite;
  return { confermate, smentite, mute, quota: parlanti > 0 ? confermate / parlanti : null };
}
