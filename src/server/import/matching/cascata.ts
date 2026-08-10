import 'server-only';

import { Decimal } from 'decimal.js';
import { cercaCandidati, prodottiEsclusi } from '@/server/database/candidati-abbinamento';
import { analizzaDescrizione } from '@/server/domain/packaging/parse';
import { improntaDaCampi } from '@/server/domain/packaging/fingerprint';
import type { BaseUnit, UnitOfMeasure } from '@/server/domain/packaging/units';
import {
  decidiDaPunteggio,
  decisioneCerta,
  SOGLIE_PREDEFINITE,
  type DecisioneAbbinamento,
  type SoglieAbbinamento,
} from '@/server/domain/matching/decide';
import {
  nucleoPerAbbinamento,
  punteggioAbbinamento,
  type PunteggioAbbinamento,
} from '@/server/domain/matching/score';
import { systemPrisma } from '@/server/database/system-client';

/**
 * La cascata: da una riga di listino alla proposta di abbinamento.
 *
 * L'ordine non è un dettaglio di efficienza — è una gerarchia di certezza, e
 * ogni gradino costa meno e sbaglia meno del successivo:
 *
 *  1. **stesso fornitore, stesso codice** → non è un abbinamento, è la stessa
 *     offerta di prima: si aggiorna, non si crea;
 *  2. **sinonimo confermato** → qui finisce ogni abbinamento che una persona
 *     ha già approvato. Costo zero, e il motivo per cui il secondo listino
 *     dello stesso fornitore non chiede quasi più niente;
 *  3. **somiglianza + formato identico** → automatico;
 *  4. **zona grigia** → si propone, decide una persona (o, se configurato, si
 *     chiede un parere al modello);
 *  5. **niente di credibile** → prodotto nuovo.
 *
 * Il passo 1 di ANALISI §5 — il codice a barre — non è implementato perché
 * nei listini veri non ce n'è uno: Cecconi stampa un campo `EAN:` che ripete
 * il codice interno, Barzelli non ne ha. Il giorno che arriva un fornitore
 * con GTIN veri, si aggiunge un gradino in cima.
 */

export interface RigaDaAbbinare {
  /** Chiave della riga nel listino, per ricollegare l'esito. */
  chiave: string;
  codiceFornitore: string | null;
  descrizione: string;
  unitaDiVendita: string | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  packQuantity?: number;
}

export interface Candidato {
  productId: string;
  nome: string;
  punteggio: PunteggioAbbinamento;
  via: string;
}

export interface EsitoRiga {
  chiave: string;
  /** Il nucleo normalizzato: è ciò che diventerà l'alias se si conferma. */
  nucleo: string;
  formato: {
    unitSize: Decimal;
    unitOfMeasure: UnitOfMeasure;
    baseUnit: BaseUnit;
    packQuantity: number;
    packQuantityConfirmed: boolean;
    contentPerPack: Decimal;
  };
  /** L'offerta già esistente di questo fornitore, se il codice coincide. */
  supplierProductId: string | null;
  decisione: DecisioneAbbinamento;
  /** Il prodotto proposto, se ce n'è uno. `null` significa «prodotto nuovo». */
  productId: string | null;
  /** Gli altri candidati, per la revisione. Ordinati dal più probabile. */
  candidati: Candidato[];
}

export interface OpzioniCascata {
  organizationId: string;
  supplierId: string;
  soglie?: SoglieAbbinamento;
}

/** Quanti candidati si chiedono al database prima di filtrarli sul formato. */
const CANDIDATI_GREZZI = 20;

/**
 * Abbina una riga.
 *
 * Non scrive niente: restituisce una proposta. La scrittura è un passo a
 * parte, e questa separazione è ciò che permette di far girare l'abbinamento
 * su un listino intero e mostrarne l'esito **prima** di applicarlo.
 */
export async function abbinaRiga(
  riga: RigaDaAbbinare,
  opzioni: OpzioniCascata,
): Promise<EsitoRiga> {
  const soglie = opzioni.soglie ?? SOGLIE_PREDEFINITE;
  const { formato, nucleo } = analizzaDescrizione(riga.descrizione, {
    unitaDiVendita: riga.unitaDiVendita,
  });
  const mioFormato = {
    unitSize: formato.unitSize,
    unitOfMeasure: formato.unitOfMeasure,
    baseUnit: formato.baseUnit,
  };
  const base = {
    chiave: riga.chiave,
    nucleo,
    formato: {
      unitSize: formato.unitSize,
      unitOfMeasure: formato.unitOfMeasure,
      baseUnit: formato.baseUnit,
      packQuantity: formato.packQuantity,
      packQuantityConfirmed: formato.packQuantityConfirmed,
      contentPerPack: formato.contentPerPack,
    },
  };

  // ── 1. Stesso fornitore, stessa identità ───────────────────────────────
  // Il codice è la prova primaria. Barzelli però non lo fornisce: in quel
  // caso la stessa impronta usata dal vincolo del catalogo evita che ogni
  // reimport proponga una nuova offerta identica alla precedente.
  const fingerprint = improntaDaCampi({
    descrizione: riga.descrizione,
    unitaDiVendita: riga.unitaDiVendita,
    unitSize: riga.unitSize,
    unitOfMeasure: riga.unitOfMeasure,
    packQuantity: riga.packQuantity,
  });
  const esistente = await systemPrisma.supplierProduct.findFirst({
    where: {
      supplierId: opzioni.supplierId,
      ...(riga.codiceFornitore
        ? { supplierCode: riga.codiceFornitore }
        : { supplierCode: null, fingerprint }),
    },
    select: { id: true, productId: true, product: { select: { name: true } } },
  });
  if (esistente) {
    const identita = riga.codiceFornitore
      ? `Codice ${riga.codiceFornitore}`
      : 'Impronta della riga senza codice';
    return {
      ...base,
      supplierProductId: esistente.id,
      productId: esistente.productId,
      // `CODE` qui indica il gradino certo dell'identità fornitore. Non si
      // aggiunge un valore al DB enum solo per distinguere il suo fallback.
      decisione: decisioneCerta(
        'CODE',
        esistente.productId
          ? `${identita} già nota per questo fornitore, collegata a «${esistente.product?.name}».`
          : `${identita} già nota per questo fornitore, ma non ancora collegata a un prodotto.`,
      ),
      candidati: [],
    };
  }

  // ── 2-4. Candidati, filtrati sul formato ───────────────────────────────
  // Si cerca col nucleo ripulito dalle parole di confezione: «xyz birra
  // confezione» non supererebbe la soglia della query contro «birra xyz», e
  // il candidato giusto non arriverebbe nemmeno fra quelli da valutare.
  const perCercare = nucleoPerAbbinamento(nucleo) || nucleo;
  const [grezzi, esclusi] = await Promise.all([
    cercaCandidati(opzioni.organizationId, perCercare, formato.baseUnit, CANDIDATI_GREZZI),
    prodottiEsclusi(opzioni.organizationId, nucleo),
  ]);

  const candidati: Candidato[] = [];
  for (const g of grezzi) {
    // Un «non sono la stessa cosa» già detto da una persona non si ripropone.
    if (esclusi.has(g.id)) continue;
    const punteggio = punteggioAbbinamento(g.trigram, nucleo, g.normalized_name, mioFormato, {
      unitSize: new Decimal(g.unit_size),
      unitOfMeasure: g.unit_of_measure as UnitOfMeasure,
      baseUnit: g.base_unit as BaseUnit,
    });
    // Il formato è un cancello: i candidati che non lo passano non sono
    // candidati deboli, sono prodotti diversi.
    if (!punteggio.formato.compatibile) continue;
    candidati.push({ productId: g.id, nome: g.name, punteggio, via: g.via });
  }

  candidati.sort((a, b) => b.punteggio.punteggio - a.punteggio.punteggio);
  const migliore = candidati[0];

  if (!migliore) {
    return {
      ...base,
      supplierProductId: null,
      productId: null,
      decisione: {
        esito: 'NUOVO',
        metodo: 'TRIGRAM',
        punteggio: 0,
        motivo: 'Nessun prodotto in catalogo con questo nome e questo formato.',
      },
      candidati: [],
    };
  }

  // Un candidato arrivato per sinonimo confermato non passa dalle soglie: è
  // un abbinamento che una persona ha già approvato, e una soglia numerica
  // potrebbe respingerlo.
  const decisione =
    migliore.via === 'alias'
      ? decisioneCerta('ALIAS', `Sinonimo già confermato per «${migliore.nome}».`)
      : decidiDaPunteggio(migliore.punteggio, soglie);

  return {
    ...base,
    supplierProductId: null,
    productId: decisione.esito === 'NUOVO' ? null : migliore.productId,
    decisione,
    candidati: candidati.slice(0, soglie.massimoCandidati),
  };
}

/**
 * Abbina tutte le righe di un listino.
 *
 * In sequenza e non in parallelo: ogni riga fa due query trigram, e venti in
 * volo insieme metterebbero in ginocchio la stessa connessione che serve al
 * resto dell'applicazione. Un listino da 189 righe ci mette qualche secondo,
 * ed è tempo che l'operatore non sta aspettando — gira dentro la lavorazione.
 */
export async function abbinaTutte(
  righe: readonly RigaDaAbbinare[],
  opzioni: OpzioniCascata,
  suProgresso?: (fatte: number) => void | Promise<void>,
): Promise<EsitoRiga[]> {
  const esiti: EsitoRiga[] = [];
  for (const [i, riga] of righe.entries()) {
    esiti.push(await abbinaRiga(riga, opzioni));
    if (suProgresso && (i + 1) % 25 === 0) await suProgresso(i + 1);
  }
  return esiti;
}

export interface RiepilogoAbbinamento {
  automatici: number;
  daRivedere: number;
  nuovi: number;
  giaNoti: number;
}

export function riepiloga(esiti: readonly EsitoRiga[]): RiepilogoAbbinamento {
  return {
    giaNoti: esiti.filter((e) => e.supplierProductId !== null).length,
    automatici: esiti.filter((e) => e.supplierProductId === null && e.decisione.esito === 'AUTO')
      .length,
    daRivedere: esiti.filter((e) => e.decisione.esito === 'PENDING').length,
    nuovi: esiti.filter((e) => e.decisione.esito === 'NUOVO').length,
  };
}
