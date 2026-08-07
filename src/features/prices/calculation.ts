import { Decimal } from 'decimal.js';
import type { BaseUnit } from '@/server/domain/packaging/units';
import { applicaSconti } from '@/server/domain/pricing/discounts';
import { prezzoPerUnita, type PrezzoUnitario } from '@/server/domain/pricing/unit-price';

const MAX_STORED_NET_PRICE = new Decimal('99999999.9999');
const MAX_STORED_UNIT_PRICE = new Decimal('99999999.999999');

export class PriceStorageRangeError extends Error {
  override readonly name = 'PriceStorageRangeError';
  constructor(
    message: string,
    readonly field: 'priceNet' | 'priceList',
  ) {
    super(message);
  }
}

export interface NetPriceInput {
  priceList: string;
  discounts: readonly number[];
  priceNet?: string;
}

/**
 * Il netto stampato sul documento e autorevole. In sua assenza si applica la
 * cascata di sconti con le regole di arrotondamento verificate sui listini.
 */
export function netPriceForWrite(input: NetPriceInput): Decimal {
  return input.priceNet === undefined
    ? applicaSconti(input.priceList, input.discounts)
    : new Decimal(input.priceNet);
}

export function priceValuesForWrite(
  input: NetPriceInput,
  contentPerPack: string,
  baseUnit: BaseUnit,
): { net: Decimal; unit: PrezzoUnitario } {
  const net = netPriceForWrite(input);
  if (net.lte(0)) {
    throw new PriceStorageRangeError(
      'Il prezzo netto arrotondato deve essere maggiore di zero.',
      'priceNet',
    );
  }
  if (net.gt(MAX_STORED_NET_PRICE)) {
    throw new PriceStorageRangeError(
      'Il prezzo netto supera il valore massimo memorizzabile.',
      'priceNet',
    );
  }

  const content = new Decimal(contentPerPack);
  if (content.lte(0)) {
    throw new PriceStorageRangeError(
      "Il contenuto della confezione deve essere positivo prima di calcolare l'unitario.",
      'priceList',
    );
  }
  const unit = prezzoPerUnita(net, content, baseUnit);
  if (unit.valore.lte(0)) {
    throw new PriceStorageRangeError(
      'Il prezzo per unita arrotondato deve essere maggiore di zero.',
      'priceList',
    );
  }
  if (unit.valore.gt(MAX_STORED_UNIT_PRICE)) {
    throw new PriceStorageRangeError(
      'Il prezzo per unita supera il valore massimo memorizzabile.',
      'priceList',
    );
  }
  return { net, unit };
}
