import { z } from 'zod';
import { UNITA_DI_MISURA } from './schema';

/**
 * Fornitore e prezzo, compilati **insieme al prodotto**.
 *
 * ── Perché stanno nello stesso modulo ───────────────────────────────────
 * Un prodotto senza offerta non si può ordinare, non ha prezzo, non compare
 * nei confronti: esiste solo come riga in un elenco. Fino a ieri per
 * arrivarci servivano tre schermate — crea il prodotto, collega un'offerta,
 * registra un prezzo — e le ultime due si trovavano solo sapendo dove
 * guardare. Chi aggiunge a mano un articolo lo aggiunge perché deve
 * ordinarlo: l'informazione «da chi e a quanto» ce l'ha in mano in quel
 * momento, non due schermate dopo.
 *
 * ── Perché resta facoltativa ────────────────────────────────────────────
 * Un prodotto può nascere prima del suo fornitore — si sa cosa serve e non
 * ancora chi lo porta. Obbligare a inventare un prezzo per poter salvare
 * produrrebbe listini con dentro numeri messi per far passare il modulo, che
 * è il modo peggiore di perdere la fiducia nei propri dati.
 */
export const fornituraSchema = z
  .object({
    supplierId: z.string().trim().min(1, 'Scegli il fornitore.').max(64),
    /** Il prezzo scritto sul listino, prima degli sconti. */
    priceList: z
      .string()
      .trim()
      .min(1, 'Scrivi il prezzo.')
      .refine((v) => Number(v.replace(',', '.')) > 0, 'Il prezzo deve essere maggiore di zero.'),
    /** Il codice con cui il fornitore chiama l'articolo, se lo conosci. */
    supplierCode: z.string().trim().max(64).nullable().default(null),
    /** Quanti pezzi ci sono nel collo che ti consegna. */
    packQuantity: z.coerce.number().int().min(1).max(10_000).default(1),
    /** Il formato del singolo pezzo, se diverso da quello del prodotto. */
    unitSize: z.string().trim().default(''),
    unitOfMeasure: z.enum(UNITA_DI_MISURA).nullable().default(null),
  })
  .strict();

export type Fornitura = z.infer<typeof fornituraSchema>;

export const FORNITURA_VUOTA: Fornitura = {
  supplierId: '',
  priceList: '',
  supplierCode: null,
  packQuantity: 1,
  unitSize: '',
  unitOfMeasure: null,
};

/** Il giorno di oggi come lo vuole lo schema dei prezzi: AAAA-MM-GG. */
export function oggiCalendario(): string {
  const ora = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ora.getFullYear()}-${p(ora.getMonth() + 1)}-${p(ora.getDate())}`;
}
