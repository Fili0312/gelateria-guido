import { z } from 'zod';
import { MAX_QUERY_LENGTH } from '@/features/shared/campi';

/**
 * I limiti delle quantità sono ripetuti qui e non importati da
 * `server/domain/orders/totals`: questo modulo gira anche nel browser, e
 * `server/` non deve arrivarci. Sono due numeri, e un test in `totals.test.ts`
 * li fissa dall'altra parte.
 */
export const CONFEZIONI_MIN = 1;
export const CONFEZIONI_MAX = 9_999;

const confezioni = z.coerce
  .number()
  .int('Le confezioni si contano a numeri interi.')
  .min(CONFEZIONI_MIN, 'Almeno una confezione. Per togliere la riga, rimuovila.')
  .max(CONFEZIONI_MAX, 'Quantità troppo alta: controlla di non aver premuto di più.');

export const rigaOrdineInputSchema = z
  .object({
    supplierProductId: z.string().min(1, 'Indicare l’offerta da ordinare.'),
    quantityPacks: confezioni.default(CONFEZIONI_MIN),
    note: z.string().trim().max(500).nullish(),
  })
  .strict();

export const rigaOrdinePatchSchema = z
  .object({
    quantityPacks: confezioni.optional(),
    note: z.string().trim().max(500).nullish(),
  })
  .strict()
  .refine((v) => v.quantityPacks !== undefined || v.note !== undefined, {
    message: 'Niente da modificare.',
  });

export const ricercaOrdinabileSchema = z
  .object({
    q: z.string().trim().min(1, 'Indicare un termine di ricerca.').max(MAX_QUERY_LENGTH),
    limite: z.coerce.number().int().min(1).max(50).default(20),
    /** Solo i prodotti con un confronto e con almeno un'alternativa. */
    soloConfrontabili: z.coerce.boolean().default(false),
    supplierId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    departmentId: z.string().min(1).optional(),
  })
  .strict();

export type RigaOrdineInput = z.infer<typeof rigaOrdineInputSchema>;
export type RigaOrdinePatch = z.infer<typeof rigaOrdinePatchSchema>;
export type RicercaOrdinabile = z.infer<typeof ricercaOrdinabileSchema>;
