import { Decimal } from 'decimal.js';
import { baseDi, inUnitaBase, type UnitOfMeasure } from '@/server/domain/packaging/units';

export class PackagingDecisionError extends Error {
  override readonly name = 'PackagingDecisionError';
}

export interface CampiConfezione extends Record<string, unknown> {
  codice?: string | null;
  descrizione?: string | null;
  unitaDiVendita?: string | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  packQuantity?: number;
  packQuantityConfirmed?: boolean;
  contentPerPack?: string | null;
  baseUnit?: string | null;
}

export interface ConfezioneCatalogo {
  packagingType: string | null;
  packQuantity: number;
  packQuantityConfirmed: boolean;
  unitSize: { toString(): string };
  unitOfMeasure: string;
  contentPerPack: { toString(): string };
  baseUnit: string;
}

const UNITA = new Set<UnitOfMeasure>(['PIECE', 'MG', 'G', 'HG', 'KG', 'ML', 'CL', 'DL', 'L']);

function unitaValida(value: unknown): value is UnitOfMeasure {
  return typeof value === 'string' && UNITA.has(value as UnitOfMeasure);
}

/**
 * Rende autorevoli i dati della nuova confezione e ricalcola i derivati.
 * `contentPerPack` e `baseUnit` non vengono mai accettati dal client: devono
 * essere conseguenza di formato e pezzi, altrimenti il prezzo unitario mente.
 */
export function confermaNuovaConfezione(campi: CampiConfezione): CampiConfezione {
  const packQuantity = campi.packQuantity;
  if (!Number.isInteger(packQuantity) || packQuantity === undefined || packQuantity < 1) {
    throw new PackagingDecisionError('Il numero di pezzi della nuova confezione non è valido.');
  }
  if (!unitaValida(campi.unitOfMeasure)) {
    throw new PackagingDecisionError("L'unità di misura della nuova confezione non è valida.");
  }
  let unitSize: Decimal;
  try {
    unitSize = new Decimal(campi.unitSize ?? '');
  } catch {
    throw new PackagingDecisionError('Il formato della nuova confezione non è valido.');
  }
  if (!unitSize.isFinite() || unitSize.lte(0)) {
    throw new PackagingDecisionError('Il formato della nuova confezione deve essere positivo.');
  }
  const contentPerPack = inUnitaBase(unitSize, campi.unitOfMeasure).mul(packQuantity);
  return {
    ...campi,
    unitSize: unitSize.toString(),
    packQuantity,
    packQuantityConfirmed: true,
    contentPerPack: contentPerPack.toString(),
    baseUnit: baseDi(campi.unitOfMeasure),
  };
}

/** Mantiene prezzo e descrizione del file, ma rimette la confezione nota. */
export function mantieniConfezionePrecedente(
  campi: CampiConfezione,
  precedente: ConfezioneCatalogo,
): CampiConfezione {
  return {
    ...campi,
    unitaDiVendita: precedente.packagingType,
    packQuantity: precedente.packQuantity,
    packQuantityConfirmed: precedente.packQuantityConfirmed,
    unitSize: precedente.unitSize.toString(),
    unitOfMeasure: precedente.unitOfMeasure,
    contentPerPack: precedente.contentPerPack.toString(),
    baseUnit: precedente.baseUnit,
  };
}
