import 'server-only';

import { Decimal } from 'decimal.js';
import { prismaForOrganization } from '@/server/db';
import { SETTINGS_ALL_KEYS, valoriDaRighe } from '@/features/settings/schema';
import type { BaseUnit } from '@/server/domain/packaging/units';
import { confrontaProdotto } from '@/server/domain/pricing/comparison';
import { settingsRepository } from '@/server/repositories/settings';

/**
 * Ricalcola la miglior offerta dei prodotti.
 *
 * È un dato **derivato**: si potrebbe ricavare ogni volta con una query, ma
 * la schermata ordine della Fase 12 la interroga per ogni riga di risultato
 * mentre si digita, e una sottoquery sullo storico per riga non regge quel
 * ritmo. Sta quindi denormalizzata.
 *
 * La regola di confronto **non è qui**: è `confrontaProdotto`, la stessa che
 * usano il report «convenienti» e la scheda prodotto. Una seconda copia della
 * regola divergerebbe, e divergerebbe in silenzio: due schermate indicherebbero
 * fornitori diversi come «più conveniente» e nessuna delle due sembrerebbe
 * sbagliata guardandola da sola.
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
  /** Prodotti in cui almeno due offerte si sono davvero confrontate. */
  confrontabili: number;
  /** Prodotti con un prezzo ma senza confronto possibile. */
  nonConfrontabili: number;
  /** Prodotti rimasti senza nessuna offerta con prezzo. */
  senzaPrezzo: number;
  scritture: number;
  millisecondi: number;
}

type BestOfferSalvata = {
  bestSupplierProductId: string;
  bestPriceNet: { toString(): string };
  bestUnitPrice: { toString(): string };
  offersCount: number;
  spreadPct: { toString(): string } | null;
  comparable: boolean;
} | null;

/**
 * La riga salvata dice già la stessa cosa?
 *
 * I decimali si confrontano per valore e non per stringa: il database
 * restituisce `11.10` dove il calcolo produce `11.1`, e un confronto testuale
 * riscriverebbe ogni riga a ogni ricalcolo — cioè renderebbe la scorciatoia
 * inutile proprio nel caso per cui esiste.
 */
function invariata(
  salvata: BestOfferSalvata,
  nuova: {
    bestSupplierProductId: string;
    bestPriceNet: string;
    bestUnitPrice: string;
    offersCount: number;
    spreadPct: string | null;
    comparable: boolean;
  },
): boolean {
  if (!salvata) return false;
  const stessoDecimale = (a: { toString(): string } | null, b: string | null) => {
    if (a === null || b === null) return a === null && b === null;
    return new Decimal(a.toString()).equals(new Decimal(b));
  };
  return (
    salvata.bestSupplierProductId === nuova.bestSupplierProductId &&
    salvata.offersCount === nuova.offersCount &&
    salvata.comparable === nuova.comparable &&
    stessoDecimale(salvata.bestPriceNet, nuova.bestPriceNet) &&
    stessoDecimale(salvata.bestUnitPrice, nuova.bestUnitPrice) &&
    stessoDecimale(salvata.spreadPct, nuova.spreadPct)
  );
}

export async function ricalcolaMiglioriOfferte(
  organizationId: string,
  productIds?: readonly string[],
): Promise<EsitoRicalcolo> {
  const iniziato = Date.now();
  const db = prismaForOrganization(organizationId);

  const impostazioni = valoriDaRighe(
    await settingsRepository(organizationId).findMany(SETTINGS_ALL_KEYS),
  );
  const opzioni = {
    adesso: new Date(),
    mesiPrimaDiConsiderarloFermo: impostazioni.staleMonths,
  };

  const prodotti = await db.product.findMany({
    where: productIds?.length ? { id: { in: [...productIds] } } : {},
    select: {
      id: true,
      supplierProducts: {
        select: {
          id: true,
          active: true,
          contentPerPack: true,
          baseUnit: true,
          packQuantityConfirmed: true,
          currentPrice: { select: { priceNet: true, validFrom: true } },
        },
      },
      // Serve a sapere se c'è qualcosa da cancellare: `product_best_offer` non
      // ha `organizationId`, quindi il client con scope non lo espone e non si
      // può fare una `deleteMany` mirata.
      bestOffer: {
        select: {
          bestSupplierProductId: true,
          bestPriceNet: true,
          bestUnitPrice: true,
          offersCount: true,
          spreadPct: true,
          comparable: true,
        },
      },
    },
  });

  let confrontabili = 0;
  let nonConfrontabili = 0;
  let senzaPrezzo = 0;

  // Le scritture sono sequenziali e **non** in una transazione unica: è un
  // dato derivato, ricalcolato da capo, e un ricalcolo interrotto a metà si
  // ripara rilanciandolo. Una transazione su tutto il catalogo terrebbe invece
  // un lock lungo su una tabella che le schermate leggono di continuo.
  //
  // Si scrive **solo dove qualcosa cambia**: su un catalogo in cui i prezzi
  // sono fermi, il ricalcolo non tocca nemmeno una riga.
  let scritture = 0;

  for (const prodotto of prodotti) {
    const esito = confrontaProdotto(
      prodotto.supplierProducts.map((o) => ({
        id: o.id,
        attiva: o.active,
        prezzoNetto: o.currentPrice?.priceNet.toString() ?? null,
        contenutoPerConfezione: o.contentPerPack.toString(),
        base: o.baseUnit as BaseUnit,
        confezioneCerta: o.packQuantityConfirmed,
        valeDa: o.currentPrice?.validFrom ?? null,
      })),
      opzioni,
    );

    if (!esito.migliore) {
      // Niente da indicare. Si cancella invece di lasciare in giro un
      // «migliore» che punta a un'offerta senza più prezzo.
      senzaPrezzo += 1;
      if (prodotto.bestOffer) {
        await db.product.update({
          where: { id: prodotto.id },
          data: { bestOffer: { delete: true } },
        });
        scritture += 1;
      }
      continue;
    }

    const confrontato = esito.stato === 'CONFRONTATO';
    if (confrontato) confrontabili += 1;
    else nonConfrontabili += 1;

    const dati = {
      bestSupplierProductId: esito.migliore.id,
      bestPriceNet: esito.migliore.prezzoNetto.toString(),
      bestUnitPrice: esito.migliore.prezzoUnitario.toString(),
      offersCount: esito.classifica.length,
      // Quanto si risparmia scegliendo il migliore invece del peggiore: è il
      // numero che rende utile l'avviso della Fase 13.
      spreadPct: esito.risparmioPct?.toString() ?? null,
      // `true` **solo** quando almeno due offerte si sono confrontate: con una
      // sola non c'è stata nessuna scelta, e dirlo confrontabile farebbe
      // sembrare verificato un prezzo che nessuno ha messo alla prova.
      comparable: confrontato,
      computedAt: new Date(),
    };
    if (invariata(prodotto.bestOffer, dati)) continue;

    await db.product.update({
      where: { id: prodotto.id },
      data: { bestOffer: { upsert: { create: dati, update: dati } } },
    });
    scritture += 1;
  }

  return {
    prodotti: prodotti.length,
    confrontabili,
    nonConfrontabili,
    senzaPrezzo,
    scritture,
    millisecondi: Date.now() - iniziato,
  };
}
