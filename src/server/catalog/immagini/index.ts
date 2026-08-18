import 'server-only';

import { prismaForOrganization } from '@/server/db';
import {
  cercaAdBeverage,
  estraiImmagineAdBeverage,
  isFornitoreAdBeverage,
  scaricaImmagineAdBeverage,
} from './ad-beverage';
import { salvaImmagine } from './archivio';
import { perEan, perTesto, scarica, type SchedaTrovata } from './open-food-facts';
import { normalizza, type DatiProdotto, type ProdottoNormalizzato } from './normalizza';
import { comuniDaNomi } from './parole-comuni';
import { SOGLIA_AUTOMATICA, valuta } from './punteggio';

/**
 * La ricerca della foto di un prodotto, dall'inizio alla fine.
 *
 * ── L'ordine, e perché è questo ─────────────────────────────────────────
 *
 *   AD Beverage (solo suoi prodotti)  →  EAN OFF  →  testo OFF  →  niente
 *
 * Il catalogo ufficiale viene prima soltanto se il prodotto ha un'offerta
 * AD attiva e supera la soglia dedicata 0,90. Per tutti gli altri prodotti
 * il flusso resta identico. Dentro OFF, l'EAN viene prima perché **è** il
 * prodotto; la ricerca testuale arriva dopo col punteggio davanti.
 *
 * «Niente» è un esito legittimo e viene **scritto a database**, non solo
 * subito: senza, ogni riempimento ripartirebbe da capo sugli stessi
 * quattrocento prodotti che non hanno una scheda, e la fonte ci vedrebbe
 * arrivare ogni notte con le stesse domande.
 *
 * ── Cosa non c'è qui ────────────────────────────────────────────────────
 * Non c'è nessun ripiego su una foto «di categoria» presa da un archivio
 * fotografico. Una bottiglia generica al posto di un prodotto preciso
 * riempie il riquadro e mente: chi scorre riconosce le sagome, non legge.
 * Al posto della foto sbagliata c'è un'icona che si dichiara tale.
 */

export type FonteImmagine = 'AD_BEVERAGE' | 'OFF' | 'MANUAL' | 'NONE';

export interface EsitoImmagine {
  trovata: boolean;
  /** Il percorso relativo nello storage, quando la foto c'è. */
  percorso: string | null;
  fonte: FonteImmagine;
  /** Il barcode della scheda usata: serve a risalire alla fonte. */
  idEsterno: string | null;
  confidenza: number;
  /** In italiano, per i log del riempimento. */
  motivo: string;
}

const NIENTE = (motivo: string): EsitoImmagine => ({
  trovata: false,
  percorso: null,
  fonte: 'NONE',
  idEsterno: null,
  confidenza: 0,
  motivo,
});

/**
 * Cerca la foto, senza toccare il database.
 *
 * Separata dal salvataggio perché è la parte che si può provare: le dai un
 * prodotto, ti dice cosa avrebbe fatto. È anche la parte che parla con la
 * rete, e tenerla fuori dalle transazioni non è un dettaglio — una
 * transazione aperta per il tempo di una richiesta HTTP tiene un lucchetto
 * su una riga per dodici secondi.
 */
export async function cercaImmagine(
  prodotto: DatiProdotto,
  /**
   * Le parole che in questo catalogo non identificano niente. Si passano da
   * fuori perché si calcolano **una volta** per l'intero riempimento: farlo
   * qui vorrebbe dire rileggere il catalogo per ogni singola foto.
   */
  comuni: ReadonlySet<string> = new Set(),
): Promise<EsitoImmagine> {
  const dati: ProdottoNormalizzato = normalizza(prodotto);

  if (prodotto.fornitori?.some(isFornitoreAdBeverage)) {
    const ad = await cercaAdBeverage(prodotto);
    if (ad.accettato && ad.prodotto && estraiImmagineAdBeverage(ad.prodotto)) {
      const file = await scaricaImmagineAdBeverage(ad.prodotto);
      if (file) {
        const percorso = await salvaImmagine(file.dati, file.tipo);
        if (percorso) {
          return {
            trovata: true,
            percorso,
            fonte: 'AD_BEVERAGE',
            idEsterno: ad.prodotto.codice ?? ad.prodotto.id,
            confidenza: ad.confidenza,
            motivo: ad.motivo,
          };
        }
      }
    }
  }

  const riferimento = {
    nome: dati.name,
    marca: dati.brand,
    variante: dati.variant,
    formato: dati.size,
    ean: dati.ean,
  };

  const scelta = async (): Promise<{
    scheda: SchedaTrovata;
    confidenza: number;
    motivo: string;
  } | null> => {
    // ── Caso A: il barcode ───────────────────────────────────────────────
    if (dati.ean) {
      const scheda = await perEan(dati.ean);
      if (scheda) {
        const esito = valuta(riferimento, scheda, comuni);
        return { scheda, confidenza: esito.confidenza, motivo: `EAN ${dati.ean}: ${esito.motivo}` };
      }
    }

    // ── Caso B: le parole ────────────────────────────────────────────────
    if (!dati.imageQuery) return null;
    const candidati = await perTesto(dati.imageQuery);
    if (candidati.length === 0) return null;

    // Si giudicano **tutti** e si tiene il migliore. Prendere il primo
    // sarebbe fidarsi dell'ordinamento della fonte, che ordina per
    // popolarità: cercando «absolut» il primo risultato è un sugo per la
    // pasta della Heinz che ha la vodka fra gli ingredienti.
    let migliore: {
      scheda: SchedaTrovata;
      confidenza: number;
      motivo: string;
    } | null = null;
    for (const scheda of candidati) {
      const esito = valuta(riferimento, scheda, comuni);
      if (!migliore || esito.confidenza > migliore.confidenza) {
        migliore = { scheda, confidenza: esito.confidenza, motivo: esito.motivo };
      }
    }
    return migliore;
  };

  const vincitore = await scelta();
  if (!vincitore) return NIENTE('nessuna scheda con foto');

  if (vincitore.confidenza < SOGLIA_AUTOMATICA) {
    return NIENTE(
      `scartata a ${vincitore.confidenza.toFixed(2)} (${vincitore.motivo}) — sotto ${SOGLIA_AUTOMATICA}`,
    );
  }

  // La versione ridotta quando c'è: sono ~200 px invece di ~800, e nella
  // card ne servono novanta. Scaricare l'originale sarebbe dieci volte il
  // peso per pixel che nessuno vedrà.
  const indirizzo = vincitore.scheda.fotoPiccola ?? vincitore.scheda.foto;
  if (!indirizzo) return NIENTE('scheda senza foto utilizzabile');

  const file = await scarica(indirizzo);
  if (!file) return NIENTE('foto non scaricabile');

  const percorso = await salvaImmagine(file.dati, file.tipo);
  if (!percorso) return NIENTE(`formato immagine non gestito (${file.tipo})`);

  return {
    trovata: true,
    percorso,
    fonte: 'OFF',
    idEsterno: vincitore.scheda.codice,
    confidenza: vincitore.confidenza,
    motivo: vincitore.motivo,
  };
}

/**
 * Cerca la foto di un prodotto **e la registra**.
 *
 * È la funzione da chiamare per rimediare a una foto sbagliata: cancella
 * quello che sapevamo e ricomincia. Esiste perché prima o poi una foto
 * sbagliata passerà — nessuna soglia è perfetta — e quando succede deve
 * bastare una riga, non un intervento sul database.
 */
export async function aggiornaImmagineProdotto(
  organizationId: string,
  productId: string,
): Promise<EsitoImmagine> {
  const db = prismaForOrganization(organizationId);
  const prodotto = await db.product.findFirst({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      brand: true,
      gtin: true,
      unitSize: true,
      unitOfMeasure: true,
      category: { select: { name: true } },
      supplierProducts: {
        where: { active: true },
        select: { supplier: { select: { name: true } } },
      },
    },
  });
  if (!prodotto) return NIENTE('prodotto inesistente');

  const esito = await cercaImmagine(
    {
      name: prodotto.name,
      brand: prodotto.brand,
      gtin: prodotto.gtin,
      unitSize: prodotto.unitSize.toString(),
      unitOfMeasure: prodotto.unitOfMeasure,
      categoria: prodotto.category?.name ?? null,
      fornitori: prodotto.supplierProducts.map((offerta) => offerta.supplier.name),
    },
    await paroleComuni(organizationId),
  );

  await db.product.update({
    where: { id: productId },
    data: {
      imagePath: esito.percorso,
      imageSource: esito.fonte,
      imageExternalId: esito.idEsterno,
      // Niente confidenza quando non c'è foto: uno zero in colonna si legge
      // come «trovata, ma pessima», che è un'altra cosa da «non trovata».
      imageConfidence: esito.trovata ? esito.confidenza.toFixed(3) : null,
      imageUpdatedAt: new Date(),
    },
  });

  return esito;
}

/** Le parole comuni del catalogo di un'organizzazione. */
export async function paroleComuni(organizationId: string): Promise<Set<string>> {
  const prodotti = await prismaForOrganization(organizationId).product.findMany({
    select: { name: true },
  });
  return comuniDaNomi(prodotti.map((p) => p.name));
}

export { normalizza, SOGLIA_AUTOMATICA };
export { comuniDaNomi } from './parole-comuni';
export type { DatiProdotto, ProdottoNormalizzato };
