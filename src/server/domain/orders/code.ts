/**
 * Il codice dell'ordine.
 *
 * `2026-0042`: l'anno, e poi un progressivo che riparte da uno a gennaio.
 * Sembra un dettaglio estetico e non lo è — è **l'unico riferimento** che
 * l'app e il fornitore hanno in comune. Finisce sul PDF, nell'oggetto
 * dell'email, e sarà quello che il fornitore cita al telefono quando chiama
 * per dire che una cassa manca.
 *
 * ── Perché progressivo e non un id casuale ──────────────────────────────
 * Un cuid è unico e illeggibile: nessuno lo detta al telefono. Un progressivo
 * si legge, si ordina a occhio e dice a colpo d'occhio quanti ordini si sono
 * fatti quest'anno.
 *
 * ── Perché senza buchi ──────────────────────────────────────────────────
 * Un buco nella numerazione, in contabilità, è una domanda: «e il 41 dov'è?».
 * Non è un problema tecnico ma diventa un problema di fiducia, e si risolve
 * spiegando ogni volta. Il numero si calcola quindi **dentro** la transazione
 * che conferma: se la conferma fallisce, il numero non è mai stato preso.
 *
 * ── Perché riparte ogni anno ────────────────────────────────────────────
 * Perché è la convenzione che tutti i fornitori si aspettano, e perché quattro
 * cifre bastano per sempre solo se non si accumulano.
 */

/** Quante cifre ha il progressivo. Diecimila ordini l'anno non li fa nessuno. */
const CIFRE = 4;

export function formattaCodiceOrdine(anno: number, progressivo: number): string {
  return `${anno}-${String(progressivo).padStart(CIFRE, '0')}`;
}

/**
 * Il progressivo di un codice, se appartiene a quell'anno.
 *
 * Restituisce `null` per tutto il resto — un codice di un altro anno, uno
 * scritto a mano, uno di un formato vecchio. Ignorare ciò che non si riconosce
 * è più sicuro che tentare di interpretarlo: un codice illeggibile che venisse
 * letto come «9999» bloccherebbe la numerazione per sempre.
 */
export function progressivoDi(codice: string | null, anno: number): number | null {
  if (!codice) return null;
  const atteso = new RegExp(`^${anno}-(\\d{${CIFRE},})$`);
  const trovato = atteso.exec(codice.trim());
  if (!trovato) return null;
  const numero = Number(trovato[1]);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Il prossimo codice, dati quelli già usati **nello stesso anno**.
 *
 * Prende il massimo e aggiunge uno, invece di contare quanti ce ne sono:
 * contare darebbe un duplicato non appena un ordine venisse cancellato, e
 * il duplicato si scoprirebbe solo quando due PDF diversi arrivano allo
 * stesso fornitore con lo stesso numero sopra.
 */
export function prossimoCodiceOrdine(
  codiciEsistenti: readonly (string | null)[],
  adesso: Date = new Date(),
): string {
  const anno = adesso.getFullYear();
  const massimo = codiciEsistenti.reduce<number>((piuAlto, codice) => {
    const numero = progressivoDi(codice, anno);
    return numero !== null && numero > piuAlto ? numero : piuAlto;
  }, 0);
  return formattaCodiceOrdine(anno, massimo + 1);
}
