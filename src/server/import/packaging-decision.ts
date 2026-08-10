import 'server-only';

import { Decimal } from 'decimal.js';
import type { PackagingDecision } from '@/features/price-lists/schema';
import { transactionForOrganization } from '@/server/db';
import { improntaDaCampi } from '@/server/domain/packaging/fingerprint';
import { motivoStatoNonApplicabile } from './apply-guards';
import {
  PackagingDecisionError,
  confermaNuovaConfezione,
  mantieniConfezionePrecedente,
  type CampiConfezione,
} from './packaging-decision-domain';
import { riconcilia, type OffertaACatalogo, type RigaDelFile } from './reconcile';

export {
  PackagingDecisionError,
  confermaNuovaConfezione,
  mantieniConfezionePrecedente,
} from './packaging-decision-domain';

export class PackagingDecisionNotFoundError extends Error {
  override readonly name = 'PackagingDecisionNotFoundError';
}

function codiceNormalizzato(value: string | null | undefined): string | null {
  const pulito = value?.trim().toUpperCase();
  return pulito || null;
}

/**
 * Registra la decisione nello staging. Il catalogo viene toccato soltanto da
 * `applicaImport`, dentro la sua transazione e insieme al nuovo prezzo.
 */
export async function decidiConfezione(input: {
  organizationId: string;
  priceListId: string;
  rowId: string;
  userId: string;
  decisione: PackagingDecision;
}): Promise<void> {
  await transactionForOrganization(input.organizationId, async (tx) => {
    const listino = await tx.priceList.findFirst({
      where: { id: input.priceListId },
      select: {
        id: true,
        supplierId: true,
        status: true,
        job: { select: { phase: true } },
        rows: {
          where: { id: input.rowId },
          select: {
            id: true,
            extracted: true,
            excluded: true,
            matchStatus: true,
            proposedAction: true,
            supplierProductId: true,
            reviewedAt: true,
          },
        },
      },
    });
    if (!listino || listino.rows.length !== 1) {
      throw new PackagingDecisionNotFoundError('Riga del listino non trovata.');
    }
    const motivoStato = motivoStatoNonApplicabile(listino.status, listino.job?.phase ?? null);
    if (motivoStato) throw new PackagingDecisionError(motivoStato);

    const riga = listino.rows[0]!;
    if (riga.excluded || riga.matchStatus === 'PENDING' || riga.matchStatus === 'IGNORED') {
      throw new PackagingDecisionError(
        'La riga deve essere inclusa e avere un abbinamento deciso prima della confezione.',
      );
    }
    if (riga.reviewedAt || riga.proposedAction === 'PACKAGING_CHANGED') {
      throw new PackagingDecisionError('La confezione di questa riga è già stata decisa.');
    }

    const estratto =
      riga.extracted && typeof riga.extracted === 'object' && !Array.isArray(riga.extracted)
        ? (riga.extracted as Record<string, unknown>)
        : {};
    const campi =
      estratto.campi && typeof estratto.campi === 'object' && !Array.isArray(estratto.campi)
        ? (estratto.campi as CampiConfezione)
        : null;
    if (!campi?.descrizione) {
      throw new PackagingDecisionError('La riga non contiene una descrizione importabile.');
    }

    const fingerprint = improntaDaCampi({
      descrizione: campi.descrizione,
      unitaDiVendita: campi.unitaDiVendita,
      unitSize: campi.unitSize,
      unitOfMeasure: campi.unitOfMeasure,
      packQuantity: campi.packQuantity,
    });
    const offerta = await tx.supplierProduct.findFirst({
      where: {
        supplierId: listino.supplierId,
        ...(riga.supplierProductId
          ? { id: riga.supplierProductId }
          : codiceNormalizzato(campi.codice)
            ? { supplierCode: campi.codice }
            : { supplierCode: null, fingerprint }),
      },
      select: {
        id: true,
        productId: true,
        supplierCode: true,
        fingerprint: true,
        packagingType: true,
        packQuantity: true,
        packQuantityConfirmed: true,
        unitSize: true,
        unitOfMeasure: true,
        contentPerPack: true,
        baseUnit: true,
        active: true,
        currentPrice: { select: { priceNet: true } },
      },
    });
    if (!offerta) {
      throw new PackagingDecisionNotFoundError(
        'Offerta precedente non trovata: ricalcola gli abbinamenti e riprova.',
      );
    }
    if (codiceNormalizzato(campi.codice) !== codiceNormalizzato(offerta.supplierCode)) {
      throw new PackagingDecisionError(
        "Il codice della riga non coincide con l'offerta proposta: ricalcola gli abbinamenti.",
      );
    }

    const catalogo: OffertaACatalogo = {
      supplierProductId: offerta.id,
      supplierCode: offerta.supplierCode,
      fingerprint: offerta.fingerprint,
      unitaDiVendita: offerta.packagingType,
      packQuantity: offerta.packQuantity,
      unitSize: new Decimal(offerta.unitSize.toString()),
      unitOfMeasure: offerta.unitOfMeasure,
      prezzoNetto: offerta.currentPrice
        ? new Decimal(offerta.currentPrice.priceNet.toString())
        : null,
      active: offerta.active,
    };
    const file: RigaDelFile = {
      chiave: riga.id,
      supplierCode: campi.codice ?? null,
      fingerprint,
      unitaDiVendita: campi.unitaDiVendita ?? null,
      packQuantity: campi.packQuantity ?? 1,
      unitSize: new Decimal(campi.unitSize ?? '1'),
      unitOfMeasure: campi.unitOfMeasure ?? 'PIECE',
      prezzoNetto: null,
      inclusa: true,
    };
    const confronto = riconcilia([catalogo], [file]).find((item) => item.chiaveRiga === riga.id);
    if (confronto?.esito !== 'CONFEZIONE_CAMBIATA' || confronto.supplierProductId !== offerta.id) {
      throw new PackagingDecisionError(
        'La riga non presenta più una confezione cambiata: aggiorna la pagina prima di decidere.',
      );
    }
    if (input.decisione === 'ACCETTA_NUOVA' && confronto.nuovaConfezioneApplicabile === false) {
      throw new PackagingDecisionError(
        'È cambiato il formato unitario, non soltanto la confezione: per trattarlo come prodotto diverso serve la nuova policy sul codice fornitore. Correggi la riga oppure mantieni il formato precedente.',
      );
    }

    const campiDecisi =
      input.decisione === 'MANTIENI_PRECEDENTE'
        ? mantieniConfezionePrecedente(campi, offerta)
        : confermaNuovaConfezione(campi);
    if (input.decisione === 'ACCETTA_NUOVA') {
      const nuovaImpronta = improntaDaCampi({
        descrizione: campi.descrizione,
        unitaDiVendita: campiDecisi.unitaDiVendita,
        unitSize: campiDecisi.unitSize,
        unitOfMeasure: campiDecisi.unitOfMeasure,
        packQuantity: campiDecisi.packQuantity,
      });
      const gemella = await tx.supplierProduct.findFirst({
        where: {
          supplierId: listino.supplierId,
          id: { not: offerta.id },
          fingerprint: nuovaImpronta,
        },
        select: { id: true },
      });
      if (gemella) {
        throw new PackagingDecisionError(
          'La nuova confezione coincide con un’altra offerta dello stesso fornitore.',
        );
      }
    }

    await tx.priceList.update({
      where: { id: listino.id },
      data: {
        rows: {
          update: {
            where: { id: riga.id },
            data: {
              extracted: { ...estratto, campi: campiDecisi } as never,
              supplierProductId: offerta.id,
              productId: offerta.productId,
              matchStatus: 'CONFIRMED',
              proposedAction:
                input.decisione === 'ACCETTA_NUOVA' ? 'PACKAGING_CHANGED' : 'UPDATE_PRICE',
              reviewedById: input.userId,
              reviewedAt: new Date(),
            },
          },
        },
      },
    });
  });
}
