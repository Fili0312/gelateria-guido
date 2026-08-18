import 'server-only';

import { prismaForOrganization } from '@/server/db';
import { cercaImmagine } from './index';
import { comuniDaNomi } from './parole-comuni';

/**
 * Le foto dei prodotti appena importati, cercate **dopo**.
 *
 * ── Perché non durante l'import ─────────────────────────────────────────
 * Cercare una foto vuol dire parlare con un servizio esterno, uno alla
 * volta, con una pausa in mezzo per non maltrattarlo. Su un listino da
 * duecento righe nuove sono più di due minuti: se stessero dentro l'import,
 * chi ha caricato il file guarderebbe una rotellina per due minuti dopo che
 * i prezzi — l'unica cosa che gli serviva — sono già a posto da un pezzo.
 *
 * Peggio: un import corretto potrebbe fallire perché un archivio fotografico
 * era irraggiungibile, che è il modo più assurdo di perdere un listino.
 *
 * Qui si parte e non si aspetta. L'import risponde subito, le foto compaiono
 * quando ci sono. Nella schermata d'ordine, nel frattempo, c'è il segnaposto
 * — che è esattamente cosa deve esserci quando una foto non c'è ancora.
 */

/** Un tetto per giro: un listino enorme non deve tenere occupata la fonte per ore. */
const MASSIMO_PER_GIRO = 300;

/**
 * Cerca le foto dei prodotti **mai cercati** e le registra.
 *
 * La coda non è «i prodotti di questo import» ma «quelli di cui non sappiamo
 * ancora niente»: è la stessa cosa subito dopo un import, ed è più robusta —
 * un giro interrotto a metà riparte da dove era rimasto, e un prodotto
 * creato a mano dalla scheda entra in coda senza che nessuno se ne ricordi.
 *
 * Non solleva mai: è un abbellimento, e il suo fallimento non deve poter
 * disturbare niente di ciò che è già andato a buon fine.
 */
export async function cercaFotoMancanti(
  organizationId: string,
  massimo = MASSIMO_PER_GIRO,
): Promise<{ trovate: number; esaminati: number }> {
  const esito = { trovate: 0, esaminati: 0 };

  try {
    const db = prismaForOrganization(organizationId);

    // Le parole comuni si contano su **tutto** il catalogo, non sui prodotti
    // appena arrivati: un lotto da dieci righe darebbe dieci parole rare e
    // nessuna comune, e lo stesso prodotto verrebbe giudicato in modo
    // diverso a seconda di quando è stato importato.
    const tutti = await db.product.findMany({ select: { name: true } });
    const comuni = comuniDaNomi(tutti.map((p) => p.name));

    const prodotti = await db.product.findMany({
      where: {
        imagePath: null,
        imageUpdatedAt: null,
        // Solo quelli di cui sappiamo il produttore: senza marca la ricerca
        // quasi sempre risponde «non trovata», e quel «non trovata» resta
        // scritto. Meglio lasciarli in coda per quando la marca ci sarà.
        OR: [
          { brand: { not: null } },
          {
            supplierProducts: {
              some: {
                active: true,
                supplier: { name: { equals: 'AD Beverage', mode: 'insensitive' } },
              },
            },
          },
        ],
      },
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
      take: massimo,
    });

    for (const p of prodotti) {
      esito.esaminati += 1;
      const trovata = await cercaImmagine(
        {
          name: p.name,
          organizationId,
          brand: p.brand,
          gtin: p.gtin,
          unitSize: p.unitSize.toString(),
          unitOfMeasure: p.unitOfMeasure,
          categoria: p.category?.name ?? null,
          fornitori: p.supplierProducts.map((offerta) => offerta.supplier.name),
        },
        comuni,
      );
      if (trovata.trovata) esito.trovate += 1;

      await db.product.update({
        where: { id: p.id },
        data: {
          imagePath: trovata.percorso,
          imageSource: trovata.fonte,
          imageExternalId: trovata.idEsterno,
          imageConfidence: trovata.trovata ? trovata.confidenza.toFixed(3) : null,
          imageUpdatedAt: new Date(),
        },
      });
    }
  } catch (errore) {
    console.error('Ricerca delle foto dopo l’import fallita:', errore);
  }

  return esito;
}
