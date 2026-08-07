import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { analizzaDescrizione } from '../src/server/domain/packaging/parse.js';
import { impronta } from '../src/server/domain/packaging/fingerprint.js';
import { baseDi } from '../src/server/domain/packaging/units.js';
import { preparaTermine } from '../src/server/database/ricerca-catalogo.js';

/**
 * Genera un catalogo di prova e misura la ricerca.
 *
 * Serve al criterio della Fase 5: «cercando "birra" compaiono i prodotti
 * giusti in <100 ms su dati di prova realistici (>=5.000 righe generate)».
 * Un criterio espresso in millisecondi va misurato, non stimato.
 *
 * ATTENZIONE: scrive migliaia di righe finte. Va puntato su un database usa
 * e getta, mai su quello di produzione — lo script si rifiuta di partire se
 * riconosce il nome del database live.
 *
 *   GELATERIA_ENV_FILE=... DATABASE_URL=postgresql://.../gelateria_prova \
 *     tsx scripts/genera-dati-prova.ts 5000
 */

const DATABASE_LIVE = 'gelateria_guido';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL mancante.');
if (new URL(connectionString).pathname === `/${DATABASE_LIVE}`) {
  throw new Error(
    `Questo script scrive dati finti e non va eseguito su "${DATABASE_LIVE}". ` +
      'Puntalo su un database di prova.',
  );
}

/** `--solo-misura` rimisura il catalogo gia' presente senza rigenerarlo. */
const soloMisura = process.argv.includes('--solo-misura');
const quanti = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 5000);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Vocabolario preso dai listini veri: categorie, marche e formati come li scrivono. */
const CATEGORIE = [
  { nome: 'Birra', parola: 'BIRRA', formati: ['CL.33X24', 'CL.66 X12', 'cl.33 x6', 'LT.1'] },
  { nome: 'Acqua', parola: 'ACQUA', formati: ['CL.50 PET X24', '1/1 ctx12', 'LT.1.5 X6'] },
  { nome: 'Amari', parola: 'AMARO', formati: ['1/1', '0.700', 'CL.70'] },
  { nome: 'Gin', parola: 'GIN', formati: ['0.700', '1/1', 'CL.70'] },
  { nome: 'Vodka', parola: 'VODKA', formati: ['LT.1', '0.700'] },
  { nome: 'Rum', parola: 'RON', formati: ['LT.1', 'CL.70'] },
  { nome: 'Whisky', parola: 'WHISKY', formati: ['0.700', '1/1'] },
  { nome: 'Bibite', parola: 'BIBITA', formati: ['0.200', 'CL.33 X24', '1/5 VP'] },
  { nome: 'Succhi', parola: 'SUCCO', formati: ['200 ml x 24', 'CL.20 VAP'] },
  { nome: 'Semilavorati', parola: 'PASTA', formati: ['secchiello 5 kg', 'cart. 4 x 2,5 kg', 'KG 3'] },
  { nome: 'Coni e cialde', parola: 'CONI', formati: ['n.120', 'conf. 200 pz', 'box 500 pezzi'] },
  { nome: 'Topping', parola: 'TOPPING', formati: ['ml 950', 'KG 1', 'conf. 6 pz'] },
  { nome: 'Latte e panna', parola: 'PANNA', formati: ['500ml x 6', 'LT.1 X12'] },
  { nome: 'Zucchero', parola: 'ZUCCHERO', formati: ['KG 25 sacco', 'gr.500 X20'] },
  { nome: 'Cioccolato', parola: 'COPERTURA', formati: ['sacco 5 kg', 'KG 1'] },
  { nome: 'Frutta secca', parola: 'GRANELLA', formati: ['470gr', 'sacchetto 1 kg'] },
];

const MARCHE = [
  'SAN BENEDETTO', 'ALISEA', 'RECOARO', 'GOLDBERG', 'POLARA', 'SAN PELLEGRINO',
  'MONTENEGRO', 'BRAULIO', 'AVERNA', 'VARNELLI', 'CAFFO', 'LUXARDO', 'BORGHETTI',
  'BOMBAY', 'BEEFEATER', 'BULLDOG', 'HAVANA CLUB', 'BACARDI', 'JACK DANIELS',
  'GLENALLACHIE', 'BERTAGNOLLI', 'GIFFARD', 'FABBRI', 'LEAGEL', 'PERNIGOTTI',
  'CALLEBAUT', 'ELENKA', 'IRCA', 'MEC3', 'COMPRITAL', 'RUBICONE', 'PREGEL',
];

const QUALIFICATORI = [
  '', 'CLASSICO', 'RISERVA', 'EXTRA', 'PREMIUM', 'BIO', 'ARTIGIANALE', 'SELEZIONE',
  'ORO', 'DOPPIO', 'INTENSO', 'DELICATO', 'ANTICA RICETTA', 'GRAN', 'ROSSO', 'BIANCO',
];

/** Generatore deterministico: due esecuzioni producono lo stesso catalogo. */
function seminato(seme: number): () => number {
  let stato = seme >>> 0;
  return () => {
    stato = (stato * 1_664_525 + 1_013_904_223) >>> 0;
    return stato / 0x1_0000_0000;
  };
}

function scegli<T>(casuale: () => number, elenco: readonly T[]): T {
  return elenco[Math.floor(casuale() * elenco.length)]!;
}

async function main() {
  const casuale = seminato(20260807);

  const organizzazione = await prisma.organization.upsert({
    where: { slug: 'prova' },
    update: {},
    create: { name: 'Gelateria di prova', slug: 'prova' },
  });
  const org = organizzazione.id;

  if (soloMisura) {
    const righe = await prisma.product.count({ where: { organizationId: org } });
    console.log(`→ Rimisuro il catalogo esistente: ${righe} prodotti`);
    await misura(org);
    return;
  }

  console.log(`→ Genero ${quanti} prodotti di prova`);

  // Lo script dev'essere rieseguibile: senza questa pulizia la seconda
  // esecuzione raddoppierebbe il catalogo e sbatterebbe sull'unicita' di
  // (supplier_id, supplier_code). Si cancella solo l'organizzazione di prova.
  const rimossi = await prisma.supplierProduct.deleteMany({ where: { organizationId: org } });
  const rimossiProdotti = await prisma.product.deleteMany({ where: { organizationId: org } });
  if (rimossi.count > 0 || rimossiProdotti.count > 0) {
    console.log(
      `→ Rimosse ${rimossiProdotti.count} righe prodotto e ${rimossi.count} offerte della corsa precedente`,
    );
  }

  const fornitori = [];
  for (const nome of ['Barzelli', 'Cecconi', 'AD Beverage', 'Dolciaria Rossi', 'Gelmar']) {
    fornitori.push(
      await prisma.supplier.upsert({
        where: { organizationId_name: { organizationId: org, name: nome } },
        update: {},
        create: { organizationId: org, name: nome, defaultVatRate: 22 },
      }),
    );
  }

  const prodotti: { id: string; nome: string; categoria: string }[] = [];
  const lottoProdotti: Prisma.ProductCreateManyInput[] = [];

  for (let i = 0; i < quanti; i++) {
    const categoria = scegli(casuale, CATEGORIE);
    const marca = scegli(casuale, MARCHE);
    const qualificatore = scegli(casuale, QUALIFICATORI);
    const formato = scegli(casuale, categoria.formati);
    const nome = [categoria.parola, marca, qualificatore, `#${i}`, formato]
      .filter(Boolean)
      .join(' ');

    const { formato: f, nucleo } = analizzaDescrizione(nome);
    lottoProdotti.push({
      organizationId: org,
      name: nome,
      brand: marca,
      category: categoria.nome,
      unitSize: f.unitSize.toString(),
      unitOfMeasure: f.unitOfMeasure,
      baseUnit: f.baseUnit,
      normalizedName: nucleo || 'senza nome',
      createdBy: 'IMPORT',
    });
  }

  // A lotti: un unico createMany da 5.000 righe supera i limiti dei parametri.
  const DIMENSIONE_LOTTO = 500;
  for (let i = 0; i < lottoProdotti.length; i += DIMENSIONE_LOTTO) {
    await prisma.product.createMany({ data: lottoProdotti.slice(i, i + DIMENSIONE_LOTTO) });
    process.stdout.write(`\r  prodotti: ${Math.min(i + DIMENSIONE_LOTTO, lottoProdotti.length)}`);
  }
  console.log();

  const creati = await prisma.product.findMany({
    where: { organizationId: org },
    select: { id: true, name: true, category: true },
  });
  prodotti.push(...creati.map((p) => ({ id: p.id, nome: p.name, categoria: p.category ?? '' })));

  console.log('→ Genero le offerte dei fornitori (da 1 a 3 per prodotto)');
  const offerte: Prisma.SupplierProductCreateManyInput[] = [];
  let contatore = 0;

  for (const prodotto of prodotti) {
    const quante = 1 + Math.floor(casuale() * 3);
    const scelti = [...fornitori].sort(() => casuale() - 0.5).slice(0, quante);
    for (const fornitore of scelti) {
      const { formato: f, nucleo } = analizzaDescrizione(prodotto.nome);
      const codice = `A${(contatore++).toString().padStart(6, '0')}`;
      offerte.push({
        organizationId: org,
        supplierId: fornitore.id,
        supplierCode: codice,
        rawName: prodotto.nome,
        normalizedName: nucleo || 'senza nome',
        category: prodotto.categoria,
        packQuantity: f.packQuantity,
        packQuantityConfirmed: f.packQuantityConfirmed,
        unitSize: f.unitSize.toString(),
        unitOfMeasure: f.unitOfMeasure,
        contentPerPack: f.contentPerPack.toString(),
        baseUnit: baseDi(f.unitOfMeasure),
        vatRate: 22,
        fingerprint: impronta({
          nucleo: `${nucleo} ${codice}`,
          unitSize: f.unitSize,
          unitOfMeasure: f.unitOfMeasure,
          packQuantity: f.packQuantity,
        }),
        productId: prodotto.id,
        matchStatus: 'CONFIRMED',
      });
    }
  }

  for (let i = 0; i < offerte.length; i += DIMENSIONE_LOTTO) {
    await prisma.supplierProduct.createMany({ data: offerte.slice(i, i + DIMENSIONE_LOTTO) });
    process.stdout.write(`\r  offerte: ${Math.min(i + DIMENSIONE_LOTTO, offerte.length)}`);
  }
  console.log();

  await prisma.$executeRawUnsafe('ANALYZE product, supplier_product, product_alias');

  console.log(
    `\n✓ ${prodotti.length} prodotti e ${offerte.length} offerte in "${new URL(connectionString!).pathname.slice(1)}"`,
  );
  await misura(org);
}

/** Misura la ricerca: mediana e massimo su piu' esecuzioni, non un colpo solo. */
async function misura(org: string) {
  const { eseguiRicerca } = await import('../src/server/database/ricerca-catalogo.js');
  const termini = ['birra', 'amaro', 'acqua', 'gin', 'san benedetto', 'topping', 'bi', 'A000123'];
  const RIPETIZIONI = 15;

  // Una chiamata a vuoto prima di cronometrare: la primissima query di un
  // processo paga l'apertura della connessione. E' un costo vero, ma e' del
  // processo, non della ricerca — sul server in esercizio il pool e' gia'
  // aperto, ed e' quel caso che il criterio della fase misura.
  await eseguiRicerca(org, preparaTermine('riscaldamento'), 20);

  console.log('\n→ Misura della ricerca');
  console.log('  termine'.padEnd(20), 'strategia'.padEnd(14), 'risultati'.padStart(10), 'mediana'.padStart(10), 'max'.padStart(9));

  let peggiore = 0;
  for (const q of termini) {
    const termine = preparaTermine(q);
    const tempi: number[] = [];
    let risultati = 0;
    for (let i = 0; i < RIPETIZIONI; i++) {
      const inizio = performance.now();
      const righe = await eseguiRicerca(org, termine, 20);
      tempi.push(performance.now() - inizio);
      risultati = righe.length;
    }
    tempi.sort((a, b) => a - b);
    const mediana = tempi[Math.floor(tempi.length / 2)]!;
    const massimo = tempi.at(-1)!;
    peggiore = Math.max(peggiore, massimo);
    console.log(
      `  "${q}"`.padEnd(20),
      termine.strategia.padEnd(14),
      String(risultati).padStart(10),
      `${mediana.toFixed(1)} ms`.padStart(10),
      `${massimo.toFixed(1)} ms`.padStart(9),
    );
  }

  console.log(
    `\n${peggiore < 100 ? '✓' : '✗'} Il caso peggiore e ${peggiore.toFixed(1)} ms ` +
      `(criterio della fase: sotto i 100 ms).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (errore) => {
    console.error(errore);
    await prisma.$disconnect();
    process.exit(1);
  });
