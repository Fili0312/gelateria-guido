import type { TipoRiga } from './pdf/segment';

/**
 * Quali righe di un listino sono articoli, e quali no.
 *
 * Un PDF di listino non contiene solo prodotti. Contiene l'intestazione col
 * nome e la partita IVA della gelateria, l'indirizzo di consegna, le
 * condizioni di pagamento, i titoli di sezione, i totali e i piè di pagina.
 * Il segmentatore le riconosce già per quello che sono — `intestazione`,
 * `sezione`, `ignota` — e per quelle non produce nessun campo: non c'è un
 * nome, non c'è un prezzo, non c'è un codice.
 *
 * Finivano lo stesso nella coda degli abbinamenti, in stato «da decidere»,
 * con scritto «nessun prodotto simile in catalogo con questo formato» e due
 * pulsanti — «È un prodotto nuovo» e «Ignora questa riga». Su un listino
 * Cecconi erano venti righe così: «P.IVA: 00910200435», «Totale ordine:
 * 5.287,11», «Pagamento: 20 R.B. 30 GG F.M.», «Tel.: Fax.:».
 *
 * Il danno non è l'ingombro. È che la coda degli abbinamenti è il posto dove
 * si prendono decisioni che contano — quale riga è lo stesso articolo di quale
 * prodotto — e riempirla di roba che non è nemmeno un articolo insegna a
 * scorrerla senza leggerla. E dopo l'irrobustimento della Fase 20 quelle righe
 * **bloccano anche l'applicazione del listino**, perché una riga non decisa
 * impedisce di applicare: venti clic su «Ignora» prima di poter importare.
 *
 * ── Perché una regola e non il modello ──────────────────────────────────
 * Qui non serve conoscenza del mondo. Il segmentatore ha già deciso che tipo
 * di riga è, e la strutturazione non ha prodotto campi perché non c'era
 * niente da strutturare. Chiedere a un modello se «Totale ordine: 5.287,11»
 * sia un articolo costa denaro, latenza e una risposta che ogni tanto sarà
 * diversa da quella di ieri sulla stessa riga.
 *
 * Sui due listini veri in produzione la regola separa esattamente: 331 righe
 * prodotto, tutte con i campi; 20 non-articoli, nessuno dei quali ha campi.
 * Nessun articolo vero cade dalla parte sbagliata.
 */

export interface RigaDaClassificare {
  tipo: TipoRiga;
  /** I campi interpretati dalla strutturazione: `null` se non c'era nulla. */
  campi: unknown;
}

/**
 * Una riga è un articolo solo se il segmentatore l'ha vista come prodotto
 * **e** la strutturazione ne ha ricavato dei campi.
 *
 * Le due condizioni valgono insieme di proposito. Il tipo da solo non basta:
 * una riga può sembrare un prodotto e non produrre campi, e senza campi non
 * c'è niente da abbinare né da importare. I campi da soli nemmeno: sono
 * costruiti solo per le righe prodotto, e affidarsi a quello lascerebbe la
 * regola in balia di un cambio di quel dettaglio.
 */
export function eArticolo(riga: RigaDaClassificare): boolean {
  return riga.tipo === 'prodotto' && riga.campi != null;
}

/**
 * Lo stato in cui nasce una riga.
 *
 * Le non-articolo nascono già chiuse — `IGNORED` ed `excluded` — che è lo
 * stesso stato in cui finisce una riga su cui si preme «Ignora». La
 * differenza è che qui non c'è un revisore: `reviewedById` resta vuoto, e
 * dalla riga si vede che la decisione l'ha presa il sistema e non una
 * persona.
 *
 * **Non si cancellano.** Restano nella vista delle righe grezze, dove
 * servono a capire cosa c'era davvero nel PDF quando un'estrazione va storta.
 * Escluderle le toglie dalla coda e dai conteggi, non dalla memoria.
 */
export function statoIniziale(riga: RigaDaClassificare): {
  matchStatus: 'PENDING' | 'IGNORED';
  proposedAction: 'AMBIGUOUS' | 'IGNORE';
  excluded: boolean;
} {
  return eArticolo(riga)
    ? { matchStatus: 'PENDING', proposedAction: 'AMBIGUOUS', excluded: false }
    : { matchStatus: 'IGNORED', proposedAction: 'IGNORE', excluded: true };
}
