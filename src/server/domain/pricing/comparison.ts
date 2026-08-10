import { Decimal } from 'decimal.js';
import { basePerPrezzo, confrontabili, type BaseUnit, type PriceBasis } from '../packaging/units';
import { prezzoPerUnita } from './unit-price';

/**
 * Dove conviene comprare un prodotto.
 *
 * È il modulo che risponde alla domanda per cui esiste tutto il resto, ed è
 * **puro**: nessun database, nessuna rete, nessuna data «adesso» presa da
 * sola. Il momento di riferimento si passa come argomento, altrimenti i test
 * cambierebbero risultato col passare dei giorni e non ci si potrebbe fidare
 * di nessuno di loro.
 *
 * ── Perché non basta ordinare per prezzo ────────────────────────────────
 * Dodici bottiglie a 9 euro e ventiquattro a 16: ordinando per prezzo netto
 * vince la prima, ordinando per prezzo al litro vince la seconda. Il netto
 * non è confrontabile fra confezioni diverse, e questo è l'intero motivo per
 * cui il progetto esiste.
 *
 * ── Cosa si rifiuta di fare ─────────────────────────────────────────────
 * Confrontare unità base diverse (chili contro litri) e confezioni di cui non
 * si sa quanti pezzi contengano. In entrambi i casi si otterrebbe un numero
 * plausibile e falso, che è peggio di nessun numero: un numero falso non si
 * riconosce, un'assenza sì.
 *
 * ── Lo sconto extra entra qui, non nell'ordine ──────────────────────────
 * Il premio a posteriori concordato col fornitore non si paga alla consegna,
 * ma **cambia quanto costa davvero**. Il confronto ragiona quindi sul netto
 * effettivo: tenerlo fuori farebbe scegliere il fornitore sbagliato tutte le
 * volte che il più caro a listino è il più economico dopo lo sconto — cioè
 * esattamente il caso per cui lo sconto è stato concordato.
 *
 * Il netto di listino resta accanto, perché è quello che si pagherà.
 *
 * ── I prezzi fermi ──────────────────────────────────────────────────────
 * Un prezzo di due anni fa non si esclude — sarebbe far sparire un fornitore
 * senza dirlo — ma si **dichiara fermo**. Chi guarda decide se fidarsi.
 */

export type StatoConfronto =
  /** Almeno due offerte confrontabili: la classifica è vera. */
  | 'CONFRONTATO'
  /** Una sola offerta utilizzabile: niente da confrontare, ed è un'informazione. */
  | 'OFFERTA_UNICA'
  /** Più offerte, ma non paragonabili fra loro: si dice perché. */
  | 'NON_CONFRONTABILE'
  /** Nessuna offerta attiva con un prezzo. */
  | 'SENZA_PREZZO';

export type MotivoEsclusione =
  | 'non attiva'
  | 'senza prezzo'
  | 'confezione non dichiarata'
  | 'unità non confrontabile';

export interface OffertaDaConfrontare {
  id: string;
  attiva: boolean;
  /** `null` quando non c'è un prezzo corrente. È quello che si paga. */
  prezzoNetto: string | null;
  /**
   * Il netto dopo lo sconto extra del fornitore: quanto costa **davvero**.
   * Quando non c'è sconto coincide col netto, e allora si può omettere.
   */
  prezzoEffettivo?: string | null;
  /** La percentuale applicata, per poterla mostrare. */
  scontoExtraPct?: string | null;
  /** Quanto contiene una confezione, in unità base. */
  contenutoPerConfezione: string;
  base: BaseUnit;
  /** `false` quando i pezzi per confezione sono un ripiego e non un dato. */
  confezioneCerta: boolean;
  /** Da quando vale il prezzo corrente: serve a dirlo fermo. */
  valeDa: Date | null;
}

export interface RigaConfronto {
  id: string;
  /** Prezzo della confezione, quello che si paga. */
  prezzoNetto: Decimal;
  /** Quanto costa davvero, dopo lo sconto extra concordato. */
  prezzoEffettivo: Decimal;
  /** Lo sconto extra applicato, in percentuale. Zero quando non ce n'è. */
  scontoExtraPct: Decimal;
  /** Prezzo per unità base **sull'effettivo**: è il numero con cui si ordina. */
  prezzoUnitario: Decimal;
  basis: PriceBasis;
  contenutoPerConfezione: Decimal;
  /** Il prezzo non si aggiorna da più del consentito. */
  fermo: boolean;
}

export interface Esclusa {
  id: string;
  motivo: MotivoEsclusione;
}

export interface ConfrontoProdotto {
  stato: StatoConfronto;
  /** Perché non c'è un confronto, quando non c'è. Da mostrare così com'è. */
  motivo: string | null;
  /** Dalla più conveniente alla meno. Vuota quando non si può confrontare. */
  classifica: RigaConfronto[];
  migliore: RigaConfronto | null;
  /** La più cara fra le confrontabili: è ciò che rende reale il risparmio. */
  piuCara: RigaConfronto | null;
  escluse: Esclusa[];
  /** Differenza di prezzo per unità base fra la più cara e la migliore. */
  differenzaUnitaria: Decimal | null;
  /**
   * Quanto si risparmia comprando dalla migliore **una sua confezione**
   * invece della stessa quantità dalla più cara. È un euro vero e
   * verificabile, non una proiezione: senza lo storico ordini (Fase 15) non
   * si può dire quanto si risparmia in un anno.
   */
  risparmioPerConfezione: Decimal | null;
  risparmioPct: Decimal | null;
  /** Almeno un prezzo fra i confrontati non si aggiorna da troppo. */
  qualcunoFermo: boolean;
}

export interface OpzioniConfronto {
  /** Momento di riferimento per decidere se un prezzo è fermo. */
  adesso: Date;
  /** Mesi dopo i quali un prezzo si considera fermo. */
  mesiPrimaDiConsiderarloFermo: number;
}

function eFermo(valeDa: Date | null, opzioni: OpzioniConfronto): boolean {
  if (!valeDa) return false;
  const limite = new Date(opzioni.adesso);
  limite.setMonth(limite.getMonth() - opzioni.mesiPrimaDiConsiderarloFermo);
  return valeDa.getTime() < limite.getTime();
}

/**
 * Confronta le offerte di un prodotto.
 *
 * Le offerte scartate non spariscono: finiscono in `escluse` col motivo, così
 * l'interfaccia può dire *perché* un fornitore non compare invece di lasciar
 * pensare che non esista.
 */
export function confrontaProdotto(
  offerte: readonly OffertaDaConfrontare[],
  opzioni: OpzioniConfronto,
): ConfrontoProdotto {
  const escluse: Esclusa[] = [];
  const utilizzabili: OffertaDaConfrontare[] = [];

  for (const o of offerte) {
    if (!o.attiva) escluse.push({ id: o.id, motivo: 'non attiva' });
    else if (o.prezzoNetto === null) escluse.push({ id: o.id, motivo: 'senza prezzo' });
    else if (!o.confezioneCerta) escluse.push({ id: o.id, motivo: 'confezione non dichiarata' });
    else utilizzabili.push(o);
  }

  const vuoto = {
    classifica: [] as RigaConfronto[],
    migliore: null,
    piuCara: null,
    escluse,
    differenzaUnitaria: null,
    risparmioPerConfezione: null,
    risparmioPct: null,
    qualcunoFermo: false,
  };

  if (utilizzabili.length === 0) {
    return { ...vuoto, stato: 'SENZA_PREZZO', motivo: motivoSenzaPrezzo(escluse) };
  }

  // L'unità base della maggioranza fa da riferimento: le altre si dichiarano
  // non confrontabili invece di far vincere l'ordine in cui sono arrivate.
  const riferimento = baseMaggioritaria(utilizzabili);
  const stessaBase: OffertaDaConfrontare[] = [];
  for (const o of utilizzabili) {
    if (confrontabili(o.base, riferimento)) stessaBase.push(o);
    else escluse.push({ id: o.id, motivo: 'unità non confrontabile' });
  }

  const classifica = stessaBase
    .map<RigaConfronto>((o) => ({
      id: o.id,
      prezzoNetto: new Decimal(o.prezzoNetto!),
      prezzoEffettivo: new Decimal(o.prezzoEffettivo ?? o.prezzoNetto!),
      scontoExtraPct: new Decimal(o.scontoExtraPct ?? 0),
      // Sull'effettivo, non sul listino: è il confronto che deve dire dove
      // conviene, e conviene dove si spende meno alla fine.
      prezzoUnitario: prezzoPerUnita(
        o.prezzoEffettivo ?? o.prezzoNetto!,
        o.contenutoPerConfezione,
        o.base,
      ).valore,
      basis: basePerPrezzo(o.base),
      contenutoPerConfezione: new Decimal(o.contenutoPerConfezione),
      fermo: eFermo(o.valeDa, opzioni),
    }))
    .sort((a, b) => a.prezzoUnitario.comparedTo(b.prezzoUnitario));

  const migliore = classifica[0]!;
  const piuCara = classifica.at(-1)!;
  const qualcunoFermo = classifica.some((r) => r.fermo);

  if (classifica.length === 1) {
    const altriEsclusi = escluse.length > 0;
    return {
      stato: 'OFFERTA_UNICA',
      // Un solo fornitore non è un vuoto da riempire: è il motivo per cui non
      // c'è niente da scegliere, e va detto.
      motivo: altriEsclusi
        ? 'Un solo fornitore confrontabile: gli altri sono esclusi, vedi il dettaglio.'
        : 'Un solo fornitore vende questo prodotto: non c’è niente da confrontare.',
      classifica,
      migliore,
      piuCara: null,
      escluse,
      differenzaUnitaria: null,
      risparmioPerConfezione: null,
      risparmioPct: null,
      qualcunoFermo,
    };
  }

  const differenzaUnitaria = piuCara.prezzoUnitario.minus(migliore.prezzoUnitario);
  // Il risparmio su **una confezione della migliore**: la stessa quantità
  // comprata dalla più cara costerebbe questo in più. È verificabile a mano.
  const risparmioPerConfezione = differenzaUnitaria
    .mul(migliore.contenutoPerConfezione)
    .toDecimalPlaces(2);
  const risparmioPct = piuCara.prezzoUnitario.gt(0)
    ? differenzaUnitaria.div(piuCara.prezzoUnitario).mul(100).toDecimalPlaces(2)
    : new Decimal(0);

  return {
    stato: 'CONFRONTATO',
    motivo: null,
    classifica,
    migliore,
    piuCara,
    escluse,
    differenzaUnitaria,
    risparmioPerConfezione,
    risparmioPct,
    qualcunoFermo,
  };
}

/** L'unità base più rappresentata, a parità la prima incontrata. */
function baseMaggioritaria(offerte: readonly OffertaDaConfrontare[]): BaseUnit {
  const conteggi = new Map<BaseUnit, number>();
  for (const o of offerte) conteggi.set(o.base, (conteggi.get(o.base) ?? 0) + 1);
  let migliore = offerte[0]!.base;
  for (const [base, n] of conteggi) {
    if (n > (conteggi.get(migliore) ?? 0)) migliore = base;
  }
  return migliore;
}

function motivoSenzaPrezzo(escluse: readonly Esclusa[]): string {
  if (escluse.length === 0) return 'Nessun fornitore collegato a questo prodotto.';
  if (escluse.every((e) => e.motivo === 'non attiva')) {
    return 'Nessun fornitore lo tiene più a listino.';
  }
  if (escluse.some((e) => e.motivo === 'confezione non dichiarata')) {
    return 'Manca il numero di pezzi per confezione: senza, il prezzo per unità sarebbe inventato.';
  }
  return 'Nessuna offerta attiva ha un prezzo corrente.';
}

/**
 * Il confronto merita di essere segnalato?
 *
 * Le due soglie vanno **entrambe** superate, ed è deliberato: il 30% su una
 * bottiglia da mezzo euro è quindici centesimi, e riempire l'elenco di quelle
 * lo rende inutile proprio quando servirebbe. Un elenco di avvisi che non si
 * possono leggere tutti non è un elenco di avvisi.
 */
export function meritaAvviso(
  confronto: ConfrontoProdotto,
  soglie: { percentuale: number; euro: number },
): boolean {
  if (confronto.stato !== 'CONFRONTATO') return false;
  if (!confronto.risparmioPct || !confronto.risparmioPerConfezione) return false;
  return (
    confronto.risparmioPct.gte(soglie.percentuale) &&
    confronto.risparmioPerConfezione.gte(soglie.euro)
  );
}
