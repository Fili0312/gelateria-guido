import { Decimal } from 'decimal.js';
import { MODO_ARROTONDAMENTO } from '../pricing/discounts';

/**
 * I totali di un ordine.
 *
 * Modulo **puro**: nessun database. È il conto che il fornitore riceverà e
 * che qualcuno confronterà con la fattura, quindi ogni scelta di
 * arrotondamento va fissata qui e provata, non lasciata al punto in cui
 * capita di sommare.
 *
 * ── Cosa significa «quantità» ───────────────────────────────────────────
 * `quantityPacks` sono **confezioni intere**, non pezzi e non litri. Si
 * ordinano cartoni e bottiglie, non 4,5 litri di aranciata: un ordine in
 * unità base andrebbe tradotto in colli da qualcuno, e quel qualcuno
 * sbaglierebbe.
 *
 * ── Cosa significa il prezzo della riga ─────────────────────────────────
 * `prezzoConfezione` è il **netto di una confezione**, cioè esattamente il
 * `price_net` del listino. L'invariante è quella della fattura:
 *
 *     totale riga = prezzo della confezione × numero di confezioni
 *
 * Il prezzo per litro non entra nel conto: serve a **scegliere** il
 * fornitore, non a fatturare. Confonderli darebbe un ordine i cui totali non
 * tornano con nessun documento.
 *
 * ── Perché si arrotonda per riga e poi si somma ─────────────────────────
 * Perché è così che si legge un ordine stampato: chi controlla somma le righe
 * che vede. Arrotondare solo il totale darebbe una colonna che non torna con
 * la sua somma, di un centesimo, e quel centesimo costa più tempo di quanto
 * ne valga la precisione.
 */

/** Due decimali, all'even: la stessa regola dei netti di listino. */
export function arrotondaImporto(valore: Decimal.Value): Decimal {
  return new Decimal(valore).toDecimalPlaces(2, MODO_ARROTONDAMENTO);
}

export interface RigaDaSommare {
  /** Netto di **una** confezione. */
  prezzoConfezione: Decimal.Value;
  /** Quante confezioni: intero, almeno una. */
  confezioni: number;
  /** Aliquota IVA in percentuale. `null` quando il listino non la dichiara. */
  aliquotaIva: Decimal.Value | null;
}

export interface TotaliRiga {
  netto: Decimal;
  iva: Decimal;
  lordo: Decimal;
}

export function totaliRiga(riga: RigaDaSommare): TotaliRiga {
  const netto = arrotondaImporto(new Decimal(riga.prezzoConfezione).mul(riga.confezioni));
  // Senza aliquota dichiarata non si inventa il 22%: l'IVA resta zero e il
  // lordo coincide col netto. Un'aliquota supposta produrrebbe un totale
  // credibile e sbagliato, che è il tipo di errore che nessuno ricontrolla.
  const iva =
    riga.aliquotaIva === null
      ? new Decimal(0)
      : arrotondaImporto(netto.mul(riga.aliquotaIva).div(100));
  return { netto, iva, lordo: netto.plus(iva) };
}

export interface TotaliOrdine {
  /** Quante righe: «12 prodotti» nella barra. */
  righe: number;
  /** Quante confezioni in tutto: «37 confezioni». */
  confezioni: number;
  netto: Decimal;
  iva: Decimal;
  lordo: Decimal;
}

export function totaliOrdine(righe: readonly RigaDaSommare[]): TotaliOrdine {
  let netto = new Decimal(0);
  let iva = new Decimal(0);
  let confezioni = 0;

  for (const riga of righe) {
    const t = totaliRiga(riga);
    netto = netto.plus(t.netto);
    iva = iva.plus(t.iva);
    confezioni += riga.confezioni;
  }

  return { righe: righe.length, confezioni, netto, iva, lordo: netto.plus(iva) };
}

/**
 * Quante confezioni può avere una riga.
 *
 * Zero non è una quantità: è la rimozione della riga, e va chiesta come
 * rimozione. Una riga a zero in un ordine inviato è una domanda a cui il
 * fornitore non sa rispondere.
 */
export const CONFEZIONI_MINIME = 1;
/** Un tetto che nessun ordine vero raggiunge, ma che un dito sul `+` sì. */
export const CONFEZIONI_MASSIME = 9_999;

export function confezioniValide(quantita: number): boolean {
  return (
    Number.isInteger(quantita) && quantita >= CONFEZIONI_MINIME && quantita <= CONFEZIONI_MASSIME
  );
}
