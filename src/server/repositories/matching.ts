import 'server-only';

import type { CodaAbbinamento } from '@/features/matching/dto';
import type { CodaQuery, Decisione } from '@/features/matching/schema';
import { prismaForOrganization, transactionForOrganization } from '@/server/db';
import {
  calcolaPaginazione,
  caricaPaginaCodaAbbinamento,
  contaCodaAbbinamento,
} from '@/server/database/coda-abbinamento';
import { mappaRigaCoda } from '@/server/domain/matching/queue';
import {
  condizioneCasDecisione,
  motivoDecisioneNonApplicabile,
  rigaBloccaApplicazione,
} from '@/server/domain/matching/review';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';

export class MatchingNotFoundError extends Error {
  override readonly name = 'MatchingNotFoundError';
}

export class MatchingConflictError extends Error {
  override readonly name = 'MatchingConflictError';
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export function matchingRepository(organizationId: string) {
  const db = prismaForOrganization(organizationId);

  return {
    /**
     * La coda di revisione.
     *
     * Di default mostra solo `PENDING`: sono le righe su cui il sistema non
     * se l'è sentita di decidere, ed è lì che il tempo di una persona vale.
     * Gli automatici si possono guardare, ma non è lì che serve guardare.
     */
    async coda(query: CodaQuery): Promise<CodaAbbinamento> {
      const conteggi = await contaCodaAbbinamento(organizationId, query);
      const paginazione = calcolaPaginazione(conteggi.totaleFiltrato, query.pagina, query.limite);
      const righe =
        conteggi.totaleFiltrato > 0
          ? await caricaPaginaCodaAbbinamento(organizationId, query, paginazione.offset)
          : [];

      return {
        items: righe.map(mappaRigaCoda),
        daRivedere: conteggi.daRivedere,
        automatici: conteggi.automatici,
        nuovi: conteggi.nuovi,
        giaNoti: 0,
        totale: conteggi.totaleFiltrato,
        paginaCorrente: paginazione.paginaCorrente,
        pagine: paginazione.pagine,
        limite: paginazione.limite,
        haPrecedente: paginazione.haPrecedente,
        haSuccessiva: paginazione.haSuccessiva,
      };
    },

    /**
     * Registra una decisione.
     *
     * Il punto di tutta la fase: **ogni conferma insegna qualcosa**. Un
     * abbinamento confermato scrive un sinonimo, e dal listino successivo
     * quella stessa descrizione si abbina da sola, senza punteggi e senza
     * modelli. Un rifiuto scrive un sinonimo negativo, e quella proposta
     * sbagliata non torna più.
     *
     * È la ragione per cui la revisione non è un costo ricorrente ma un
     * investimento decrescente.
     */
    async decidi(rigaId: string, decisione: Decisione, userId: string): Promise<void> {
      await transactionForOrganization(organizationId, async (tx) => {
        // Lettura e guardia vivono nella stessa transazione serializzabile
        // della scrittura. Il CAS nested sotto ricontrolla inoltre stato e
        // `reviewedAt`: solo una richiesta concorrente può produrre effetti.
        const listino = await tx.priceList.findFirst({
          where: { rows: { some: { id: rigaId } } },
          select: {
            id: true,
            rows: {
              where: { id: rigaId },
              select: {
                id: true,
                extracted: true,
                reviewedAt: true,
                excluded: true,
                matchStatus: true,
                validationErrors: true,
              },
            },
          },
        });
        const riga = listino?.rows[0];
        if (!listino || !riga) throw new MatchingNotFoundError('Riga non trovata.');
        // Una riga già rivista ma ancora invalida può soltanto essere esclusa:
        // altrimenti resterebbe un blocco permanente senza azione possibile.
        const puoEscludereBloccante = decisione.tipo === 'ignora' && rigaBloccaApplicazione(riga);
        const conflitto = puoEscludereBloccante ? null : motivoDecisioneNonApplicabile(riga);
        if (conflitto) throw new MatchingConflictError(conflitto);

        const extra = (riga.extracted ?? {}) as { abbinamento?: { nucleo?: string } };
        const nucleo = extra.abbinamento?.nucleo?.trim() || null;
        const revisione = { reviewedById: userId, reviewedAt: new Date() };

        const aggiornaRiga = async (data: Record<string, unknown>) => {
          try {
            await tx.priceList.update({
              where: { id: listino.id },
              data: {
                rows: {
                  update: {
                    where: condizioneCasDecisione(rigaId, riga.matchStatus, riga.reviewedAt),
                    data,
                  },
                },
              },
            });
          } catch (error) {
            if (errorCode(error) === 'P2025') {
              throw new MatchingConflictError('Questa riga è già stata decisa altrove.');
            }
            throw error;
          }
        };

        if (decisione.tipo === 'conferma') {
          const prodotto = await tx.product.findFirst({
            where: { id: decisione.productId },
            select: { id: true },
          });
          if (!prodotto) throw new MatchingNotFoundError('Il prodotto indicato non esiste.');

          await aggiornaRiga({
            productId: prodotto.id,
            matchStatus: 'CONFIRMED',
            proposedAction: 'CREATE',
            ...revisione,
          });
          if (nucleo) await scriviAlias(tx, prodotto.id, nucleo, false);
          return;
        }

        if (decisione.tipo === 'rifiuta') {
          // Il sinonimo negativo è ciò che impedisce alla stessa proposta
          // sbagliata di tornare a ogni import, e di essere rifiutata ogni
          // volta dalla stessa persona.
          await aggiornaRiga({
            productId: null,
            matchStatus: 'REJECTED',
            proposedAction: 'CREATE',
            ...revisione,
          });
          if (nucleo) await scriviAlias(tx, decisione.productId, nucleo, true);
          return;
        }

        if (decisione.tipo === 'nuovo') {
          await aggiornaRiga({
            productId: null,
            matchStatus: 'NEW',
            proposedAction: 'CREATE',
            ...revisione,
          });
          return;
        }

        await aggiornaRiga({
          matchStatus: 'IGNORED',
          proposedAction: 'IGNORE',
          excluded: true,
          ...revisione,
        });
      });
    },

    /**
     * Scollega un'offerta dal suo prodotto canonico.
     *
     * L'offerta e il suo storico prezzi restano intatti: si scioglie solo il
     * legame. È la contropartita del fatto che un abbinamento automatico non
     * è mai irreversibile.
     */
    async scollega(supplierProductId: string): Promise<void> {
      const offerta = await db.supplierProduct.findFirst({
        where: { id: supplierProductId },
        select: { id: true, productId: true, normalizedName: true },
      });
      if (!offerta) throw new MatchingNotFoundError('Offerta non trovata.');
      if (!offerta.productId) {
        throw new MatchingConflictError('Questa offerta non è collegata a nessun prodotto.');
      }

      await transactionForOrganization(organizationId, async (tx) => {
        // Il sinonimo negativo evita che il prossimo import rifaccia lo stesso
        // abbinamento che si è appena sciolto.
        await scriviAlias(tx, offerta.productId!, offerta.normalizedName, true);
        await tx.supplierProduct.update({
          where: { id: supplierProductId },
          data: { productId: null, matchStatus: 'PENDING' },
        });
      });
    },
  };
}

/** Scrive (o aggiorna) un sinonimo su un prodotto. */
async function scriviAlias(
  tx: ReturnType<typeof prismaForOrganization>,
  productId: string,
  testo: string,
  negativo: boolean,
): Promise<void> {
  const normalizzato = normalizzaTesto(testo);
  if (!normalizzato) return;
  await tx.product.update({
    where: { id: productId },
    data: {
      aliases: {
        upsert: {
          where: { productId_normalizedText: { productId, normalizedText: normalizzato } },
          update: { negative: negativo },
          create: {
            text: testo.slice(0, 200),
            normalizedText: normalizzato,
            negative: negativo,
            source: 'USER',
          },
        },
      },
    },
  });
}
