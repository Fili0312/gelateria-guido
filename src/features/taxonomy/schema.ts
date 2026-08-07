import { z } from 'zod';
import { nullableTrimmedString } from '@/features/shared/campi';

/**
 * Reparti e categorie: la tassonomia con cui si ordina.
 *
 * Due livelli fissi e non una gerarchia libera. Un albero di profondità
 * arbitraria costa a ogni query, a ogni schermata e a ogni riordino, e
 * risolve un problema che qui non c'è: il magazzino di una gelateria si
 * gira per reparto, e dentro il reparto per scaffale. Sono due livelli.
 */

const FIELD_LIMITS = {
  name: 80,
} as const;

/**
 * Il colore serve a distinguere i reparti a colpo d'occhio, quindi è un
 * esadecimale a sei cifre e basta: niente `rgb()`, niente nomi CSS, niente
 * `currentColor`. Un solo formato è un formato che si può validare, mostrare
 * in un `<input type="color">` e stampare in un PDF senza conversioni.
 */
const colorSchema = nullableTrimmedString(7, 'Il colore').pipe(
  z.union([
    z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Il colore deve essere in formato #rrggbb.'),
    z.null(),
  ]),
);

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Il nome è obbligatorio.')
  .max(FIELD_LIMITS.name, `Il nome può contenere al massimo ${FIELD_LIMITS.name} caratteri.`);

/**
 * L'ordine è deciso da chi ordina, non dall'alfabeto: si gira il magazzino
 * sempre nella stessa sequenza, e un elenco alfabetico costringerebbe a
 * saltare avanti e indietro.
 */
const sortOrderSchema = z.coerce
  .number()
  .int("L'ordine dev'essere un numero intero.")
  .min(0, "L'ordine non può essere negativo.")
  .max(10_000, "L'ordine è troppo grande.");

const departmentFields = {
  name: nameSchema,
  color: colorSchema,
  sortOrder: sortOrderSchema,
  active: z.boolean(),
} as const;

export const departmentInputSchema = z
  .object({
    ...departmentFields,
    color: departmentFields.color.default(null),
    sortOrder: departmentFields.sortOrder.default(0),
    active: departmentFields.active.default(true),
  })
  .strict();

export const departmentPatchSchema = z
  .object(departmentFields)
  .partial()
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Indicare almeno un campo da modificare.',
  });

const categoryFields = {
  departmentId: z.string().trim().min(1, 'Il reparto è obbligatorio.').max(64),
  name: nameSchema,
  sortOrder: sortOrderSchema,
  active: z.boolean(),
} as const;

export const categoryInputSchema = z
  .object({
    ...categoryFields,
    sortOrder: categoryFields.sortOrder.default(0),
    active: categoryFields.active.default(true),
  })
  .strict();

export const categoryPatchSchema = z
  .object(categoryFields)
  .partial()
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Indicare almeno un campo da modificare.',
  });

export const taxonomyQuerySchema = z
  .object({
    /** `false` (default) mostra solo ciò che è attivo: è la vista di chi ordina. */
    includiInattivi: z
      .union([z.literal('true'), z.literal('false'), z.boolean()])
      .transform((v) => v === true || v === 'true')
      .default(false),
  })
  .strict();

export type DepartmentInput = z.infer<typeof departmentInputSchema>;
export type DepartmentPatch = z.infer<typeof departmentPatchSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryPatch = z.infer<typeof categoryPatchSchema>;
export type TaxonomyQuery = z.infer<typeof taxonomyQuerySchema>;
