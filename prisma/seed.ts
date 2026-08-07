import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { analizzaDescrizione } from '../src/server/domain/packaging/parse.js';
import { improntaDaDescrizione } from '../src/server/domain/packaging/fingerprint.js';
import { applicaSconti } from '../src/server/domain/pricing/discounts.js';
import { prezzoPerUnita } from '../src/server/domain/pricing/unit-price.js';
import { basePerPrezzo } from '../src/server/domain/packaging/units.js';

/**
 * Popola il database con quanto basta per lavorare.
 *
 * I due fornitori e i prodotti sono quelli veri — Barzelli e Cecconi, con
 * righe copiate dai loro listini — ma i prezzi entrano dal codice, non da un
 * import: l'importazione dei PDF arriva in Fase 7. Serve a poter aprire
 * l'app e vedere qualcosa di credibile mentre si costruiscono le schermate,
 * e a far girare i primi confronti su formati e confezioni realistici.
 *
 * E' idempotente: si puo' rilanciare quante volte si vuole.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL mancante.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Una riga di listino come la scrive il fornitore. */
interface RigaSeed {
  codice: string;
  descrizione: string;
  um: string;
  listino: string;
  sconti: number[];
  iva: number;
  categoria?: string;
}

const BARZELLI: RigaSeed[] = [
  {
    codice: 'AP112',
    descrizione: 'S.BENED. ACQ. TOWER NAT. 1/1 ctx12',
    um: 'CT',
    listino: '4.61',
    sconti: [6, 10],
    iva: 22,
    categoria: 'Acqua',
  },
  {
    codice: 'LD302',
    descrizione: 'AMARETTO DI SARONNO 1/1',
    um: 'BT',
    listino: '18.18',
    sconti: [6],
    iva: 22,
    categoria: 'Liquori',
  },
  {
    codice: 'LA158',
    descrizione: 'MONTENEGRO AMARO 1/1',
    um: 'BT',
    listino: '19.67',
    sconti: [6],
    iva: 22,
    categoria: 'Amari',
  },
  {
    codice: 'LA167',
    descrizione: 'BRAULIO AMARO 1/1',
    um: 'BT',
    listino: '18.33',
    sconti: [6, 4],
    iva: 22,
    categoria: 'Amari',
  },
  {
    codice: 'LA249',
    descrizione: 'BRAULIO AMARO RISERVA 0.700',
    um: 'BT',
    listino: '26.41',
    sconti: [6, 4],
    iva: 22,
    categoria: 'Amari',
  },
  {
    codice: 'BI010',
    descrizione: 'COCA COLA LATTINA 0.33',
    um: 'PZ',
    listino: '0.60',
    sconti: [6],
    iva: 22,
    categoria: 'Bibite',
  },
  {
    codice: 'BI257',
    descrizione: 'TONICA MEDITERRANEA POLARA 0.200',
    um: 'BT',
    listino: '0.71',
    sconti: [6, 25],
    iva: 22,
    categoria: 'Bibite',
  },
  {
    codice: 'BI735',
    descrizione: 'COCA COLA 0.450 pet v.p.',
    um: 'BT',
    listino: '1.02',
    sconti: [6],
    iva: 22,
    categoria: 'Bibite',
  },
  {
    codice: 'AP113',
    descrizione: 'S.BENED. ACQ. TOWER GAS. 1/1 ctx12',
    um: 'CT',
    listino: '4.61',
    sconti: [6, 10],
    iva: 22,
    categoria: 'Acqua',
  },
  {
    codice: 'LA121',
    descrizione: 'AVERNA AMARO 1/1',
    um: 'BT',
    listino: '16.89',
    sconti: [6],
    iva: 22,
    categoria: 'Amari',
  },
];

const CECCONI: RigaSeed[] = [
  {
    codice: '20561',
    descrizione: 'ALISEA NATURALE CL.50 PET',
    um: 'CO',
    listino: '5.25',
    sconti: [10],
    iva: 22,
    categoria: 'Acqua',
  },
  {
    codice: '54820',
    descrizione: 'RECOARO ACQUA BRILLANTE VAP CL.20',
    um: 'CO',
    listino: '15.29',
    sconti: [10],
    iva: 22,
    categoria: 'Bibite',
  },
  {
    codice: '52912',
    descrizione: 'GOLDBERG TONIC WATER LATTINA CL.15',
    um: 'CO',
    listino: '21.45',
    sconti: [10],
    iva: 22,
    categoria: 'Bibite',
  },
  {
    codice: '70308',
    descrizione: 'HAVANA CLUB 3Y RON 40% LT.1',
    um: 'UN',
    listino: '16.50',
    sconti: [10],
    iva: 22,
    categoria: 'Rum',
  },
  {
    codice: '7A0757',
    descrizione: 'FIVE LAKES SIBERIA VODKA 40% LT.1',
    um: 'UN',
    listino: '11.90',
    sconti: [10],
    iva: 22,
    categoria: 'Vodka',
  },
  {
    codice: '7A0993',
    descrizione: 'SELECT APERITIVO BITTER 17.5% LT.1',
    um: 'UN',
    listino: '13.80',
    sconti: [10],
    iva: 22,
    categoria: 'Aperitivi',
  },
  {
    codice: '7A0934',
    descrizione: 'GIFFARD SCIROPPO ALLA ROSA LT.1',
    um: 'UN',
    listino: '13.90',
    sconti: [10],
    iva: 22,
    categoria: 'Sciroppi',
  },
  {
    codice: '53830',
    descrizione: 'SAN PELLEGRINO LIMONATA CL.20 VAP',
    um: 'CO',
    listino: '17.80',
    sconti: [10],
    iva: 22,
    categoria: 'Bibite',
  },
  {
    codice: '90001',
    descrizione: 'ALISEA NATURALE CL.50 PET X24',
    um: 'CO',
    listino: '5.90',
    sconti: [10],
    iva: 22,
    categoria: 'Acqua',
  },
  {
    codice: '90002',
    descrizione: 'COCA COLA LATTINA CL.33 X24',
    um: 'CO',
    listino: '13.20',
    sconti: [10],
    iva: 22,
    categoria: 'Bibite',
  },
];

async function main() {
  console.log('→ Organizzazione e utente');

  const organizzazione = await prisma.organization.upsert({
    where: { slug: 'gelateria-guido' },
    update: {},
    create: { name: 'Gelateria Guido', slug: 'gelateria-guido' },
  });

  // Un `email` nullo non partecipa a una chiave unica in Postgres, quindi
  // qui non si puo' usare `upsert`: si cerca e, se non c'e', si crea.
  const utente =
    (await prisma.user.findFirst({ where: { organizationId: organizzazione.id } })) ??
    (await prisma.user.create({
      data: { organizationId: organizzazione.id, name: 'Gelateria', role: 'OWNER' },
    }));

  console.log('→ Impostazioni');

  const impostazioni: Record<string, unknown> = {
    // L'avviso "esiste di meglio" scatta solo se ENTRAMBE le soglie sono
    // superate: sotto, diventa rumore che si impara a ignorare.
    'avviso.sogliaPercentuale': 3,
    'avviso.sogliaEuro': 0.3,
    'prezzi.mesiPrimaDiConsiderarloFermo': 6,
    'import.variazioneDaConfermare': 40,
    'ordini.ivaPredefinita': 22,
  };
  for (const [key, value] of Object.entries(impostazioni)) {
    await prisma.setting.upsert({
      where: { organizationId_key: { organizationId: organizzazione.id, key } },
      update: {},
      create: { organizationId: organizzazione.id, key, value: value as never },
    });
  }

  console.log('→ Fornitori');

  const barzelli = await prisma.supplier.upsert({
    where: { organizationId_name: { organizationId: organizzazione.id, name: 'Barzelli' } },
    update: {},
    create: {
      organizationId: organizzazione.id,
      name: 'Barzelli',
      pricesIncludeVat: false,
      defaultVatRate: 22,
      notes: 'Manda preventivi generati da TeamSystem. Due colonne di sconto.',
    },
  });

  const cecconi = await prisma.supplier.upsert({
    where: { organizationId_name: { organizationId: organizzazione.id, name: 'Cecconi' } },
    update: {},
    create: {
      organizationId: organizzazione.id,
      name: 'Cecconi',
      pricesIncludeVat: false,
      defaultVatRate: 22,
      notes:
        'Manda due listini distinti: "liquori" e "vini e spumanti". ' +
        'Descrizioni su piu righe, cinque colonne di sconto, nessun EAN reale.',
    },
  });

  console.log('→ Prodotti e prezzi');

  const oggi = new Date().toISOString().slice(0, 10);
  let creati = 0;

  for (const [fornitore, righe] of [
    [barzelli, BARZELLI],
    [cecconi, CECCONI],
  ] as const) {
    for (const riga of righe) {
      const { formato, nucleo } = analizzaDescrizione(riga.descrizione, {
        unitaDiVendita: riga.um,
      });
      const netto = applicaSconti(riga.listino, riga.sconti);
      const unitario = prezzoPerUnita(netto, formato.contentPerPack, formato.baseUnit);

      // Il prodotto canonico: articolo + formato unitario, senza confezione.
      // Due fornitori che vendono la stessa bottiglia finiscono qui sopra,
      // ed e' quello che rende possibile il confronto.
      const prodotto =
        (await prisma.product.findFirst({
          where: {
            organizationId: organizzazione.id,
            normalizedName: nucleo,
            unitSize: formato.unitSize.toString(),
            unitOfMeasure: formato.unitOfMeasure,
          },
        })) ??
        (await prisma.product.create({
          data: {
            organizationId: organizzazione.id,
            name: riga.descrizione,
            category: riga.categoria,
            unitSize: formato.unitSize.toString(),
            unitOfMeasure: formato.unitOfMeasure,
            baseUnit: formato.baseUnit,
            normalizedName: nucleo,
            createdBy: 'IMPORT',
          },
        }));

      const prodottoFornitore = await prisma.supplierProduct.upsert({
        where: {
          supplierId_supplierCode: { supplierId: fornitore.id, supplierCode: riga.codice },
        },
        update: { lastSeenAt: new Date() },
        create: {
          organizationId: organizzazione.id,
          supplierId: fornitore.id,
          supplierCode: riga.codice,
          rawName: riga.descrizione,
          category: riga.categoria,
          packQuantity: formato.packQuantity,
          packQuantityConfirmed: formato.packQuantityConfirmed,
          unitSize: formato.unitSize.toString(),
          unitOfMeasure: formato.unitOfMeasure,
          contentPerPack: formato.contentPerPack.toString(),
          baseUnit: formato.baseUnit,
          vatRate: riga.iva,
          fingerprint: improntaDaDescrizione(riga.descrizione, { unitaDiVendita: riga.um }),
          productId: prodotto.id,
          matchStatus: 'CONFIRMED',
        },
      });

      const prezzoEsistente = await prisma.supplierProductPrice.findFirst({
        where: { supplierProductId: prodottoFornitore.id, validTo: null },
      });

      if (!prezzoEsistente) {
        const prezzo = await prisma.supplierProductPrice.create({
          data: {
            supplierProductId: prodottoFornitore.id,
            priceList: riga.listino,
            discounts: riga.sconti,
            priceNet: netto.toString(),
            vatRate: riga.iva,
            unitPrice: unitario.valore.toString(),
            unitPriceBasis: basePerPrezzo(formato.baseUnit),
            validFrom: new Date(oggi),
            source: 'MANUAL',
            createdById: utente.id,
          },
        });
        await prisma.supplierProduct.update({
          where: { id: prodottoFornitore.id },
          data: { currentPriceId: prezzo.id },
        });
        creati++;
      }
    }
  }

  console.log(`  ${creati} prezzi inseriti`);

  const conteggi = {
    fornitori: await prisma.supplier.count(),
    prodotti: await prisma.product.count(),
    prodottiFornitore: await prisma.supplierProduct.count(),
    prezzi: await prisma.supplierProductPrice.count(),
    daDefinire: await prisma.supplierProduct.count({ where: { packQuantityConfirmed: false } }),
  };

  console.log('\n✓ Seed completato');
  console.log(`  fornitori:           ${conteggi.fornitori}`);
  console.log(`  prodotti canonici:   ${conteggi.prodotti}`);
  console.log(`  prodotti fornitore:  ${conteggi.prodottiFornitore}`);
  console.log(`  prezzi:              ${conteggi.prezzi}`);
  console.log(`  confezione da definire: ${conteggi.daDefinire}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (errore) => {
    console.error(errore);
    await prisma.$disconnect();
    process.exit(1);
  });
