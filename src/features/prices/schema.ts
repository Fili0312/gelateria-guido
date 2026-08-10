import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  nullableDecimal,
  nullableTrimmedString,
  requiredPositiveDecimal,
} from '@/features/shared/campi';

/**
 * Un prezzo puo avere piu sconti in cascata. Il limite non deriva dal
 * database: evita soltanto payload accidentali enormi; i listini reali ne
 * usano al massimo cinque.
 */
const discountSchema = z
  .number({ error: 'Ogni sconto deve essere un numero.' })
  .finite('Ogni sconto deve essere un numero finito.')
  .gt(0, 'Ogni sconto deve essere maggiore di zero.')
  .lt(100, 'Ogni sconto deve essere minore di 100.')
  .refine((value) => new Decimal(value).decimalPlaces() <= 4, {
    message: 'Ogni sconto puo avere al massimo quattro cifre decimali.',
  });

/** Prezzo massimo 99.999.999,9999 euro: coerente col Decimal(12,4) del DB. */
const priceListSchema = requiredPositiveDecimal(999_999_999_999n, 'Il prezzo di listino', 4);
const priceNetSchema = requiredPositiveDecimal(999_999_999_999n, 'Il prezzo netto', 4);
const vatRateSchema = nullableDecimal(10_000n, "L'aliquota IVA");
const priceListIdSchema = nullableTrimmedString(64, 'Il listino');
export const priceSourceSchema = z.enum(['PRICE_LIST', 'MANUAL', 'ORDER']);

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day
  );
}

export const calendarDaySchema = z
  .string()
  .trim()
  .refine(isCalendarDay, 'La data deve essere un giorno valido nel formato AAAA-MM-GG.');

/**
 * Input della correzione manuale. Netto e prezzo unitario non sono ammessi:
 * sono valori derivati e vengono sempre ricalcolati dal server.
 */
export const manualPriceSchema = z
  .object({
    priceList: priceListSchema,
    discounts: z.array(discountSchema).max(10, 'Sono ammessi al massimo dieci sconti.').default([]),
    vatRate: vatRateSchema.default(null),
    validFrom: calendarDaySchema,
  })
  .strict();

/**
 * Contratto interno per importazioni, ordini e correzioni server-side.
 *
 * Diversamente dal form manuale accetta l'importo post-sconti dichiarato dal
 * documento: è autorevole rispetto agli sconti letti, ma il confine di
 * scrittura può ancora scorporarne l'IVA secondo il regime del fornitore.
 */
export const setPriceSchema = z
  .object({
    priceList: priceListSchema,
    discounts: z.array(discountSchema).max(10, 'Sono ammessi al massimo dieci sconti.').default([]),
    priceNet: priceNetSchema.optional(),
    vatRate: vatRateSchema.default(null),
    validFrom: calendarDaySchema,
    source: priceSourceSchema,
    priceListId: priceListIdSchema.default(null),
  })
  .strict()
  .superRefine((price, context) => {
    if (price.source === 'PRICE_LIST' && !price.priceListId) {
      context.addIssue({
        code: 'custom',
        path: ['priceListId'],
        message: 'Un prezzo da listino deve indicare il listino di origine.',
      });
    }
    if (price.source !== 'PRICE_LIST' && price.priceListId) {
      context.addIssue({
        code: 'custom',
        path: ['priceListId'],
        message: 'Solo un prezzo con fonte listino puo riferirsi a un listino.',
      });
    }
  });

export const priceHistoryQuerySchema = z
  .object({
    at: calendarDaySchema.optional(),
  })
  .strict();

export type ManualPriceInput = z.infer<typeof manualPriceSchema>;
/** Input grezzo: i campi con default possono essere omessi dal chiamante. */
export type SetPriceInput = z.input<typeof setPriceSchema>;
export type ValidatedSetPriceInput = z.output<typeof setPriceSchema>;
export type PriceHistoryQuery = z.infer<typeof priceHistoryQuerySchema>;
