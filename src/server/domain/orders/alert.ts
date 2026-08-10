import { Decimal } from 'decimal.js';
import { inUnitaBase, type UnitOfMeasure } from '../packaging/units';
import { confezioniEquivalenti } from '../pricing/unit-price';
import { arrotondaImporto } from './totals';

/**
 * L'avviso «lo trovi a meno da un altro», e il cambio di fornitore.
 *
 * Modulo **puro**. È la funzionalità che più facilmente diventa fastidiosa:
 * un avviso che compare sempre viene ignorato sempre, e a quel punto tanto
 * vale non averlo. Le soglie non sono un'impostazione accessoria — **sono**
 * la funzionalità.
 *
 * ── Due soglie, e valgono insieme ───────────────────────────────────────
 * Il trenta per cento su una bottiglia da mezzo euro è quindici centesimi.
 * Perché valga la pena di dirlo devono superarsi **sia** la percentuale
 * **sia** gli euro: una sola delle due riempie l'elenco di rumore proprio
 * quando servirebbe leggerlo.
 *
 * ── Il cambio con confezioni diverse ────────────────────────────────────
 * È il punto in cui è facilissimo sbagliare le quantità. Quattro colli da 12
 * non sono quattro colli da 24: sono due. Il ricalcolo si fa, ma **non si
 * fa in silenzio** — si dichiara «4 × 12 = 48 pz → 2 × 24 = 48 pz», e quando
 * il conto non torna esatto lo si dice invece di arrotondare di nascosto.
 */

export interface OffertaPerAvviso {
  supplierProductId: string;
  supplierName: string;
  /** Netto di una confezione. */
  prezzoConfezione: Decimal.Value;
  /** Quanto contiene una confezione, in unità base. */
  contenutoPerConfezione: Decimal.Value;
  /** Pezzi per confezione: serve a dichiarare il cambio, non a confrontare. */
  pezziPerConfezione: number;
}

export interface Soglie {
  percentuale: number;
  euro: number;
}

export interface Avviso {
  /** Quanto si risparmia **su una confezione di quella scelta**. */
  risparmioPerConfezione: Decimal;
  risparmioPct: Decimal;
  /** Il risparmio sull'intera riga, alle quantità già scelte. */
  risparmioTotale: Decimal;
  migliore: OffertaPerAvviso;
  /** `false` quando la differenza è sotto una delle due soglie. */
  meritaAvviso: boolean;
}

function unitario(o: OffertaPerAvviso): Decimal {
  const contenuto = new Decimal(o.contenutoPerConfezione);
  return contenuto.gt(0) ? new Decimal(o.prezzoConfezione).div(contenuto) : new Decimal(0);
}

/**
 * Confronta ciò che si sta ordinando con la migliore alternativa.
 *
 * Restituisce `null` quando non c'è niente da dire: nessuna alternativa,
 * oppure quella scelta **è già** la più conveniente. Non restituisce un
 * avviso con risparmio zero, perché un avviso che dice «non risparmi niente»
 * è rumore travestito da informazione.
 */
export function confrontaPerAvviso(
  scelta: OffertaPerAvviso,
  alternative: readonly OffertaPerAvviso[],
  confezioniScelte: number,
  soglie: Soglie,
): Avviso | null {
  const uScelta = unitario(scelta);
  if (uScelta.lte(0)) return null;

  const migliore = alternative
    .filter((a) => a.supplierProductId !== scelta.supplierProductId && unitario(a).gt(0))
    .reduce<OffertaPerAvviso | null>(
      (m, a) => (m === null || unitario(a).lt(unitario(m)) ? a : m),
      null,
    );
  if (!migliore) return null;

  const uMigliore = unitario(migliore);
  if (uMigliore.gte(uScelta)) return null;

  const differenzaUnitaria = uScelta.minus(uMigliore);
  // Il risparmio si esprime su **una confezione di quella scelta**: è la
  // grandezza che chi ordina ha davanti, non un'astrazione al litro.
  const risparmioPerConfezione = arrotondaImporto(
    differenzaUnitaria.mul(scelta.contenutoPerConfezione),
  );
  const risparmioPct = differenzaUnitaria.div(uScelta).mul(100).toDecimalPlaces(2);

  return {
    risparmioPerConfezione,
    risparmioPct,
    risparmioTotale: arrotondaImporto(risparmioPerConfezione.mul(confezioniScelte)),
    migliore,
    // Entrambe le soglie, non una: vedi il commento in testa al modulo.
    meritaAvviso: risparmioPct.gte(soglie.percentuale) && risparmioPerConfezione.gte(soglie.euro),
  };
}

export interface CambioFornitore {
  /** Quante confezioni prendere dal nuovo fornitore. */
  confezioni: number;
  /** Pezzi totali prima e dopo: è il conto che va mostrato. */
  pezziPrima: number;
  pezziDopo: number;
  /** Quantità in unità base prima e dopo. */
  quantitaPrima: Decimal;
  quantitaDopo: Decimal;
  /** `true` quando le due quantità coincidono: nessun arrotondamento. */
  esatto: boolean;
  /** Cosa cambia, scritto per essere mostrato così com'è. */
  descrizione: string;
  spesaPrima: Decimal;
  spesaDopo: Decimal;
  risparmio: Decimal;
}

/**
 * Ricostruisce il contenuto fisico della confezione fotografata nella riga.
 * Il cambio fornitore non deve dipendere dalla vecchia offerta viva: formato
 * e pezzi potrebbero essere cambiati dopo che l'utente ha scelto la quantità.
 */
export function contenutoConfezioneFotografato(
  unitSize: Decimal.Value,
  unitOfMeasure: UnitOfMeasure,
  packQuantity: number,
): Decimal {
  return inUnitaBase(unitSize, unitOfMeasure).mul(packQuantity);
}

/**
 * Cosa succede passando all'altro fornitore.
 *
 * Non applica niente: **descrive**. Chi preme deve vedere il conto prima di
 * confermarlo, perché passare da 12 a 24 pezzi non è un cambio di prezzo, è
 * un cambio di quantità — e un cambio di quantità fatto in silenzio si
 * scopre alla consegna.
 */
export function calcolaCambio(
  scelta: OffertaPerAvviso,
  nuova: OffertaPerAvviso,
  confezioniScelte: number,
): CambioFornitore {
  const equivalenti = confezioniEquivalenti(
    confezioniScelte,
    scelta.contenutoPerConfezione,
    nuova.contenutoPerConfezione,
  );

  const quantitaPrima = new Decimal(scelta.contenutoPerConfezione).mul(confezioniScelte);
  const quantitaDopo = new Decimal(nuova.contenutoPerConfezione).mul(equivalenti.confezioni);
  const pezziPrima = scelta.pezziPerConfezione * confezioniScelte;
  const pezziDopo = nuova.pezziPerConfezione * equivalenti.confezioni;
  const esatto = quantitaDopo.minus(quantitaPrima).abs().lte('0.0001');

  const spesaPrima = arrotondaImporto(new Decimal(scelta.prezzoConfezione).mul(confezioniScelte));
  const spesaDopo = arrotondaImporto(
    new Decimal(nuova.prezzoConfezione).mul(equivalenti.confezioni),
  );

  const conto = `${confezioniScelte} × ${scelta.pezziPerConfezione} = ${pezziPrima} pz → ${equivalenti.confezioni} × ${nuova.pezziPerConfezione} = ${pezziDopo} pz`;

  return {
    confezioni: equivalenti.confezioni,
    pezziPrima,
    pezziDopo,
    quantitaPrima,
    quantitaDopo,
    esatto,
    // Quando il conto non torna si dice, e si dice di quanto. Arrotondare in
    // silenzio è il modo per far arrivare tre litri in meno senza che nessuno
    // sappia perché.
    descrizione: esatto
      ? conto
      : `${conto} — non è la stessa quantità: ${quantitaPrima} contro ${quantitaDopo}`,
    spesaPrima,
    spesaDopo,
    risparmio: arrotondaImporto(spesaPrima.minus(spesaDopo)),
  };
}
