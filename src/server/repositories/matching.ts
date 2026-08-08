import 'server-only';

import type { CodaAbbinamento, RigaDaAbbinare } from '@/features/matching/dto';
import type { CodaQuery, Decisione } from '@/features/matching/schema';
import { prismaForOrganization, transactionForOrganization } from '@/server/db';
import { normalizzaTesto } from '@/server/domain/packaging/normalize';

export class MatchingNotFoundError extends Error {
  override readonly name = 'MatchingNotFoundError';
}

export class MatchingConflictError extends Error {
  override readonly name = 'MatchingConflictError';
}

interface Abbinamento {
  nucleo?: string;
  metodo?: string;
  punteggio?: number;
  motivo?: string;
  candidati?: { productId: string; nome: string; punteggio: number; trigram: number; via: string }[];
}

interface CampiRiga {
  codice?: string | null;
  descrizione?: string | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  packQuantity?: number;
  prezzoNetto?: string | null;
}

function formatoLeggibile(campi: CampiRiga | undefined): string {
  if (!campi?.unitSize || !campi.unitOfMeasure) return '—';
  const unita = campi.unitOfMeasure === 'PIECE' ? 'pz' : campi.unitOfMeasure.toLowerCase();
  const pezzi = campi.packQuantity && campi.packQuantity > 1 ? ` ×${campi.packQuantity}` : '';
  return `${campi.unitSize} ${unita}${pezzi}`;
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
      const listini = await db.priceList.findMany({
        where: query.priceListId ? { id: query.priceListId } : {},
        select: {
          id: true,
          scopeLabel: true,
          supplier: { select: { name: true } },
          rows: {
            where: {
              excluded: false,
              reviewedAt: null,
              ...(query.stato === 'tutti' ? {} : { matchStatus: query.stato }),
              // Le righe che non sono prodotti non hanno niente da abbinare.
              productId: query.stato === 'NEW' ? null : undefined,
            },
            select: {
              id: true,
              pageNumber: true,
              rawText: true,
              extracted: true,
              matchStatus: true,
              productId: true,
              product: { select: { name: true } },
            },
            orderBy: [{ pageNumber: 'asc' }, { lineNumber: 'asc' }],
            take: query.limite,
          },
          _count: { select: { rows: true } },
        },
        orderBy: { uploadedAt: 'desc' },
        take: 20,
      });

      const items: RigaDaAbbinare[] = [];
      for (const listino of listini) {
        for (const riga of listino.rows) {
          const extra = (riga.extracted ?? {}) as { campi?: CampiRiga; abbinamento?: Abbinamento };
          // Solo le righe prodotto: le sezioni e le non capite non si abbinano.
          if (!extra.campi?.descrizione) continue;
          const a = extra.abbinamento ?? {};
          items.push({
            id: riga.id,
            priceListId: listino.id,
            listino: listino.scopeLabel,
            fornitore: listino.supplier.name,
            pagina: riga.pageNumber,
            descrizione: extra.campi.descrizione,
            codice: extra.campi.codice ?? null,
            nucleo: a.nucleo ?? '',
            formato: formatoLeggibile(extra.campi),
            prezzoNetto: extra.campi.prezzoNetto ?? null,
            stato: riga.matchStatus as RigaDaAbbinare['stato'],
            metodo: a.metodo ?? null,
            punteggio: a.punteggio ?? null,
            motivo: a.motivo ?? null,
            propostoId: riga.productId,
            propostoNome: riga.product?.name ?? null,
            candidati: a.candidati ?? [],
          });
        }
      }

      const conta = async (stato: 'AUTO' | 'PENDING' | 'NEW') =>
        db.priceList
          .findMany({
            where: query.priceListId ? { id: query.priceListId } : {},
            select: { _count: { select: { rows: { where: { matchStatus: stato, reviewedAt: null } } } } },
          })
          .then((l) => l.reduce((s, x) => s + x._count.rows, 0));

      const [automatici, daRivedere, nuovi] = await Promise.all([
        conta('AUTO'),
        conta('PENDING'),
        conta('NEW'),
      ]);

      return { items, daRivedere, automatici, nuovi, giaNoti: 0 };
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
      // Le righe si raggiungono dal listino: `price_list_row` non ha
      // `organizationId`, quindi il client scoped non lo espone affatto.
      const listino = await db.priceList.findFirst({
        where: { rows: { some: { id: rigaId } } },
        select: {
          id: true,
          rows: { where: { id: rigaId }, select: { id: true, extracted: true, reviewedAt: true } },
        },
      });
      const riga = listino?.rows[0];
      if (!listino || !riga) throw new MatchingNotFoundError('Riga non trovata.');
      if (riga.reviewedAt) {
        throw new MatchingConflictError('Questa riga è già stata rivista.');
      }

      const extra = (riga.extracted ?? {}) as { abbinamento?: Abbinamento };
      const nucleo = extra.abbinamento?.nucleo?.trim() || null;

      const aggiornaRiga = (
        tx: ReturnType<typeof prismaForOrganization>,
        data: Record<string, unknown>,
      ) =>
        tx.priceList.update({
          where: { id: listino.id },
          data: { rows: { update: { where: { id: rigaId }, data } } },
        });

      await transactionForOrganization(organizationId, async (tx) => {
        if (decisione.tipo === 'conferma') {
          const prodotto = await tx.product.findFirst({
            where: { id: decisione.productId },
            select: { id: true },
          });
          if (!prodotto) throw new MatchingNotFoundError('Il prodotto indicato non esiste.');

          await aggiornaRiga(tx, {
            productId: prodotto.id,
            matchStatus: 'CONFIRMED',
            proposedAction: 'CREATE',
            reviewedById: userId,
            reviewedAt: new Date(),
          });
          if (nucleo) await scriviAlias(tx, prodotto.id, nucleo, false);
          return;
        }

        if (decisione.tipo === 'rifiuta') {
          // Il sinonimo negativo è ciò che impedisce alla stessa proposta
          // sbagliata di tornare a ogni import, e di essere rifiutata ogni
          // volta dalla stessa persona.
          if (nucleo) await scriviAlias(tx, decisione.productId, nucleo, true);
          await aggiornaRiga(tx, {
            productId: null,
            matchStatus: 'NEW',
            proposedAction: 'CREATE',
          });
          return;
        }

        if (decisione.tipo === 'nuovo') {
          await aggiornaRiga(tx, {
            productId: null,
            matchStatus: 'NEW',
            proposedAction: 'CREATE',
            reviewedById: userId,
            reviewedAt: new Date(),
          });
          return;
        }

        await aggiornaRiga(tx, {
          matchStatus: 'IGNORED',
          proposedAction: 'IGNORE',
          excluded: true,
          reviewedById: userId,
          reviewedAt: new Date(),
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
