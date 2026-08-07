import { z } from 'zod';
import {
  MAX_QUERY_LENGTH,
  nullableDecimal,
  nullableTrimmedString,
  requiredPositiveDecimal,
} from '@/features/shared/campi';

const FIELD_LIMITS = {
  name: 200,
  brand: 120,
  category: 120,
  gtin: 14,
  supplierCode: 60,
  rawName: 300,
  description: 1_000,
  packagingType: 80,
  alias: 200,
} as const;

/**
 * Le unità di misura ammesse coincidono con l'enum Prisma. Sono ripetute qui
 * e non importate dal client generato di proposito: questo modulo gira anche
 * nel browser, e il client Prisma non deve arrivarci.
 */
export const UNITA_DI_MISURA = [
  'PIECE',
  'MG',
  'G',
  'HG',
  'KG',
  'ML',
  'CL',
  'DL',
  'L',
] as const;

const unitOfMeasureSchema = z.enum(UNITA_DI_MISURA);

const productStatusSchema = z.enum(['all', 'linked', 'orphan']);
const productSortSchema = z.enum(['name-asc', 'name-desc', 'updated-desc', 'offers-desc']);

/** Fino a 50 kg o 50 L: sopra, in una gelateria, è quasi sempre un errore. */
const unitSizeSchema = requiredPositiveDecimal(500_000n, 'Il formato', 4);
const vatRateSchema = nullableDecimal(10_000n, "L'aliquota IVA");

/**
 * Il codice a barre è validato per forma, non per checksum: nei listini della
 * gelateria non ce n'è nemmeno uno vero (il campo `EAN:` di Cecconi ripete il
 * codice interno), quindi rifiutare un GTIN dal checksum sbagliato
 * bloccherebbe l'inserimento manuale senza proteggere da niente.
 */
const gtinSchema = nullableTrimmedString(FIELD_LIMITS.gtin, 'Il codice a barre').pipe(
  z.union([z.string().regex(/^\d{8,14}$/, 'Il codice a barre deve avere da 8 a 14 cifre.'), z.null()]),
);

const productFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Il nome del prodotto è obbligatorio.')
    .max(FIELD_LIMITS.name, `Il nome può contenere al massimo ${FIELD_LIMITS.name} caratteri.`),
  brand: nullableTrimmedString(FIELD_LIMITS.brand, 'La marca'),
  category: nullableTrimmedString(FIELD_LIMITS.category, 'La categoria'),
  unitSize: unitSizeSchema,
  unitOfMeasure: unitOfMeasureSchema,
  gtin: gtinSchema,
} as const;

export const productInputSchema = z
  .object({
    ...productFields,
    brand: productFields.brand.default(null),
    category: productFields.category.default(null),
    gtin: productFields.gtin.default(null),
  })
  .strict();

export const productPatchSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Indicare almeno un campo da modificare.',
  });

export const productListQuerySchema = z
  .object({
    q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
    category: z.string().trim().max(FIELD_LIMITS.category).default(''),
    status: productStatusSchema.default('all'),
    sort: productSortSchema.default('name-asc'),
  })
  .strict();

/**
 * Il limite di default è basso di proposito: la ricerca serve a scegliere in
 * fretta, non a scorrere un catalogo. Chi vuole vedere tutto usa l'elenco.
 */
export const productSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1, 'Indicare un termine di ricerca.').max(MAX_QUERY_LENGTH),
    limite: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────
//  Prodotti fornitore
// ─────────────────────────────────────────────────────────────────────────

const supplierProductFields = {
  supplierId: z.string().trim().min(1, 'Il fornitore è obbligatorio.').max(64),
  supplierCode: nullableTrimmedString(FIELD_LIMITS.supplierCode, 'Il codice articolo'),
  rawName: z
    .string()
    .trim()
    .min(1, 'La descrizione del fornitore è obbligatoria.')
    .max(FIELD_LIMITS.rawName, `La descrizione può contenere al massimo ${FIELD_LIMITS.rawName} caratteri.`),
  description: nullableTrimmedString(FIELD_LIMITS.description, 'La descrizione estesa'),
  brand: nullableTrimmedString(FIELD_LIMITS.brand, 'La marca'),
  category: nullableTrimmedString(FIELD_LIMITS.category, 'La categoria'),
  packagingType: nullableTrimmedString(FIELD_LIMITS.packagingType, 'Il tipo di confezione'),
  packQuantity: z.coerce
    .number()
    .int('I pezzi per confezione devono essere un numero intero.')
    .min(1, 'I pezzi per confezione devono essere almeno 1.')
    .max(10_000, 'I pezzi per confezione sono troppi.'),
  /**
   * Distingue «so che è 1» da «non lo so e ho messo 1». Senza, il prezzo per
   * unità di un collo verrebbe calcolato su un numero inventato e avrebbe
   * la stessa faccia di un dato vero.
   */
  packQuantityConfirmed: z.boolean(),
  unitSize: unitSizeSchema,
  unitOfMeasure: unitOfMeasureSchema,
  vatRate: vatRateSchema,
  gtin: gtinSchema,
  productId: nullableTrimmedString(64, 'Il prodotto collegato'),
} as const;

export const supplierProductInputSchema = z
  .object({
    ...supplierProductFields,
    supplierCode: supplierProductFields.supplierCode.default(null),
    description: supplierProductFields.description.default(null),
    brand: supplierProductFields.brand.default(null),
    category: supplierProductFields.category.default(null),
    packagingType: supplierProductFields.packagingType.default(null),
    packQuantity: supplierProductFields.packQuantity.default(1),
    packQuantityConfirmed: supplierProductFields.packQuantityConfirmed.default(false),
    vatRate: supplierProductFields.vatRate.default(null),
    gtin: supplierProductFields.gtin.default(null),
    productId: supplierProductFields.productId.default(null),
  })
  .strict();

export const supplierProductPatchSchema = z
  .object(supplierProductFields)
  .partial()
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Indicare almeno un campo da modificare.',
  });

export const supplierProductListQuerySchema = z
  .object({
    q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
    supplierId: z.string().trim().max(64).default(''),
    /** `orphan` è la coda «da abbinare»: offerte senza prodotto canonico. */
    status: z.enum(['all', 'linked', 'orphan']).default('all'),
  })
  .strict();

export const aliasInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(2, 'Il sinonimo è troppo corto.')
      .max(FIELD_LIMITS.alias, `Il sinonimo può contenere al massimo ${FIELD_LIMITS.alias} caratteri.`),
    /** Un alias negativo registra un «non sono lo stesso prodotto». */
    negative: z.boolean().default(false),
  })
  .strict();

export const linkInputSchema = z
  .object({
    supplierProductId: z.string().trim().min(1).max(64),
  })
  .strict();

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductPatch = z.infer<typeof productPatchSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductSearchQuery = z.infer<typeof productSearchQuerySchema>;
export type SupplierProductInput = z.infer<typeof supplierProductInputSchema>;
export type SupplierProductPatch = z.infer<typeof supplierProductPatchSchema>;
export type SupplierProductListQuery = z.infer<typeof supplierProductListQuerySchema>;
export type AliasInput = z.infer<typeof aliasInputSchema>;
export type UnitOfMeasureValue = (typeof UNITA_DI_MISURA)[number];
