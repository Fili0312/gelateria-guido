import { z } from 'zod';
import { MAX_QUERY_LENGTH } from '@/features/shared/campi';

/**
 * Il caricamento di un listino.
 *
 * Due campi obbligatori, e non è una formalità burocratica: il **fornitore**
 * decide dove finiranno i prodotti, la **copertura** decide con quale listino
 * precedente il nuovo verrà confrontato. Senza copertura, caricare
 * «liquori-cecconi» farebbe risultare spariti tutti i vini di Cecconi — che
 * è il modo peggiore di sbagliare, perché sembra un aggiornamento riuscito.
 *
 * È anche il momento in cui evitarlo costa nulla. Dopo, districare un listino
 * attribuito al fornitore sbagliato significa ripercorrere a mano ogni riga.
 */

export const MAX_PDF_BYTE = 20 * 1024 * 1024;

const LIMITI = {
  scopeLabel: 60,
  filename: 255,
} as const;

/**
 * La copertura si normalizza subito: minuscolo, spazi compressi.
 *
 * Senza, «liquori», «Liquori» e «liquori » diventerebbero tre coperture
 * diverse, e il confronto con il listino precedente non troverebbe nulla da
 * confrontare. È lo stesso ragionamento del nome normalizzato dei prodotti.
 */
export function normalizzaCopertura(grezzo: string): string {
  return grezzo.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const scopeLabelSchema = z
  .string()
  .trim()
  .min(2, 'Il nome del listino deve avere almeno 2 caratteri.')
  .max(LIMITI.scopeLabel, `Il nome del listino può contenere al massimo ${LIMITI.scopeLabel} caratteri.`)
  .transform(normalizzaCopertura);

export const priceListUploadSchema = z
  .object({
    supplierId: z.string().trim().min(1, 'Scegli il fornitore.').max(64),
    scopeLabel: scopeLabelSchema,
    documentType: z.enum(['LISTINO', 'PREVENTIVO', 'ORDINE_VENDITA', 'CATALOGO']).default('LISTINO'),
  })
  .strict();

export const priceListListQuerySchema = z
  .object({
    q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
    supplierId: z.string().trim().max(64).default(''),
    status: z.enum(['all', 'in-corso', 'pronti', 'falliti']).default('all'),
  })
  .strict();

export const coverageQuerySchema = z
  .object({
    supplierId: z.string().trim().min(1).max(64),
  })
  .strict();

export const rowsQuerySchema = z
  .object({
    /** `tutte` comprende anche le righe che il segmentatore non ha capito:
     *  è la vista che serve per giudicare se l'estrazione ha funzionato. */
    tipo: z.enum(['prodotto', 'tutte']).default('prodotto'),
    pagina: z.coerce.number().int().min(1).max(999).optional(),
    limite: z.coerce.number().int().min(1).max(500).default(200),
    salta: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .strict();

export type PriceListUpload = z.infer<typeof priceListUploadSchema>;
export type PriceListListQuery = z.infer<typeof priceListListQuerySchema>;
export type RowsQuery = z.infer<typeof rowsQuerySchema>;
