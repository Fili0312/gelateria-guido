import 'server-only';

import { Decimal } from 'decimal.js';
import { prismaForOrganization } from '@/server/db';
import { confrontaOfferte } from '@/server/domain/pricing/unit-price';

/**
 * Ricalcola la miglior offerta dei prodotti toccati da un import.
 *
 * È un dato **derivato**: si potrebbe ricavare ogni volta con una query, ma
 * la schermata ordine della Fase 12 la interroga per ogni riga di risultato
 * mentre si digita, e una sottoquery sullo storico per riga non regge quel
 * ritmo. Sta quindi denormalizzata, e si ricalcola da capo.
 *
 * **Fuori dalla transazione dell'import**, di proposito. Se il ricalcolo
 * fallisse non deve poter annullare un import corretto: il peggio che può
 * capitare è una miglior offerta vecchia di qualche minuto, che si ripara
 * ricalcolando. Un import annullato a metà no.
 *
 * Si ricalcola **da capo** e non a pezzi: aggiornare in modo incrementale
 * vorrebbe dire tenere il conto di quali offerte sono cambiate, e un conto
 * sbagliato lascerebbe indicato come migliore un prezzo che non lo è più —
 * senza che nulla lo segnali.
 */

export interface EsitoRicalcolo {
  prodotti: number;
  confrontabili: number;
  nonConfrontabili: number;
}

export async function ricalcolaMiglioriOfferte(
  organizationId: string,
  productIds?: readonly string[],
): Promise<EsitoRicalcolo> {
  const db = prismaForOrganization(organizationId);

  const prodotti = await db.product.findMany({
    where: productIds?.length ? { id: { in: [...productIds] } } : {},
    select: {
      id: true,
      supplierProducts: {
        where: { active: true },
        select: {
          id: true,
          contentPerPack: true,
          baseUnit: true,
          packQuantityConfirmed: true,
          currentPrice: { select: { priceNet: true, unitPrice: true } },
        },
      },
    },
  });

  let confrontabili = 0;
  let nonConfrontabili = 0;

  for (const prodotto of prodotti) {
    const offerte = prodotto.supplierProducts
      .filter((o) => o.currentPrice !== null)
      .map((o) => ({
        id: o.id,
        prezzoNetto: o.currentPrice!.priceNet.toString(),
        contenutoPerConfezione: o.contentPerPack.toString(),
        base: o.baseUnit,
        // Un'offerta di cui non si sa quante bottiglie contenga il collo non
        // ha un prezzo al litro: ha un'ipotesi. Non partecipa al confronto.
        confezioneCerta: o.packQuantityConfirmed,
      }));

    if (offerte.length === 0) {
      await db.product.update({
        where: { id: prodotto.id },
        data: { bestOffer: { delete: true } },
      }).catch(() => {
        // Non ce n'era una da cancellare: va bene così.
      });
      continue;
    }

    const esito = confrontaOfferte(offerte);
    if (!esito.migliore) {
      // Offerte in unità diverse (kg contro litri): meglio nessun confronto
      // che un numero falso. Si registra comunque, con `comparable: false`,
      // così l'interfaccia può dire *perché* non c'è un vincitore.
      nonConfrontabili += 1;
      const prima = offerte[0]!;
      await scrivi(db, prodotto.id, prima.id, prima.prezzoNetto, '0', offerte.length, null, false);
      continue;
    }

    confrontabili += 1;
    const migliore = offerte.find((o) => o.id === esito.migliore!.id)!;
    const peggiore = esito.classifica.at(-1)!;
    // Quanto si risparmia scegliendo il migliore invece del peggiore: è il
    // numero che rende utile l'avviso della Fase 13.
    const spread = peggiore.unitario.gt(0)
      ? peggiore.unitario.minus(esito.migliore.unitario).div(peggiore.unitario).mul(100)
      : new Decimal(0);

    await scrivi(
      db,
      prodotto.id,
      migliore.id,
      migliore.prezzoNetto,
      esito.migliore.unitario.toString(),
      offerte.length,
      spread.toDecimalPlaces(2).toString(),
      true,
    );
  }

  return { prodotti: prodotti.length, confrontabili, nonConfrontabili };
}

async function scrivi(
  db: ReturnType<typeof prismaForOrganization>,
  productId: string,
  bestSupplierProductId: string,
  bestPriceNet: string,
  bestUnitPrice: string,
  offersCount: number,
  spreadPct: string | null,
  comparable: boolean,
): Promise<void> {
  const dati = {
    bestSupplierProductId,
    bestPriceNet,
    bestUnitPrice,
    offersCount,
    spreadPct,
    comparable,
    computedAt: new Date(),
  };
  // Passa dal prodotto e non dal delegate: `product_best_offer` non ha
  // `organizationId`, quindi il client scoped non lo espone.
  await db.product.update({
    where: { id: productId },
    data: { bestOffer: { upsert: { create: dati, update: dati } } },
  });
}
