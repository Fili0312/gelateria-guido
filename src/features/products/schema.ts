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
export const UNITA_DI_MISURA = ['PIECE', 'MG', 'G', 'HG', 'KG', 'ML', 'CL', 'DL', 'L'] as const;

const unitOfMeasureSchema = z.enum(UNITA_DI_MISURA);

const productStatusSchema = z.enum(['all', 'linked', 'orphan']);
/**
 * Separato da `status` di proposito: «senza offerte» e «senza categoria» sono
 * due code di lavoro diverse, e un prodotto può stare in entrambe. Fonderle in
 * un unico filtro renderebbe impossibile cercarne una sola.
 */
const productClassificationSchema = z.enum(['all', 'classified', 'unclassified']);
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
  z.union([
    z.string().regex(/^\d{8,14}$/, 'Il codice a barre deve avere da 8 a 14 cifre.'),
    z.null(),
  ]),
);

const productFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Il nome del prodotto è obbligatorio.')
    .max(FIELD_LIMITS.name, `Il nome può contenere al massimo ${FIELD_LIMITS.name} caratteri.`),
  brand: nullableTrimmedString(FIELD_LIMITS.brand, 'La marca'),
  /**
   * L'identificativo di una categoria della tassonomia, non il suo nome.
   * Accettare il nome vorrebbe dire creare categorie per errore di battitura
   * — «Amari», «amari», «Amari ` + '`' + `» — che è esattamente la situazione da cui
   * questa fase esce.
   */
  categoryId: nullableTrimmedString(64, 'La categoria'),
  unitSize: unitSizeSchema,
  unitOfMeasure: unitOfMeasureSchema,
  gtin: gtinSchema,
} as const;

export const productInputSchema = z
  .object({
    ...productFields,
    brand: productFields.brand.default(null),
    categoryId: productFields.categoryId.default(null),
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
    /** Filtro per reparto: comprende tutte le sue categorie. */
    departmentId: z.string().trim().max(64).default(''),
    categoryId: z.string().trim().max(64).default(''),
    classification: productClassificationSchema.default('all'),
    status: productStatusSchema.default('all'),
    /** Solo i prodotti che questo fornitore vende. */
    supplierId: z.string().trim().max(64).default(''),
    /**
     * `da-definire`: solo i prodotti la cui offerta non dichiara quanti pezzi
     * contiene la confezione. Sono quelli che restano fuori dai confronti, e
     * senza un filtro si trovano solo scorrendo trecento righe.
     */
    packaging: z.enum(['all', 'da-definire']).default('all'),
    sort: productSortSchema.default('name-asc'),
    /**
     * La paginazione. Prima non c'era e il catalogo si fermava ai primi 200
     * **senza dirlo**: con 313 prodotti ne restavano fuori 113, e uno cercato
     * per nome oltre la lettera P semplicemente non esisteva. Un limite che
     * non si vede è peggio di un limite.
     */
    pagina: z.coerce.number().int().min(1).default(1),
    perPagina: z.coerce.number().int().min(10).max(200).default(50),
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
    .max(
      FIELD_LIMITS.rawName,
      `La descrizione può contenere al massimo ${FIELD_LIMITS.rawName} caratteri.`,
    ),
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
  /** «Tutti tranne alcuni»: questa offerta è fra gli alcuni. */
  extraDiscountExcluded: z.boolean(),
  /** Una percentuale diversa da quella del fornitore, solo per questa. */
  extraDiscountPct: nullableDecimal(10_000n, 'Lo sconto extra'),
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
    extraDiscountExcluded: supplierProductFields.extraDiscountExcluded.default(false),
    extraDiscountPct: supplierProductFields.extraDiscountPct.default(null),
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
      .max(
        FIELD_LIMITS.alias,
        `Il sinonimo può contenere al massimo ${FIELD_LIMITS.alias} caratteri.`,
      ),
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
