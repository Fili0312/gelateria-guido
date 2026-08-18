import { systemPrisma } from '../src/server/database/system-client.js';
import { cercaImmagine } from '../src/server/catalog/immagini/index.js';
import { comuniDaNomi } from '../src/server/catalog/immagini/parole-comuni.js';

/**
 * Cerca le foto mancanti del catalogo.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/foto-prodotti.ts --scrivi [--quanti 50] [--riprova]
 *       [--prodotto <id>] [--anche-senza-marca] [--fornitore <nome>]
 *       [--aggiornato-prima-di <data ISO>]
 *
 * ── Perché è un comando e non un lavoro dentro la pagina ────────────────
 * Cercare una foto vuol dire parlare con un servizio esterno, aspettare, e
 * ottenere «non c'è» quasi la metà delle volte. Farlo mentre qualcuno apre
 * la schermata d'ordine significa far aspettare lui per un risultato che non
 * gli serve adesso. Qui è un lavoro di sottofondo, con la sua fila e la sua
 * pausa fra una richiesta e l'altra, che si può lanciare e dimenticare.
 *
 * ── Il valore predefinito è la prova, non la scrittura ──────────────────
 * Senza `--scrivi` non tocca niente e stampa cosa farebbe: con una soglia di
 * somiglianza in mezzo, poter guardare gli scarti prima di fidarsi è la
 * differenza fra una soglia scelta e una soglia sperata.
 *
 * Di norma guarda solo i prodotti **mai cercati**. `--riprova` ripassa anche
 * quelli già dichiarati senza foto: serve dopo aver cambiato la soglia o il
 * punteggio, non tutti i giorni — per la fonte è lavoro inutile.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');

function argomento(nome: string): string | null {
  const dove = process.argv.indexOf(nome);
  return dove >= 0 ? (process.argv[dove + 1] ?? null) : null;
}

async function main() {
  const scrivi = process.argv.includes('--scrivi');
  const riprova = process.argv.includes('--riprova');
  const senzaMarca = process.argv.includes('--anche-senza-marca');
  const unoSolo = argomento('--prodotto');
  const fornitore = argomento('--fornitore');
  const primaDiTesto = argomento('--aggiornato-prima-di');
  const aggiornatoPrimaDi = primaDiTesto ? new Date(primaDiTesto) : null;
  const quanti = Number(argomento('--quanti') ?? '100');
  if (!Number.isFinite(quanti) || quanti <= 0) throw new Error('--quanti non valido.');
  if (aggiornatoPrimaDi && Number.isNaN(aggiornatoPrimaDi.getTime())) {
    throw new Error('--aggiornato-prima-di deve essere una data ISO valida.');
  }
  if (aggiornatoPrimaDi && !riprova) {
    throw new Error('--aggiornato-prima-di richiede anche --riprova.');
  }

  const prodotti = await systemPrisma.product.findMany({
    where: unoSolo
      ? { id: unoSolo }
      : {
          imagePath: null,
          // Chi è già stato cercato e non trovato si ripassa solo se
          // richiesto: ripeterlo a ogni giro è chiedere alla fonte le stesse
          // quattrocento domande a cui ha già risposto di no.
          ...(aggiornatoPrimaDi
            ? { imageUpdatedAt: { lt: aggiornatoPrimaDi } }
            : riprova
              ? {}
              : { imageUpdatedAt: null }),
          ...(fornitore
            ? {
                supplierProducts: {
                  some: {
                    active: true,
                    supplier: { name: { equals: fornitore, mode: 'insensitive' } },
                  },
                },
              }
            : {}),
          // ── Perché di norma si guardano solo quelli con la marca ────────
          // Senza marca la ricerca ripiega su una regola molto più severa e
          // quasi sempre risponde «non trovata» — e quel «non trovata»
          // **resta scritto**. Chi lancia questo comando mentre
          // `marche-prodotti.ts` sta ancora lavorando brucerebbe così metà
          // catalogo, e per recuperarlo servirebbe un `--riprova` che nessuno
          // saprebbe di dover fare. Con `--anche-senza-marca` lo si fa
          // apposta, sapendo cosa si sta facendo.
          ...(senzaMarca
            ? {}
            : {
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
              }),
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
    // I mai cercati per primi: un'interruzione a metà non deve far ripartire
    // dallo stesso punto la volta dopo.
    orderBy: [{ imageUpdatedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    take: quanti,
  });

  // Le parole comuni si contano su **tutto** il catalogo, non sul lotto in
  // lavorazione: cinquanta prodotti alla volta darebbero cinquanta soglie
  // diverse, e lo stesso prodotto verrebbe giudicato in modo diverso a
  // seconda di quando lo si è ripassato.
  const tutti = await systemPrisma.product.findMany({ select: { name: true } });
  const comuni = comuniDaNomi(tutti.map((p) => p.name));

  console.log(
    `${prodotti.length} prodotti da esaminare su ${tutti.length} in catalogo` +
      `${scrivi ? '' : ' (prova: non scrivo niente)'}`,
  );
  console.log(`${comuni.size} parole troppo diffuse per identificare: non fanno punteggio\n`);

  let trovate = 0;
  let scartate = 0;
  let vuote = 0;

  for (const [indice, p] of prodotti.entries()) {
    const esito = await cercaImmagine(
      {
        name: p.name,
        brand: p.brand,
        gtin: p.gtin,
        unitSize: p.unitSize.toString(),
        unitOfMeasure: p.unitOfMeasure,
        categoria: p.category?.name ?? null,
        fornitori: p.supplierProducts.map((offerta) => offerta.supplier.name),
      },
      comuni,
    );

    if (esito.trovata) trovate += 1;
    else if (esito.motivo.startsWith('scartata')) scartate += 1;
    else vuote += 1;

    const segno = esito.trovata ? '✓' : '·';
    console.log(
      `${segno} [${indice + 1}/${prodotti.length}] ${p.name.slice(0, 46).padEnd(46)} ${esito.motivo}`,
    );

    if (scrivi) {
      await systemPrisma.product.update({
        where: { id: p.id },
        data: {
          imagePath: esito.percorso,
          imageSource: esito.fonte,
          imageExternalId: esito.idEsterno,
          imageConfidence: esito.trovata ? esito.confidenza.toFixed(3) : null,
          imageUpdatedAt: new Date(),
        },
      });
    }
  }

  console.log(
    `\n${trovate} con foto · ${scartate} scartate perché poco affidabili · ${vuote} senza scheda`,
  );
  if (!scrivi && prodotti.length > 0) {
    console.log('Nulla è stato scritto. Rilancia con --scrivi per salvare.');
  }
}

main()
  .catch((errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => systemPrisma.$disconnect());
