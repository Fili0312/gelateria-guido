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
    /** Mette a tacere l'avviso «lo trovi a meno» per questa riga. */
    ignoraAvviso: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.quantityPacks !== undefined || v.note !== undefined || v.ignoraAvviso !== undefined,
    { message: 'Niente da modificare.' },
  );

export const cambioFornitoreSchema = z
  .object({ supplierProductId: z.string().min(1, 'Indicare il fornitore a cui passare.') })
  .strict();

export const ricercaOrdinabileSchema = z
  .object({
    /**
     * Vuoto significa «tutto il catalogo».
     *
     * La schermata d'ordine mostra l'elenco **prima** che si scriva qualcosa:
     * chi ordina spesso sa già cosa gli serve e lo trova scorrendo, e una
     * pagina che comincia vuota costringe a inventarsi una parola da cercare.
     */
    q: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
    limite: z.coerce.number().int().min(1).max(500).default(60),
    /** Solo i prodotti con un confronto e con almeno un'alternativa. */
    soloConfrontabili: z.coerce.boolean().default(false),
    supplierId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    departmentId: z.string().min(1).optional(),
  })
  .strict();

/**
 * I filtri dello storico.
 *
 * La paginazione c'è da subito e non «quando serviranno»: un elenco che
 * cresce di un ordine al giorno diventa illeggibile fra un anno, e aggiungerla
 * dopo vuol dire rifare la schermata quando è già in uso.
 */
export const elencoOrdiniSchema = z
  .object({
    /** Cerca fra i **nomi dei prodotti dentro l'ordine**, non fra i codici. */
    q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
    stato: z.enum(['tutti', 'CONFIRMED', 'SENT', 'RECEIVED', 'CANCELLED']).default('tutti'),
    supplierId: z.string().trim().max(64).default(''),
    /** Periodo, in giorni indietro da oggi. `0` significa senza limite. */
    giorni: z.coerce.number().int().min(0).max(3_650).default(0),
    pagina: z.coerce.number().int().min(1).default(1),
    perPagina: z.coerce.number().int().min(5).max(100).default(20),
  })
  .strict();

export type ElencoOrdiniQuery = z.infer<typeof elencoOrdiniSchema>;
export type RigaOrdineInput = z.infer<typeof rigaOrdineInputSchema>;
export type RigaOrdinePatch = z.infer<typeof rigaOrdinePatchSchema>;
export type RicercaOrdinabile = z.infer<typeof ricercaOrdinabileSchema>;
export type CambioFornitoreInput = z.infer<typeof cambioFornitoreSchema>;
