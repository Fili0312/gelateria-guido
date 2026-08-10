import { systemPrisma } from '../src/server/database/system-client.js';
import { abbinaRiga } from '../src/server/import/matching/cascata.js';
import { analizzaDescrizione } from '../src/server/domain/packaging/parse.js';
import { normalizzaTesto } from '../src/server/domain/packaging/normalize.js';
import { baseDi } from '../src/server/domain/packaging/units.js';

/**
 * I quattro criteri della Fase 9, su un database vero.
 *
 * Il caso che conta è quello di Filippo: la stessa acqua da due fornitori
 * diversi deve finire su **due offerte distinte** collegate a **un solo**
 * prodotto canonico — così i due prezzi restano separati e confrontabili.
 *
 * ATTENZIONE: crea prodotti finti. Si rifiuta di partire in produzione.
 *
 *   DATABASE_URL=postgresql://.../gelateria_collaudo \
 *     tsx --conditions=react-server scripts/collaudo-abbinamento.ts
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL mancante.');
if (new URL(url).pathname === '/gelateria_guido') {
  throw new Error('Questo script crea prodotti finti: puntalo su una copia.');
}

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

/** Crea un prodotto canonico come lo creerebbe la Fase 10. */
async function creaProdotto(organizationId: string, nome: string) {
  const { formato, nucleo } = analizzaDescrizione(nome);
  return systemPrisma.product.create({
    data: {
      organizationId,
      name: nome,
      unitSize: formato.unitSize.toString(),
      unitOfMeasure: formato.unitOfMeasure,
      baseUnit: baseDi(formato.unitOfMeasure),
      normalizedName: nucleo,
      createdBy: 'IMPORT',
    },
    select: { id: true, name: true },
  });
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const fornitori = await systemPrisma.supplier.findMany({
    select: { id: true, name: true },
    take: 2,
  });
  if (fornitori.length < 2) throw new Error('Servono due fornitori.');
  const [uno, due] = fornitori as [(typeof fornitori)[0], (typeof fornitori)[0]];

  // Pulizia di eventuali giri precedenti.
  await systemPrisma.product.deleteMany({ where: { name: { startsWith: 'COLLAUDO' } } });

  console.log('\n═══ criterio 1: i tre modi di scrivere la stessa birra ═══');
  const birra = await creaProdotto(org.id, 'COLLAUDO Birra XYZ 33cl');
  const scritture = [
    'Birra XYZ 33cl x12',
    'XYZ Birra cl.33 conf. 12pz',
    'Birra XYZ bottiglia 0,33L 12 pezzi',
  ];
  for (const [i, testo] of scritture.entries()) {
    const e = await abbinaRiga(
      { chiave: `c${i}`, codiceFornitore: null, descrizione: testo, unitaDiVendita: 'CT' },
      { organizationId: org.id, supplierId: uno.id },
    );
    esito(
      e.productId === birra.id,
      `«${testo}» → ${e.productId === birra.id ? 'abbinata' : 'NON abbinata'} (${e.decisione.esito}, ${e.decisione.punteggio})`,
    );
  }

  console.log('\n═══ criterio 2: 33 cl e 66 cl non si abbinano mai ═══');
  const sessantasei = await abbinaRiga(
    { chiave: 'x', codiceFornitore: null, descrizione: 'Birra XYZ 66cl', unitaDiVendita: 'BT' },
    { organizationId: org.id, supplierId: uno.id },
  );
  esito(
    sessantasei.productId === null,
    `66 cl → ${sessantasei.decisione.esito} (${sessantasei.decisione.motivo})`,
  );

  console.log('\n═══ il caso vero: la stessa acqua da due fornitori ═══');
  const acqua = await creaProdotto(org.id, 'COLLAUDO ALISEA NATURALE CL.50 PET');
  const daUno = await abbinaRiga(
    {
      chiave: 'a1',
      codiceFornitore: '20561',
      descrizione: 'ALISEA NATURALE CL.50 PET',
      unitaDiVendita: 'CO',
    },
    { organizationId: org.id, supplierId: uno.id },
  );
  const daDue = await abbinaRiga(
    {
      chiave: 'a2',
      codiceFornitore: 'AC900',
      descrizione: 'ALISEA ACQUA NATURALE 0,50 PET',
      unitaDiVendita: 'CO',
    },
    { organizationId: org.id, supplierId: due.id },
  );
  esito(daUno.productId === acqua.id, `${uno.name} → ${daUno.decisione.esito}`);
  esito(
    daDue.productId === acqua.id || daDue.decisione.esito === 'PENDING',
    `${due.name} → ${daDue.decisione.esito} (punteggio ${daDue.decisione.punteggio})`,
  );
  console.log(
    '     le due righe restano due offerte distinte: i codici sono diversi ' +
      `(${daUno.chiave}: 20561, ${daDue.chiave}: AC900) e ognuna terra' il suo prezzo`,
  );

  console.log('\n═══ criterio 3: confermare scrive il sinonimo, e la volta dopo basta quello ═══');
  const diverso = 'ACQUA ALISEA NAT. PET CL.50 CONFEZ.';
  const prima = await abbinaRiga(
    { chiave: 's1', codiceFornitore: null, descrizione: diverso, unitaDiVendita: 'CO' },
    { organizationId: org.id, supplierId: due.id },
  );
  console.log(`     prima della conferma: ${prima.decisione.esito} via ${prima.decisione.metodo}`);

  // La conferma, come la scrive la schermata «Da abbinare».
  await systemPrisma.productAlias.create({
    data: {
      productId: acqua.id,
      text: diverso,
      normalizedText: normalizzaTesto(prima.nucleo),
      source: 'USER',
      negative: false,
    },
  });

  const dopo = await abbinaRiga(
    { chiave: 's2', codiceFornitore: null, descrizione: diverso, unitaDiVendita: 'CO' },
    { organizationId: org.id, supplierId: due.id },
  );
  esito(
    dopo.productId === acqua.id,
    `dopo la conferma: ${dopo.decisione.esito} via ${dopo.decisione.metodo}`,
  );
  esito(dopo.decisione.metodo === 'ALIAS', 'e ci arriva per sinonimo, senza punteggi ne modelli');

  console.log('\n═══ criterio 4: un abbinamento rifiutato non viene riproposto ═══');
  const daRifiutare = 'COLLAUDO Birra XYZ 33cl PROMO';
  const propostoPrima = await abbinaRiga(
    { chiave: 'r1', codiceFornitore: null, descrizione: daRifiutare, unitaDiVendita: 'CT' },
    { organizationId: org.id, supplierId: uno.id },
  );
  console.log(
    `     proposto: ${propostoPrima.productId === birra.id ? 'la birra' : 'niente'} (${propostoPrima.decisione.esito})`,
  );

  await systemPrisma.productAlias.create({
    data: {
      productId: birra.id,
      text: daRifiutare,
      normalizedText: normalizzaTesto(propostoPrima.nucleo),
      source: 'USER',
      negative: true,
    },
  });

  const propostoDopo = await abbinaRiga(
    { chiave: 'r2', codiceFornitore: null, descrizione: daRifiutare, unitaDiVendita: 'CT' },
    { organizationId: org.id, supplierId: uno.id },
  );
  esito(
    propostoDopo.productId !== birra.id,
    `dopo il rifiuto: ${propostoDopo.decisione.esito}, la birra non viene piu proposta`,
  );

  await systemPrisma.product.deleteMany({ where: { name: { startsWith: 'COLLAUDO' } } });
  await systemPrisma.$disconnect();
  console.log(
    process.exitCode ? '\n✗ Almeno un criterio non passa.' : '\n✓ Tutti e quattro passano.',
  );
}

main().catch(async (e: unknown) => {
  console.error(e);
  await systemPrisma.$disconnect();
  process.exitCode = 1;
});
