import { Decimal } from 'decimal.js';

/**
 * La regola di riconciliazione.
 *
 * È il cuore della Fase 10 e la logica che decide se il catalogo resta pulito
 * o diventa un macello. Modulo **puro**: nessun database, nessuna rete — così
 * la si può mettere alla prova su casi costruiti a mano, che è l'unico modo
 * di essere sicuri di una regola che tocca prezzi e storico.
 *
 * ── Il perimetro ────────────────────────────────────────────────────────
 * Si confronta **solo** ciò che appartiene allo stesso fornitore e alla stessa
 * copertura. Mai oltre. È la ragione per cui la copertura esiste: senza,
 * caricare «liquori» di Cecconi farebbe risultare spariti tutti i suoi vini —
 * il modo peggiore di sbagliare, perché sembra un aggiornamento riuscito.
 *
 * ── L'identità di un prodotto ───────────────────────────────────────────
 * Codice fornitore **e** confezione **e** pezzi **e** formato. Non il solo
 * codice: un fornitore che passa dal collo da 24 a quello da 12 riusa lo
 * stesso codice, e aggiornare solo il prezzo farebbe sembrare un
 * dimezzamento di prezzo quello che è un dimezzamento di confezione.
 */

export type EsitoRiconciliazione =
  /** Tutto coincide: si aggiorna solo il prezzo. */
  | 'PREZZO_AGGIORNATO'
  /** Tutto coincide e anche il prezzo: non si scrive niente. */
  | 'INVARIATO'
  /** Stesso codice, confezione o formato diversi: **non** si decide da soli. */
  | 'CONFEZIONE_CAMBIATA'
  /** Codice mai visto per questo fornitore: si crea. */
  | 'NUOVO'
  /** Era a catalogo, nel file non c'è più: si disattiva. */
  | 'SPARITO';

/** L'identità completa di un'offerta, come la definisce la regola. */
export interface Identita {
  supplierCode: string | null;
  unitaDiVendita: string | null;
  packQuantity: number;
  unitSize: Decimal;
  unitOfMeasure: string;
}

export interface OffertaACatalogo extends Identita {
  supplierProductId: string;
  /** Il prezzo netto attualmente in vigore, se c'è. */
  prezzoNetto: Decimal | null;
  active: boolean;
}

export interface RigaDelFile extends Identita {
  /** Chiave della riga nel listino. */
  chiave: string;
  prezzoNetto: Decimal | null;
  /** `false` quando l'operatore l'ha esclusa dalla revisione. */
  inclusa: boolean;
}

export interface Confronto {
  esito: EsitoRiconciliazione;
  chiaveRiga: string | null;
  supplierProductId: string | null;
  /** Cosa è cambiato, quando qualcosa è cambiato: si mostra in revisione. */
  differenze: string[];
  prezzoPrima: Decimal | null;
  prezzoDopo: Decimal | null;
  /** Variazione percentuale, quando entrambi i prezzi ci sono. */
  variazionePct: Decimal | null;
}

/** Due formati sono lo stesso formato se coincidono a meno di un millesimo. */
function stessoFormato(a: Identita, b: Identita): boolean {
  return (
    a.unitOfMeasure === b.unitOfMeasure &&
    a.unitSize.minus(b.unitSize).abs().lte('0.001')
  );
}

function stessaConfezione(a: Identita, b: Identita): boolean {
  const um = (v: string | null) => (v ?? '').trim().toUpperCase();
  return a.packQuantity === b.packQuantity && um(a.unitaDiVendita) === um(b.unitaDiVendita);
}

function differenzeFra(catalogo: Identita, file: Identita): string[] {
  const diff: string[] = [];
  if (catalogo.packQuantity !== file.packQuantity) {
    diff.push(`pezzi per confezione: ${catalogo.packQuantity} → ${file.packQuantity}`);
  }
  const umA = (catalogo.unitaDiVendita ?? '').toUpperCase();
  const umB = (file.unitaDiVendita ?? '').toUpperCase();
  if (umA !== umB) diff.push(`unità di vendita: ${umA || '—'} → ${umB || '—'}`);
  if (!stessoFormato(catalogo, file)) {
    diff.push(
      `formato: ${catalogo.unitSize} ${catalogo.unitOfMeasure} → ${file.unitSize} ${file.unitOfMeasure}`,
    );
  }
  return diff;
}

function variazione(prima: Decimal | null, dopo: Decimal | null): Decimal | null {
  if (!prima || !dopo || prima.lte(0)) return null;
  return dopo.minus(prima).div(prima).mul(100).toDecimalPlaces(2);
}

/** La chiave con cui si cerca l'offerta a catalogo: il codice del fornitore. */
function chiaveCodice(codice: string | null): string | null {
  const pulito = codice?.trim().toUpperCase();
  return pulito ? pulito : null;
}

/**
 * Confronta il file con ciò che è già a catalogo.
 *
 * Restituisce un `Confronto` per ogni riga del file **e** per ogni offerta a
 * catalogo che nel file non compare più. Nessuna riga sparisce dal risultato:
 * anche «invariato» è un esito, e va contato nel riepilogo.
 */
export function riconcilia(
  aCatalogo: readonly OffertaACatalogo[],
  nelFile: readonly RigaDelFile[],
): Confronto[] {
  const perCodice = new Map<string, OffertaACatalogo>();
  for (const offerta of aCatalogo) {
    const chiave = chiaveCodice(offerta.supplierCode);
    if (chiave) perCodice.set(chiave, offerta);
  }

  const confronti: Confronto[] = [];
  const visti = new Set<string>();

  for (const riga of nelFile) {
    if (!riga.inclusa) continue;
    const chiave = chiaveCodice(riga.supplierCode);
    const esistente = chiave ? perCodice.get(chiave) : undefined;

    if (!esistente) {
      confronti.push({
        esito: 'NUOVO',
        chiaveRiga: riga.chiave,
        supplierProductId: null,
        differenze: [],
        prezzoPrima: null,
        prezzoDopo: riga.prezzoNetto,
        variazionePct: null,
      });
      continue;
    }

    visti.add(esistente.supplierProductId);
    const differenze = differenzeFra(esistente, riga);

    if (differenze.length > 0 || !stessaConfezione(esistente, riga)) {
      // Il ramo delicato. Non si decide da soli: aggiornare in silenzio
      // farebbe sembrare un dimezzamento di prezzo quello che è un
      // dimezzamento di confezione, e falserebbe lo storico e ogni confronto
      // futuro. Sono pochi casi per import, e sono quelli in cui sbagliare
      // costa caro.
      confronti.push({
        esito: 'CONFEZIONE_CAMBIATA',
        chiaveRiga: riga.chiave,
        supplierProductId: esistente.supplierProductId,
        differenze,
        prezzoPrima: esistente.prezzoNetto,
        prezzoDopo: riga.prezzoNetto,
        variazionePct: variazione(esistente.prezzoNetto, riga.prezzoNetto),
      });
      continue;
    }

    const invariato =
      esistente.prezzoNetto !== null &&
      riga.prezzoNetto !== null &&
      esistente.prezzoNetto.equals(riga.prezzoNetto);

    confronti.push({
      // Prezzo identico: non si scrive una riga nello storico. Uno storico
      // pieno di righe uguali non racconta niente e rende illeggibile il
      // grafico.
      esito: invariato ? 'INVARIATO' : 'PREZZO_AGGIORNATO',
      chiaveRiga: riga.chiave,
      supplierProductId: esistente.supplierProductId,
      differenze: [],
      prezzoPrima: esistente.prezzoNetto,
      prezzoDopo: riga.prezzoNetto,
      variazionePct: variazione(esistente.prezzoNetto, riga.prezzoNetto),
    });
  }

  // Ciò che era a catalogo e nel file non c'è più.
  //
  // **Solo** dentro il perimetro (fornitore + copertura), e solo fra le
  // offerte ancora attive: `aCatalogo` arriva già filtrato da chi chiama, ed è
  // lì che il perimetro viene imposto.
  for (const offerta of aCatalogo) {
    if (visti.has(offerta.supplierProductId) || !offerta.active) continue;
    confronti.push({
      esito: 'SPARITO',
      chiaveRiga: null,
      supplierProductId: offerta.supplierProductId,
      differenze: [],
      prezzoPrima: offerta.prezzoNetto,
      prezzoDopo: null,
      variazionePct: null,
    });
  }

  return confronti;
}

export interface RiepilogoImport {
  nuovi: number;
  aggiornati: number;
  invariati: number;
  confezioneCambiata: number;
  spariti: number;
  aumentati: number;
  diminuiti: number;
  /** Variazioni oltre la soglia: vanno guardate prima di applicare. */
  anomale: number;
}

/** Oltre questa variazione percentuale, il prezzo va confermato a mano. */
export const VARIAZIONE_ANOMALA_PCT = 40;

export function riepiloga(
  confronti: readonly Confronto[],
  sogliaAnomala: number = VARIAZIONE_ANOMALA_PCT,
): RiepilogoImport {
  const conta = (esito: EsitoRiconciliazione) => confronti.filter((c) => c.esito === esito).length;
  const variazioni = confronti.filter((c) => c.variazionePct !== null && c.esito === 'PREZZO_AGGIORNATO');

  return {
    nuovi: conta('NUOVO'),
    aggiornati: conta('PREZZO_AGGIORNATO'),
    invariati: conta('INVARIATO'),
    confezioneCambiata: conta('CONFEZIONE_CAMBIATA'),
    spariti: conta('SPARITO'),
    aumentati: variazioni.filter((c) => c.variazionePct!.gt(0)).length,
    diminuiti: variazioni.filter((c) => c.variazionePct!.lt(0)).length,
    anomale: variazioni.filter((c) => c.variazionePct!.abs().gt(sogliaAnomala)).length,
  };
}
