import { salvaImmagine } from '../src/server/catalog/immagini/archivio.js';
import {
  catalogoAdBeverageConCache,
  estraiImmagineAdBeverage,
  scaricaImmagineAdBeverage,
  trovaMiglioreAdBeverage,
  type EsitoMatchAdBeverage,
} from '../src/server/catalog/immagini/ad-beverage.js';
import {
  matchAdBeverageConIaLotto,
  type RichiestaMatchAdBeverageIa,
} from '../src/server/catalog/immagini/ad-beverage-ai.js';
import type { DatiProdotto } from '../src/server/catalog/immagini/normalizza.js';
import { systemPrisma } from '../src/server/database/system-client.js';

/**
 * Recupera con DeepSeek le immagini AD rimaste senza match deterministico.
 * Non interroga Open Food Facts e lavora in piccoli lotti sequenziali.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/foto-ad-beverage-ia.ts --scrivi [--quanti 300]
 */

const LOTTO_IA = 6;

function argomento(nome: string): string | null {
  const indice = process.argv.indexOf(nome);
  return indice >= 0 ? (process.argv[indice + 1] ?? null) : null;
}

type ProdottoLocale = Awaited<ReturnType<typeof caricaProdotti>>[number];

async function caricaProdotti(massimo: number) {
  return systemPrisma.product.findMany({
    where: {
      imagePath: null,
      supplierProducts: {
        some: {
          active: true,
          supplier: { name: { equals: 'AD Beverage', mode: 'insensitive' } },
        },
      },
    },
    select: {
      id: true,
      organizationId: true,
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
    orderBy: { name: 'asc' },
    take: massimo,
  });
}

function dati(p: ProdottoLocale): DatiProdotto {
  return {
    name: p.name,
    organizationId: p.organizationId,
    brand: p.brand,
    gtin: p.gtin,
    unitSize: p.unitSize.toString(),
    unitOfMeasure: p.unitOfMeasure,
    categoria: p.category?.name ?? null,
    fornitori: p.supplierProducts.map((offerta) => offerta.supplier.name),
    soloAdBeverage: true,
  };
}

async function chiediConRiduzione(
  richieste: readonly RichiestaMatchAdBeverageIa[],
  organizationId: string,
  risultati: Map<string, EsitoMatchAdBeverage>,
): Promise<number> {
  if (richieste.length === 0) return 0;
  try {
    const risposte = await matchAdBeverageConIaLotto(richieste, organizationId);
    for (const [chiave, risposta] of risposte) risultati.set(chiave, risposta);
    return 1;
  } catch (errore) {
    if ((errore as Error).name === 'AiBudgetError') throw errore;
    if (richieste.length === 1) {
      console.error(`DeepSeek non ha deciso ${richieste[0]!.locale.name}:`, errore);
      return 1;
    }
    const meta = Math.ceil(richieste.length / 2);
    return (
      (await chiediConRiduzione(richieste.slice(0, meta), organizationId, risultati)) +
      (await chiediConRiduzione(richieste.slice(meta), organizationId, risultati))
    );
  }
}

async function main() {
  const scrivi = process.argv.includes('--scrivi');
  const massimo = Number(argomento('--quanti') ?? '300');
  if (!Number.isInteger(massimo) || massimo <= 0) throw new Error('--quanti non valido.');

  const prodotti = await caricaProdotti(massimo);
  const catalogo = await catalogoAdBeverageConCache();
  console.log(
    `${prodotti.length} prodotti AD senza foto · ${catalogo.length} schede ufficiali` +
      `${scrivi ? '' : ' · le chiamate IA vengono registrate, le foto non vengono salvate'}`,
  );

  const risultati = new Map<string, EsitoMatchAdBeverage>();
  const perOrganizzazione = new Map<string, RichiestaMatchAdBeverageIa[]>();
  for (const prodotto of prodotti) {
    const locale = dati(prodotto);
    const precedente = trovaMiglioreAdBeverage(locale, catalogo);
    risultati.set(prodotto.id, precedente);
    if (
      precedente.accettato &&
      precedente.prodotto &&
      estraiImmagineAdBeverage(precedente.prodotto)
    ) {
      continue;
    }
    const gruppo = perOrganizzazione.get(prodotto.organizationId) ?? [];
    gruppo.push({ chiave: prodotto.id, locale, precedente });
    perOrganizzazione.set(prodotto.organizationId, gruppo);
  }

  let chiamate = 0;
  for (const [organizationId, richieste] of perOrganizzazione) {
    for (let i = 0; i < richieste.length; i += LOTTO_IA) {
      chiamate += await chiediConRiduzione(
        richieste.slice(i, i + LOTTO_IA),
        organizationId,
        risultati,
      );
      console.log(`DeepSeek: ${Math.min(i + LOTTO_IA, richieste.length)}/${richieste.length}`);
    }
  }

  let trovate = 0;
  let dallaRegola = 0;
  let dallaIa = 0;
  let scartate = 0;
  for (const [indice, prodotto] of prodotti.entries()) {
    const esito = risultati.get(prodotto.id)!;
    let percorso: string | null = null;
    if (esito.accettato && esito.prodotto && estraiImmagineAdBeverage(esito.prodotto)) {
      if (scrivi) {
        const file = await scaricaImmagineAdBeverage(esito.prodotto);
        if (file) percorso = await salvaImmagine(file.dati, file.tipo);
      } else {
        percorso = 'dry-run';
      }
    }

    if (percorso) {
      trovate += 1;
      if (esito.motivo.startsWith('DeepSeek:')) dallaIa += 1;
      else dallaRegola += 1;
    } else {
      scartate += 1;
    }

    console.log(
      `${percorso ? '✓' : '·'} [${indice + 1}/${prodotti.length}] ${prodotto.name.slice(0, 44).padEnd(44)} → ` +
        `${esito.prodotto?.nome ?? 'nessun candidato'} · ${esito.confidenza.toFixed(2)} · ${esito.motivo}`,
    );

    if (scrivi) {
      await systemPrisma.product.update({
        where: { id: prodotto.id },
        data: percorso
          ? {
              imagePath: percorso,
              imageSource: 'AD_BEVERAGE',
              imageExternalId: esito.prodotto!.codice ?? esito.prodotto!.id,
              imageConfidence: esito.confidenza.toFixed(3),
              imageUpdatedAt: new Date(),
            }
          : {
              imagePath: null,
              imageSource: 'NONE',
              imageExternalId: null,
              imageConfidence: null,
              imageUpdatedAt: new Date(),
            },
      });
    }
  }

  console.log(
    `\n${trovate} foto: ${dallaRegola} dalla regola, ${dallaIa} da DeepSeek · ` +
      `${scartate} senza match · ${chiamate} chiamate IA`,
  );
}

main()
  .catch((errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => systemPrisma.$disconnect());
