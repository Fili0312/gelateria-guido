import { z } from 'zod';

/**
 * Le decisioni che si possono prendere su una riga da abbinare.
 *
 * Quattro, e sono le uniche: conferma, prodotto nuovo, rifiuta questo
 * candidato, ignora la riga. Ognuna lascia una traccia diversa, ed e' il
 * motivo per cui sono quattro e non due — «non e' questo» e «non mi
 * interessa» sembrano simili ma la prima insegna qualcosa al sistema e la
 * seconda no.
 */

export const decisioneSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('conferma'), productId: z.string().trim().min(1).max(64) }).strict(),
  z.object({ tipo: z.literal('nuovo') }).strict(),
  z.object({ tipo: z.literal('rifiuta'), productId: z.string().trim().min(1).max(64) }).strict(),
  z.object({ tipo: z.literal('ignora') }).strict(),
]);

export const codaQuerySchema = z
  .object({
    priceListId: z.string().trim().max(64).default(''),
    stato: z.enum(['tutti', 'PENDING', 'AUTO', 'NEW']).default('PENDING'),
    limite: z.coerce.number().int().min(1).max(200).default(100),
    pagina: z.coerce.number().int().min(1).max(100_000).default(1),
  })
  .strict();

export type Decisione = z.infer<typeof decisioneSchema>;
export type CodaQuery = z.infer<typeof codaQuerySchema>;
