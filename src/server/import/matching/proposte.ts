import 'server-only';

import { systemPrisma } from '@/server/database/system-client';
import {
  abbinaTutte,
  riepiloga,
  type EsitoRiga,
  type RigaDaAbbinare,
  type RiepilogoAbbinamento,
} from './cascata';

/**
 * Le proposte di abbinamento, scritte sulle righe del listino.
 *
 * **Non si crea niente nel catalogo.** Questa fase propone; la Fase 10
 * riconcilia e applica. La separazione non è formale: un import che scrive
 * direttamente sul dominio non si può annullare, e un prezzo sbagliato entrato
 * in silenzio corrompe storico e confronti in modo invisibile finché non si
 * ordina male.
 *
 * Le proposte vivono su `price_list_row` — `product_id`, `match_status`,
 * `proposed_action` — che è lo staging previsto dallo schema fin dalla Fase 2.
 */

/** Che cosa si propone di fare con questa riga. */
export type Azione = 'CREATE' | 'UPDATE_PRICE' | 'UNCHANGED' | 'AMBIGUOUS' | 'IGNORE';

interface CampiRiga {
  codice?: string | null;
  descrizione?: string | null;
  unitaDiVendita?: string | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  packQuantity?: number;
}

/**
 * Traduce l'esito della cascata nello stato che finisce sulla riga.
 *
 * `AUTO` non significa «fatto»: significa «proposto senza bisogno che qualcuno
 * guardi». La differenza fra proposto e applicato resta tutta nella Fase 10.
 */
function statoDi(esito: EsitoRiga): { matchStatus: 'AUTO' | 'PENDING' | 'NEW'; azione: Azione } {
  if (esito.supplierProductId) {
    // Il fornitore vende già questo codice: non è un abbinamento da decidere,
    // è un aggiornamento. Se poi la confezione sia cambiata lo stabilisce la
    // riconciliazione della Fase 10, che è l'unica a conoscere il prezzo.
    return { matchStatus: 'AUTO', azione: 'UPDATE_PRICE' };
  }
  if (esito.decisione.esito === 'AUTO') return { matchStatus: 'AUTO', azione: 'CREATE' };
  if (esito.decisione.esito === 'PENDING') return { matchStatus: 'PENDING', azione: 'AMBIGUOUS' };
  return { matchStatus: 'NEW', azione: 'CREATE' };
}

export interface EsitoProposte extends RiepilogoAbbinamento {
  righe: number;
  candidatiSalvati: number;
}

/**
 * Calcola e salva le proposte per un listino.
 *
 * Idempotente: rieseguirla ricalcola tutto da capo e sovrascrive le proposte
 * non ancora decise. Le decisioni già prese da una persona non si toccano —
 * ricalcolare non deve poter cancellare una conferma.
 */
export async function proponiAbbinamenti(
  priceListId: string,
  suProgresso?: (fatte: number) => void | Promise<void>,
): Promise<EsitoProposte> {
  const listino = await systemPrisma.priceList.findUniqueOrThrow({
    where: { id: priceListId },
    select: { id: true, organizationId: true, supplierId: true },
  });

  const righe = await systemPrisma.priceListRow.findMany({
    where: { priceListId },
    select: { id: true, extracted: true, reviewedAt: true },
    orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
  });

  const daAbbinare: RigaDaAbbinare[] = [];
  for (const riga of righe) {
    // Una riga già rivista da una persona non si ricalcola: la sua decisione
    // vale più di qualunque punteggio.
    if (riga.reviewedAt) continue;
    const e = riga.extracted as { tipo?: string; campi?: CampiRiga } | null;
    if (e?.tipo !== 'prodotto' || !e.campi?.descrizione) continue;
    daAbbinare.push({
      chiave: riga.id,
      codiceFornitore: e.campi.codice ?? null,
      descrizione: e.campi.descrizione,
      unitaDiVendita: e.campi.unitaDiVendita ?? null,
      unitSize: e.campi.unitSize ?? null,
      unitOfMeasure: e.campi.unitOfMeasure ?? null,
      packQuantity: e.campi.packQuantity,
    });
  }

  const esiti = await abbinaTutte(
    daAbbinare,
    { organizationId: listino.organizationId, supplierId: listino.supplierId },
    suProgresso,
  );

  let candidatiSalvati = 0;
  for (const esito of esiti) {
    const { matchStatus, azione } = statoDi(esito);

    await systemPrisma.priceListRow.update({
      where: { id: esito.chiave },
      data: {
        supplierProductId: esito.supplierProductId,
        productId: esito.productId,
        matchStatus,
        proposedAction: azione,
        extracted: await conMotivo(esito),
      },
    });

    // I candidati alternativi si salvano solo quando c'è un'offerta a cui
    // agganciarli: `product_match_candidate` esiste per tenere memoria delle
    // proposte su offerte reali, non su righe di staging.
    if (esito.supplierProductId && esito.candidati.length > 0) {
      for (const candidato of esito.candidati) {
        await systemPrisma.productMatchCandidate
          .upsert({
            where: {
              supplierProductId_productId: {
                supplierProductId: esito.supplierProductId,
                productId: candidato.productId,
              },
            },
            update: { score: candidato.punteggio.punteggio.toFixed(3) },
            create: {
              supplierProductId: esito.supplierProductId,
              productId: candidato.productId,
              score: candidato.punteggio.punteggio.toFixed(3),
              method: esito.decisione.metodo,
              reason: esito.decisione.motivo.slice(0, 500),
            },
          })
          .then(() => {
            candidatiSalvati += 1;
          })
          .catch((e: unknown) => console.error('Salvataggio del candidato fallito:', e));
      }
    }
  }

  return { ...riepiloga(esiti), righe: esiti.length, candidatiSalvati };
}

/**
 * Aggiunge alla riga il perché della proposta, senza perdere quello che
 * c'era già dentro `extracted`.
 */
async function conMotivo(esito: EsitoRiga): Promise<object> {
  const riga = await systemPrisma.priceListRow.findUniqueOrThrow({
    where: { id: esito.chiave },
    select: { extracted: true },
  });
  const attuale = (riga.extracted ?? {}) as Record<string, unknown>;
  return {
    ...attuale,
    abbinamento: {
      nucleo: esito.nucleo,
      metodo: esito.decisione.metodo,
      punteggio: esito.decisione.punteggio,
      motivo: esito.decisione.motivo,
      candidati: esito.candidati.map((c) => ({
        productId: c.productId,
        nome: c.nome,
        punteggio: c.punteggio.punteggio,
        trigram: c.punteggio.trigram,
        via: c.via,
      })),
    },
  };
}
