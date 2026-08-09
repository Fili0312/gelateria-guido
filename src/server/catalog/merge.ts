import 'server-only';

import { transactionForOrganization } from '@/server/db';
import { prismaForOrganization } from '@/server/db';
import { ricalcolaMiglioriOfferte } from '@/server/import/best-offer';

/**
 * Unire due prodotti che sono lo stesso articolo.
 *
 * ── Cosa NON succede ────────────────────────────────────────────────────
 * Le offerte **non si fondono**. Ognuna resta la sua: il suo fornitore, il suo
 * codice, la sua confezione, il suo storico prezzi. Si sposta soltanto
 * l'etichetta che dice a quale articolo appartengono. È la stessa cosa che
 * fa «È questo» in coda abbinamenti, applicata a due prodotti già creati.
 *
 * ── Chi sopravvive ──────────────────────────────────────────────────────
 * Quello **con più offerte**, e a parità il più vecchio: è quello a cui
 * puntano più cose — alias, righe di listino, ordini — e spostare meno
 * riferimenti significa avere meno occasioni di sbagliare.
 *
 * ── Cosa si porta dietro ────────────────────────────────────────────────
 * Il nome del prodotto assorbito diventa un **sinonimo** del sopravvissuto:
 * è la scritta con cui quel fornitore lo chiama, e al prossimo listino deve
 * far scattare l'abbinamento da sola. Senza, l'unione si dovrebbe rifare a
 * ogni import.
 */

export class MergeError extends Error {
  override readonly name = 'MergeError';
}

export interface EsitoUnione {
  sopravvissutoId: string;
  sopravvissutoNome: string;
  assorbitoNome: string;
  offerteSpostate: number;
  righeSpostate: number;
  aliasCreati: number;
}

export async function unisciProdotti(
  organizationId: string,
  primoId: string,
  secondoId: string,
): Promise<EsitoUnione> {
  if (primoId === secondoId) throw new MergeError('Sono lo stesso prodotto.');

  const db = prismaForOrganization(organizationId);
  const prodotti = await db.product.findMany({
    where: { id: { in: [primoId, secondoId] } },
    select: {
      id: true,
      name: true,
      normalizedName: true,
      categoryId: true,
      createdAt: true,
      _count: { select: { supplierProducts: true } },
    },
  });
  if (prodotti.length !== 2) throw new MergeError('Uno dei due prodotti non esiste.');

  const [sopravvissuto, assorbito] = [...prodotti].sort(
    (a, b) =>
      b._count.supplierProducts - a._count.supplierProducts ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  ) as [(typeof prodotti)[number], (typeof prodotti)[number]];

  const esito: EsitoUnione = {
    sopravvissutoId: sopravvissuto.id,
    sopravvissutoNome: sopravvissuto.name,
    assorbitoNome: assorbito.name,
    offerteSpostate: 0,
    righeSpostate: 0,
    aliasCreati: 0,
  };

  await transactionForOrganization(organizationId, async (tx) => {
    // Le offerte cambiano padrone. Restano identiche in tutto il resto.
    const spostate = await tx.supplierProduct.updateMany({
      where: { productId: assorbito.id },
      data: { productId: sopravvissuto.id },
    });
    esito.offerteSpostate = spostate.count;

    // Le righe di listino che puntavano all'assorbito: se restassero,
    // il prossimo import ricreerebbe il prodotto appena unito.
    const listini = await tx.priceList.findMany({
      where: { rows: { some: { productId: assorbito.id } } },
      select: { id: true, _count: { select: { rows: { where: { productId: assorbito.id } } } } },
    });
    for (const listino of listini) {
      await tx.priceList.update({
        where: { id: listino.id },
        data: { rows: { updateMany: { where: { productId: assorbito.id }, data: { productId: sopravvissuto.id } } } },
      });
      esito.righeSpostate += listino._count.rows;
    }

    // Il nome dell'assorbito diventa un sinonimo: è la scritta con cui quel
    // fornitore lo chiama, e al prossimo listino deve bastare da sola.
    const nucleo = assorbito.normalizedName.trim();
    if (nucleo) {
      await tx.product
        .update({
          where: { id: sopravvissuto.id },
          data: {
            aliases: {
              create: { text: assorbito.name.slice(0, 200), normalizedText: nucleo, source: 'USER' },
            },
          },
        })
        .then(() => {
          esito.aliasCreati += 1;
        })
        // Il sinonimo c'era già: va bene, è quello che doveva esserci.
        .catch(() => {});
    }

    // La categoria del sopravvissuto, se non ce l'ha e l'altro sì.
    if (!sopravvissuto.categoryId && assorbito.categoryId) {
      await tx.product.update({
        where: { id: sopravvissuto.id },
        data: { categoryId: assorbito.categoryId },
      });
    }

    // La miglior offerta dell'assorbito punta a un'offerta che ora appartiene
    // a un altro prodotto: va tolta prima, o la chiave esterna blocca. Si
    // ricalcola comunque subito dopo.
    await tx.product
      .update({ where: { id: assorbito.id }, data: { bestOffer: { delete: true } } })
      .catch(() => {});

    await tx.product.delete({ where: { id: assorbito.id } });
  });

  // Fuori dalla transazione: è un dato derivato, e se fallisse non deve poter
  // annullare un'unione corretta.
  await ricalcolaMiglioriOfferte(organizationId, [sopravvissuto.id]);

  return esito;
}
