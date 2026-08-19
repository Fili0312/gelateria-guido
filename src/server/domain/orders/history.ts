import { Decimal } from 'decimal.js';
import type { OrdineStorico } from '@/features/orders/dto';

type GruppoStorico = OrdineStorico['perFornitore'][number];
type UnitaStorica = GruppoStorico['righe'][number]['unitOfMeasure'];
type DecimalLike = { toString(): string };

export interface RigaStoricaDaRaggruppare {
  id: string;
  supplierId: string;
  nameSnapshot: string;
  supplierNameSnapshot: string;
  supplierCodeSnapshot: string | null;
  packQuantitySnapshot: number;
  unitSizeSnapshot: DecimalLike;
  uomSnapshot: string;
  quantityPacks: number;
  unitPriceNetSnapshot: DecimalLike;
  lineTotalNet: DecimalLike;
  note: string | null;
  /** `null` finché il fornitore non dichiara di non avere l'articolo. */
  unavailableAt: Date | null;
}

export type CondizioneRigheStorico =
  | { lines: { some: { supplierId: string } } }
  | {
      lines: {
        some: { nameSnapshot: { contains: string; mode: 'insensitive' } };
      };
    };

/**
 * Compone i filtri sulle righe come condizioni AND distinte. Così il filtro
 * fornitore non viene sovrascritto dalla ricerca testuale (e viceversa), e
 * un ordine può essere trovato se contiene sia quel fornitore sia il prodotto
 * cercato, anche quando appartengono a due righe diverse.
 */
export function condizioniRigheStorico(input: {
  supplierId?: string;
  q?: string;
}): CondizioneRigheStorico[] {
  const condizioni: CondizioneRigheStorico[] = [];
  if (input.supplierId) {
    condizioni.push({ lines: { some: { supplierId: input.supplierId } } });
  }
  if (input.q) {
    condizioni.push({
      lines: {
        some: { nameSnapshot: { contains: input.q, mode: 'insensitive' } },
      },
    });
  }
  return condizioni;
}

/**
 * Raggruppa lo storico per identità del fornitore, mai per etichetta.
 * Due fornitori possono avere lo stesso nome: fonderli produrrebbe un ordine
 * apparentemente destinato a uno solo, con un subtotale che non appartiene a
 * nessuno dei due.
 */
export function raggruppaRigheStoriche(
  righe: readonly RigaStoricaDaRaggruppare[],
): GruppoStorico[] {
  const gruppi = new Map<string, GruppoStorico>();
  for (const riga of righe) {
    const gruppo = gruppi.get(riga.supplierId) ?? {
      supplierId: riga.supplierId,
      supplierName: riga.supplierNameSnapshot,
      righe: [],
      netto: '0',
    };
    gruppo.righe.push({
      id: riga.id,
      name: riga.nameSnapshot,
      supplierCode: riga.supplierCodeSnapshot,
      packQuantity: riga.packQuantitySnapshot,
      unitSize: riga.unitSizeSnapshot.toString(),
      unitOfMeasure: riga.uomSnapshot as UnitaStorica,
      quantityPacks: riga.quantityPacks,
      priceNet: riga.unitPriceNetSnapshot.toString(),
      lineTotalNet: riga.lineTotalNet.toString(),
      note: riga.note,
      nonDisponibile: riga.unavailableAt !== null,
    });
    // Il totale del fornitore conta solo la merce che arriva: una riga che
    // lui stesso ha detto di non avere non si paga, e lasciarla dentro
    // darebbe un numero che non corrisponde a nessuna fattura.
    if (riga.unavailableAt === null) {
      gruppo.netto = new Decimal(gruppo.netto).plus(riga.lineTotalNet.toString()).toString();
    }
    gruppi.set(riga.supplierId, gruppo);
  }
  return [...gruppi.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName, 'it'));
}
