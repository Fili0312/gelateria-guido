import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Decimal } from 'decimal.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import { analizzaDescrizione } from '../src/server/domain/packaging/parse.js';
import { normalizzaTesto } from '../src/server/domain/packaging/normalize.js';
import { impronta } from '../src/server/domain/packaging/fingerprint.js';
import { prezzoPerUnita } from '../src/server/domain/pricing/unit-price.js';
import { percorsoAssoluto } from '../src/server/import/storage.js';
import type { UnitOfMeasure, BaseUnit } from '../src/server/domain/packaging/units.js';

/**
 * Carica il listino Excel della gelateria dentro il catalogo.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/importa-listino-excel.ts "percorso.xls" [--scrivi]
 *
 * ── Perché uno script e non l'import normale ────────────────────────────
 * L'import dell'app legge PDF: estrae il testo, deduce le colonne, propone
 * gli abbinamenti. Qui il file è un foglio di calcolo già strutturato — una
 * riga per articolo, con fornitore, categoria, imballo e prezzo in colonne
 * distinte — e non c'è niente da dedurre. Passarlo dal percorso dei PDF
 * significherebbe buttare via la struttura per poi ricostruirla peggio.
 *
 * Quello che **non** cambia è il dominio: formato, impronta e prezzo unitario
 * si calcolano con le stesse funzioni dell'import PDF, così i prodotti caricati
 * di qui e quelli caricati di là si riconoscono a vicenda.
 */

const FOGLIO = 'Foglio1';

/**
 * Lo sconto che il foglio applica a certi fornitori, per **ricostruire il
 * prezzo di listino** quando manca — non per applicarlo.
 *
 * Il prezzo che entra a catalogo è sempre `Prezzo u.`, cioè il lordo: lo
 * sconto del fornitore è un accordo che si configura in anagrafica, dove
 * l'app lo tratta per quello che è — un rimborso che torna dopo, non un
 * prezzo più basso alla consegna.
 *
 * Su 67 righe però `Prezzo u.` è vuoto e c'è solo la colonna scontata. Lì il
 * lordo si ricava dividendo: la legenda del foglio dice la percentuale, e la
 * verifica sulle 555 righe dove ci sono entrambe conferma che il −10% è
 * esattamente lordo × 0,9, senza un'eccezione. Ricostruirlo è aritmetica,
 * non un'ipotesi.
 */
const SCONTO_DEL_FOGLIO: Record<string, number> = {
  'ad beverage': 5,
  cecconi: 10,
  assodrink: 10,
  barzetti: 10,
};

/** `c`, `conf`, `box`: contenitori. Senza un numero nel nome, i pezzi non si sanno. */
const CONTENITORI = new Set(['c', 'conf', 'box']);

interface RigaExcel {
  fornitore: string;
  categoria: string;
  articolo: string;
  imballo: string;
  prezzoLordo: number | null;
  meno5: number | null;
  meno10: number | null;
}

function leggiFoglio(percorso: string): RigaExcel[] {
  // xlrd legge il formato .xls vecchio (OLE2), che nessuna libreria Node
  // dell'ecosistema del progetto sa aprire.
  const json = execFileSync(
    'python3',
    [
      '-c',
      `
import xlrd, json, sys
s = xlrd.open_workbook(sys.argv[1]).sheet_by_name(sys.argv[2])
def v(r, c):
    x = s.cell_value(r, c)
    return None if x == '' else x

def num(r, c):
    # Alcune celle prezzo contengono annotazioni a mano — «NON LA VENDE
    # BARZETTI» — invece di un numero. Un prezzo o e' un numero o non c'e':
    # interpretare quel testo come zero creerebbe articoli regalati.
    x = s.cell_value(r, c)
    return x if isinstance(x, (int, float)) and x != '' else None
out = []
for r in range(s.nrows):
    f = str(v(r, 0) or '').strip()
    a = str(v(r, 2) or '').strip()
    if not f or not a or f.upper() == 'FORNITORE':
        continue
    out.append({
        'fornitore': f, 'categoria': str(v(r, 1) or '').strip(), 'articolo': a,
        'imballo': str(v(r, 5) or '').strip(),
        'prezzoLordo': num(r, 6), 'meno5': num(r, 8), 'meno10': num(r, 9),
    })
json.dump(out, sys.stdout, ensure_ascii=False)
`,
      percorso,
      FOGLIO,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(json) as RigaExcel[];
}

/** «AMARO» → «Amaro», «Aperitivo/bitter» → «Aperitivo/Bitter». */
function nomeCategoria(grezzo: string): string {
  return grezzo
    .toLocaleLowerCase('it')
    .split(/(\s+|\/)/)
    .map((p) => (/^[a-zà-ù]/.test(p) ? p.charAt(0).toLocaleUpperCase('it') + p.slice(1) : p))
    .join('');
}

/**
 * Uno zero non è un prezzo — ma non è nemmeno un motivo per buttare la riga.
 *
 * Il foglio elenca ogni articolo per ogni fornitore, e dove il prezzo non c'è
 * lascia le celle vuote o a zero: a volte perché quel fornitore non lo tiene
 * («NON LO VENDE BARZETTI», scritto a mano di fianco), a volte perché il
 * prezzo non è ancora stato chiesto.
 *
 * Prendere quello zero per un prezzo era il primo errore: quel fornitore
 * risultava il più conveniente di tutti con uno sconto del 100%, che è il
 * confronto più sbagliato che l'app possa mostrare e pure il più credibile a
 * colpo d'occhio — una riga verde con «vale il cambio» sembra una buona
 * notizia.
 *
 * Ma scartare la riga era il secondo errore, opposto: l'articolo **esiste**
 * nel listino di quel fornitore, e toglierlo dal catalogo vuol dire non
 * trovarlo più nemmeno cercandolo. Resta, senza prezzo: l'app lo mostra come
 * «senza prezzo» e lo tiene fuori dai confronti, che è la verità.
 */
export function prezzoDiListino(riga: RigaExcel): { lordo: Decimal; ricostruito: boolean } | null {
  const positivo = (n: number | null): number | null => (n != null && n > 0 ? n : null);

  // Il listino è il lordo, sempre e per tutti: lo sconto del fornitore è un
  // accordo da configurare in anagrafica, non una riduzione del listino.
  const lordo = positivo(riga.prezzoLordo);
  if (lordo != null) return { lordo: new Decimal(lordo), ricostruito: false };

  // Manca il lordo ma c'è la colonna scontata: si ricava dividendo. La
  // legenda del foglio dà la percentuale e la verifica sulle 555 righe dove
  // ci sono entrambe conferma che il −10% è esattamente lordo × 0,9.
  const meno5 = positivo(riga.meno5);
  const meno10 = positivo(riga.meno10);
  const sconto = SCONTO_DEL_FOGLIO[riga.fornitore.toLocaleLowerCase('it')];
  if (sconto == null) return null;
  const scontato = meno5 ?? meno10;
  if (scontato == null) return null;
  const percentuale = meno5 != null ? 5 : sconto;
  return {
    lordo: new Decimal(scontato)
      .mul(100)
      .div(100 - percentuale)
      .toDecimalPlaces(4),
    ricostruito: true,
  };
}

async function main() {
  const percorso = process.argv[2];
  const scrivi = process.argv.includes('--scrivi');
  if (!percorso) throw new Error('Indica il percorso del file .xls');

  const righe = leggiFoglio(percorso);
  const senzaPrezzo = righe.filter((r) => prezzoDiListino(r) === null).length;
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const utente = await systemPrisma.user.findFirstOrThrow({ select: { id: true } });

  // ── Cosa c'è nel file ───────────────────────────────────────────────
  const fornitori = [...new Set(righe.map((r) => r.fornitore))].sort();
  const categorie = [
    ...new Set(
      righe
        .map((r) => r.categoria)
        .filter(Boolean)
        .map(nomeCategoria),
    ),
  ].sort();

  interface Preparata {
    riga: RigaExcel;
    nucleo: string;
    unitSize: string;
    unitOfMeasure: UnitOfMeasure;
    baseUnit: BaseUnit;
    packQuantity: number;
    confermata: boolean;
    contentPerPack: Decimal;
    lordo: Decimal | null;
    ricostruito: boolean;
  }

  const preparate: Preparata[] = [];
  for (const riga of righe) {
    const { formato, nucleo } = analizzaDescrizione(riga.articolo);
    const contenitore = CONTENITORI.has(riga.imballo.toLocaleLowerCase('it'));
    // Un contenitore senza un numero nel nome è il caso classico: il
    // fornitore dà per scontato che una cassa d'acqua sia da dodici. Noi no.
    const confermata = formato.packQuantityConfirmed && !(contenitore && formato.packQuantity <= 1);
    const prezzo = prezzoDiListino(riga) ?? { lordo: null, ricostruito: false };
    const contentPerPack =
      formato.contentPerPack ?? new Decimal(formato.unitSize).mul(formato.packQuantity);
    preparate.push({
      riga,
      nucleo: nucleo || normalizzaTesto(riga.articolo),
      unitSize: formato.unitSize.toString(),
      unitOfMeasure: formato.unitOfMeasure,
      baseUnit: formato.baseUnit,
      packQuantity: formato.packQuantity,
      confermata,
      contentPerPack,
      ...prezzo,
    });
  }

  // Lo stesso articolo compare due volte per lo stesso fornitore in tre casi
  // — «VALENTINI AMARO KAISERFORST» e «VALENTINI KAISERFORST AMARO» sono la
  // stessa bottiglia scritta in due ordini di parole. Si tiene la prima: il
  // vincolo `(fornitore, impronta)` è unico, e la seconda non è
  // un'informazione in più.
  const impronteViste = new Set<string>();
  const scartate: string[] = [];
  const uniche: Preparata[] = [];
  for (const p of preparate) {
    const chiave = `${p.riga.fornitore}|${impronta({
      nucleo: p.nucleo,
      unitSize: p.unitSize,
      unitOfMeasure: p.unitOfMeasure,
      packQuantity: p.packQuantity,
    })}`;
    if (impronteViste.has(chiave)) {
      scartate.push(`${p.riga.fornitore}: ${p.riga.articolo}`);
      continue;
    }
    impronteViste.add(chiave);
    uniche.push(p);
  }

  const perProdotto = new Map<string, Preparata[]>();
  for (const p of uniche) {
    const chiave = `${p.nucleo}|${p.unitSize}|${p.unitOfMeasure}`;
    perProdotto.set(chiave, [...(perProdotto.get(chiave) ?? []), p]);
  }
  const confrontabili = [...perProdotto.values()].filter(
    (g) => new Set(g.map((p) => p.riga.fornitore)).size > 1,
  ).length;

  console.log(`\n── ${percorso.split('/').pop()} ──\n`);
  console.log(`  righe              ${righe.length}`);
  console.log(`  di cui senza prezzo ${senzaPrezzo}  (entrano lo stesso, fuori dai confronti)`);
  console.log(`  prodotti distinti  ${perProdotto.size}`);
  console.log(`  confrontabili      ${confrontabili}  (venduti da due o più fornitori)`);
  console.log(`  confezione certa   ${preparate.filter((p) => p.confermata).length}`);
  console.log(`  da definire        ${preparate.filter((p) => !p.confermata).length}`);
  console.log(`\n  fornitori (${fornitori.length}):`);
  for (const f of fornitori) {
    const quante = righe.filter((r) => r.fornitore === f).length;
    console.log(`    ${f.padEnd(30)} ${String(quante).padStart(4)} righe`);
  }
  console.log(`\n  categorie (${categorie.length}): ${categorie.join(', ')}`);
  console.log(`  senza categoria: ${righe.filter((r) => !r.categoria).length} righe`);
  const ricostruiti = preparate.filter((p) => p.ricostruito).length;
  if (ricostruiti > 0) {
    console.log(
      `  ${ricostruiti} righe non hanno «Prezzo u.»: il lordo è ricavato dalla colonna scontata`,
    );
  }
  if (scartate.length > 0) {
    console.log(`\n  ${scartate.length} righe doppie nel file, se ne tiene una:`);
    for (const s of scartate) console.log(`    ${s}`);
  }
  console.log('');

  if (!scrivi) {
    console.log('(prova a vuoto: rilancia con --scrivi per importare)\n');
    await systemPrisma.$disconnect();
    return;
  }

  // ── Scrittura ───────────────────────────────────────────────────────
  const reparto = await systemPrisma.department.create({
    data: { organizationId: org.id, name: 'Bevande', color: '#0369a1', sortOrder: 10 },
    select: { id: true },
  });
  const categoriaId = new Map<string, string>();
  for (const [i, nome] of categorie.entries()) {
    const c = await systemPrisma.category.create({
      data: {
        organizationId: org.id,
        departmentId: reparto.id,
        name: nome,
        sortOrder: (i + 1) * 10,
      },
      select: { id: true },
    });
    categoriaId.set(nome, c.id);
  }

  const fornitoreId = new Map<string, string>();
  for (const nome of fornitori) {
    const s = await systemPrisma.supplier.create({
      data: { organizationId: org.id, name: nome },
      select: { id: true },
    });
    fornitoreId.set(nome, s.id);
  }

  // Il file resta in archivio: da lì viene il catalogo, e fra sei mesi è
  // l'unica cosa che lo spiega. Un listino per fornitore, tutti sullo stesso
  // file e sulla stessa copertura.
  const contenuto = await readFile(percorso);
  const hash = createHash('sha256').update(contenuto).digest('hex');
  const relativo = join('listini-excel', `${hash}.xls`);
  const assoluto = percorsoAssoluto(relativo);
  await mkdir(dirname(assoluto), { recursive: true });
  await writeFile(assoluto, contenuto);

  const listinoId = new Map<string, string>();
  for (const nome of fornitori) {
    const l = await systemPrisma.priceList.create({
      data: {
        organizationId: org.id,
        supplierId: fornitoreId.get(nome)!,
        originalFilename: percorso.split('/').pop()!,
        storagePath: relativo,
        fileHash: `${hash}-${normalizzaTesto(nome).replace(/\s+/g, '-')}`,
        documentType: 'LISTINO',
        mode: 'FULL',
        scopeLabel: 'listino 26.05.26',
        status: 'APPLIED',
        uploadedById: utente.id,
        appliedAt: new Date(),
      },
      select: { id: true },
    });
    listinoId.set(nome, l.id);
  }

  let prodottiCreati = 0;
  let offerteCreate = 0;
  let prezziCreati = 0;
  const oggi = new Date();

  for (const [, gruppo] of perProdotto) {
    const primo = gruppo[0]!;
    const categoriaFile = gruppo.map((g) => g.riga.categoria).find(Boolean);
    const prodotto = await systemPrisma.product.create({
      data: {
        organizationId: org.id,
        name: primo.riga.articolo.slice(0, 200),
        normalizedName: primo.nucleo,
        unitSize: primo.unitSize,
        unitOfMeasure: primo.unitOfMeasure,
        baseUnit: primo.baseUnit,
        // Chi ha una categoria nel file la prende; gli altri restano sotto il
        // solo reparto, che è quello che è stato chiesto.
        categoryId: categoriaFile ? (categoriaId.get(nomeCategoria(categoriaFile)) ?? null) : null,
        createdBy: 'IMPORT',
      },
      select: { id: true },
    });
    prodottiCreati += 1;

    for (const p of gruppo) {
      const supplierId = fornitoreId.get(p.riga.fornitore)!;
      const offerta = await systemPrisma.supplierProduct.create({
        data: {
          organizationId: org.id,
          supplierId,
          productId: prodotto.id,
          rawName: p.riga.articolo.slice(0, 300),
          normalizedName: p.nucleo,
          // La categoria come la scrive il fornitore: indizio per l'IA
          // quando arriverà il momento di classificare sul serio.
          category: p.riga.categoria || null,
          packagingType: p.riga.imballo || null,
          packQuantity: p.packQuantity,
          packQuantityConfirmed: p.confermata,
          unitSize: p.unitSize,
          unitOfMeasure: p.unitOfMeasure,
          contentPerPack: p.contentPerPack.toString(),
          baseUnit: p.baseUnit,
          fingerprint: impronta({
            nucleo: p.nucleo,
            unitSize: p.unitSize,
            unitOfMeasure: p.unitOfMeasure,
            packQuantity: p.packQuantity,
          }),
          matchStatus: 'AUTO',
          lastSeenPriceListId: listinoId.get(p.riga.fornitore)!,
        },
        select: { id: true },
      });
      offerteCreate += 1;

      // Senza prezzo l'offerta esiste comunque: l'articolo è nel listino di
      // quel fornitore, e il catalogo deve poterlo trovare.
      if (p.lordo === null) continue;

      const unitario = prezzoPerUnita(p.lordo, p.contentPerPack, p.baseUnit);
      const prezzo = await systemPrisma.supplierProductPrice.create({
        data: {
          supplierProductId: offerta.id,
          priceListId: listinoId.get(p.riga.fornitore)!,
          // Lordo e netto coincidono: lo sconto del fornitore è un accordo
          // da configurare in anagrafica, non una riduzione del listino.
          priceList: p.lordo.toString(),
          discounts: [],
          priceNet: p.lordo.toString(),
          unitPrice: unitario.valore.toString(),
          unitPriceBasis: unitario.basis,
          validFrom: oggi,
          source: 'PRICE_LIST',
          createdById: utente.id,
        },
        select: { id: true },
      });
      await systemPrisma.supplierProduct.update({
        where: { id: offerta.id },
        data: { currentPriceId: prezzo.id },
      });
      prezziCreati += 1;
    }
  }

  console.log(`✓ ${fornitori.length} fornitori · ${categorie.length} categorie sotto «Bevande»`);
  console.log(
    `✓ ${prodottiCreati} prodotti · ${offerteCreate} offerte, di cui ${offerteCreate - prezziCreati} senza prezzo\n`,
  );
  await systemPrisma.$disconnect();
}

main().catch(async (e: unknown) => {
  console.error(e);
  await systemPrisma.$disconnect();
  process.exit(1);
});
