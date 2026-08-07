import type { PriceWindowVariationDTO } from './dto';
import { subtractCalendarDays } from './date';
import { effectiveRowAt, type TimelineRow } from './timeline';
import { variazione } from '@/server/domain/pricing/history';

export const PRICE_WINDOWS = [30, 90, 180] as const;

export interface PriceTimelineRow extends TimelineRow {
  priceNet: string;
}

/** Confronta il prezzo efficace oggi con quello efficace N giorni fa. */
export function calculateWindowVariations(
  rows: readonly PriceTimelineRow[],
  today: string,
): PriceWindowVariationDTO[] {
  const current = effectiveRowAt(rows, today);

  return PRICE_WINDOWS.map((days) => {
    const fromDate = subtractCalendarDays(today, days);
    const base = effectiveRowAt(rows, fromDate);
    const change = base && current ? variazione(base.priceNet, current.priceNet) : null;
    return {
      days,
      fromDate,
      toDate: today,
      basePrice: base?.priceNet ?? null,
      currentPrice: current?.priceNet ?? null,
      variation: change
        ? {
            absolute: change.assoluta.toString(),
            percent: change.percentuale.toFixed(2),
            direction: change.direzione,
          }
        : null,
    };
  });
}
