import { Decimal } from 'decimal.js';
import { systemPrisma } from '../src/server/database/system-client.js';
import {
  riconcilia,
  type OffertaACatalogo,
  type RigaDelFile,
} from '../src/server/import/reconcile.js';

/**
 * Che un aggiornamento parziale non disattivi mezzo catalogo.
 *
 *   ./scripts/con-variabili.sh pnpm exec tsx --conditions=react-server \
 *     scripts/collaudo-parziale.ts
 *
 * **Legge soltanto.** Prende il perimetro vero di un fornitore in produzione
 * e gli passa un file finto con dentro tre righe sole — che è esattamente il
 * caso che si vuole gestire: il fornitore manda due pagine coi rincari.
 */

function esito(ok: boolean, testo: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const org = await systemPrisma.organization.findFirstOrThrow({ select: { id: true } });
  const listino = await systemPrisma.priceList.findFirstOrThrow({
    where: { organizationId: org.id, status: 'APPLIED' },
    select: { supplierId: true, scopeLabel: true, supplier: { select: { name: true } } },
  });

  const offerte = await systemPrisma.supplierProduct.findMany({
    where: {
      supplierId: listino.supplierId,
      lastSeenPriceList: { scopeLabel: listino.scopeLabel },
      active: true,
    },
    select: {
      id: true,
      supplierCode: true,
      fingerprint: true,
      packagingType: true,
      packQuantity: true,
      unitSize: true,
      unitOfMeasure: true,
      active: true,
      currentPrice: { select: { priceNet: true } },
    },
  });

  const aCatalogo: OffertaACatalogo[] = offerte.map((o) => ({
    supplierProductId: o.id,
    supplierCode: o.supplierCode,
    fingerprint: o.fingerprint,
    unitaDiVendita: o.packagingType,
    packQuantity: o.packQuantity,
    unitSize: new Decimal(o.unitSize.toString()),
    unitOfMeasure: o.unitOfMeasure,
    prezzoNetto: o.currentPrice ? new Decimal(o.currentPrice.priceNet.toString()) : null,
    active: true,
  }));

  console.log(
    `\n${listino.supplier.name} / ${listino.scopeLabel}: ${aCatalogo.length} offerte a catalogo\n`,
  );

  // Il parziale: tre righe vere col prezzo ritoccato, più una mai vista.
  const tre = aCatalogo.slice(0, 3);
  const nelFile: RigaDelFile[] = [
    ...tre.map((o, i) => ({
      chiave: `r-${i}`,
      supplierCode: o.supplierCode,
      fingerprint: o.fingerprint,
      unitaDiVendita: o.unitaDiVendita,
      packQuantity: o.packQuantity,
      unitSize: o.unitSize,
      unitOfMeasure: o.unitOfMeasure,
      prezzoNetto: (o.prezzoNetto ?? new Decimal('10')).plus('1.50'),
      inclusa: true,
    })),
    {
      chiave: 'r-nuovo',
      supplierCode: 'MAI-VISTO-99',
      fingerprint: 'mai-visto-99',
      unitaDiVendita: 'BT',
      packQuantity: 1,
      unitSize: new Decimal('70'),
      unitOfMeasure: 'CL',
      prezzoNetto: new Decimal('9.90'),
      inclusa: true,
    },
  ];

  const conta = (c: ReturnType<typeof riconcilia>, e: string) =>
    c.filter((x) => x.esito === e).length;

  console.log('── come LISTINO COMPLETO (quello di prima) ──');
  const completo = riconcilia(aCatalogo, nelFile);
  const spariti = conta(completo, 'SPARITO');
  console.log(
    `  aggiornati ${conta(completo, 'PREZZO_AGGIORNATO')} · nuovi ${conta(completo, 'NUOVO')} · SPARITI ${spariti}`,
  );
  esito(
    spariti === aCatalogo.length - 3,
    `disattiverebbe ${spariti} offerte su ${aCatalogo.length}`,
  );

  console.log('\n── come AGGIORNAMENTO PARZIALE ──');
  const parziale = riconcilia(aCatalogo, nelFile, { segnalaSpariti: false });
  console.log(
    `  aggiornati ${conta(parziale, 'PREZZO_AGGIORNATO')} · nuovi ${conta(parziale, 'NUOVO')} · spariti ${conta(parziale, 'SPARITO')}`,
  );
  esito(conta(parziale, 'SPARITO') === 0, 'non disattiva niente');
  esito(conta(parziale, 'PREZZO_AGGIORNATO') === 3, 'aggiorna le tre righe del file');
  esito(conta(parziale, 'NUOVO') === 1, 'e crea quella mai vista');
  esito(
    parziale.length === 4,
    `tocca solo le quattro righe che il file porta (${parziale.length})`,
  );

  await systemPrisma.$disconnect();
  console.log('');
}

main().catch(async (e: unknown) => {
  console.error(e);
  await systemPrisma.$disconnect();
  process.exit(1);
});
