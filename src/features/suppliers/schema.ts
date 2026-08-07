import { z } from 'zod';

const MAX_QUERY_LENGTH = 100;
const MAX_DECIMAL_INPUT_LENGTH = 32;

const FIELD_LIMITS = {
  name: 160,
  code: 60,
  vatNumber: 32,
  email: 254,
  phone: 50,
  contactName: 120,
  address: 500,
  notes: 3_000,
  deliveryDays: 160,
  emailNote: 1_500,
} as const;

const supplierStatusSchema = z.enum(['all', 'active', 'inactive']);
const supplierSortSchema = z.enum(['name-asc', 'name-desc', 'updated-desc', 'updated-asc']);

/**
 * I campi opzionali arrivano dai form come stringhe vuote. Nel dominio una
 * stringa vuota non porta informazione, quindi viene sempre salvata come NULL.
 */
const trimmedStringOrNull = z.union([z.string(), z.null()]).transform((value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
});

function nullableTrimmedString(maxLength: number, label: string) {
  return trimmedStringOrNull.pipe(
    z.union([
      z.string().max(maxLength, `${label} può contenere al massimo ${maxLength} caratteri.`),
      z.null(),
    ]),
  );
}

function nullableEmail(label: string) {
  return trimmedStringOrNull.pipe(
    z.union([
      z
        .email({ error: `${label} non è valida.` })
        .max(FIELD_LIMITS.email, `${label} è troppo lunga.`),
      z.null(),
    ]),
  );
}

function canonicalDecimal(value: string): string {
  const normalized = value.trim().replace(',', '.');
  const [rawInteger = '', rawFraction = ''] = normalized.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/, '');
  const fraction = rawFraction.replace(/0+$/, '');
  return fraction === '' ? integer : `${integer}.${fraction}`;
}

function nullableDecimal(maximumCents: bigint, label: string) {
  return z.union([z.string(), z.null()]).transform((value, context): string | null => {
    if (value === null || value.trim() === '') return null;

    const normalized = value.trim().replace(',', '.');
    if (normalized.length > MAX_DECIMAL_INPUT_LENGTH || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      context.addIssue({
        code: 'custom',
        message: `${label} deve essere un numero decimale non negativo con al massimo due cifre decimali.`,
      });
      return z.NEVER;
    }

    const canonical = canonicalDecimal(normalized);
    const [integer = '0', fraction = ''] = canonical.split('.');
    const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (cents > maximumCents) {
      context.addIssue({
        code: 'custom',
        message: `${label} supera il valore massimo consentito.`,
      });
      return z.NEVER;
    }

    return canonical;
  });
}

const defaultVatRateSchema = nullableDecimal(10_000n, "L'aliquota IVA");
const minOrderValueSchema = nullableDecimal(999_999_999_999n, "L'importo minimo");

const supplierFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Il nome del fornitore è obbligatorio.')
    .max(FIELD_LIMITS.name, `Il nome può contenere al massimo ${FIELD_LIMITS.name} caratteri.`),
  code: nullableTrimmedString(FIELD_LIMITS.code, 'Il codice'),
  vatNumber: nullableTrimmedString(FIELD_LIMITS.vatNumber, 'La partita IVA'),
  email: nullableEmail("L'email commerciale"),
  phone: nullableTrimmedString(FIELD_LIMITS.phone, 'Il telefono'),
  contactName: nullableTrimmedString(FIELD_LIMITS.contactName, 'Il referente'),
  address: nullableTrimmedString(FIELD_LIMITS.address, "L'indirizzo"),
  notes: nullableTrimmedString(FIELD_LIMITS.notes, 'Le note'),
  pricesIncludeVat: z.boolean(),
  defaultVatRate: defaultVatRateSchema,
  minOrderValue: minOrderValueSchema,
  deliveryDays: nullableTrimmedString(FIELD_LIMITS.deliveryDays, 'I giorni di consegna'),
  orderEmail: nullableEmail("L'email ordini"),
  orderEmailCc: nullableEmail("L'email in copia"),
  sendOrdersByEmail: z.boolean(),
  emailNote: nullableTrimmedString(FIELD_LIMITS.emailNote, 'Le note per le email'),
  active: z.boolean(),
} as const;

function requireOrderEmail(
  supplier: { sendOrdersByEmail: boolean; orderEmail: string | null },
  context: z.RefinementCtx,
): void {
  if (supplier.sendOrdersByEmail && !supplier.orderEmail) {
    context.addIssue({
      code: 'custom',
      path: ['orderEmail'],
      message: "L'email ordini è obbligatoria quando l'invio automatico è attivo.",
    });
  }
}

/** Input completo e normalizzato usato per create e per validare un PATCH già fuso col record. */
export const supplierInputSchema = z
  .object({
    ...supplierFields,
    code: supplierFields.code.default(null),
    vatNumber: supplierFields.vatNumber.default(null),
    email: supplierFields.email.default(null),
    phone: supplierFields.phone.default(null),
    contactName: supplierFields.contactName.default(null),
    address: supplierFields.address.default(null),
    notes: supplierFields.notes.default(null),
    pricesIncludeVat: supplierFields.pricesIncludeVat.default(false),
    defaultVatRate: supplierFields.defaultVatRate.default(null),
    minOrderValue: supplierFields.minOrderValue.default(null),
    deliveryDays: supplierFields.deliveryDays.default(null),
    orderEmail: supplierFields.orderEmail.default(null),
    orderEmailCc: supplierFields.orderEmailCc.default(null),
    sendOrdersByEmail: supplierFields.sendOrdersByEmail.default(false),
    emailNote: supplierFields.emailNote.default(null),
    active: supplierFields.active.default(true),
  })
  .strict()
  .superRefine(requireOrderEmail);

/**
 * Il vincolo sendOrdersByEmail/orderEmail non viene applicato al solo delta:
 * chi gestisce il PATCH deve fonderlo col record corrente e ripassare il
 * risultato in supplierInputSchema.
 */
export const supplierPatchSchema = z
  .object(supplierFields)
  .partial()
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'Indicare almeno un campo da modificare.',
  });

export const supplierListQuerySchema = z
  .object({
    q: z.string().trim().max(MAX_QUERY_LENGTH).default(''),
    status: supplierStatusSchema.default('all'),
    sort: supplierSortSchema.default('name-asc'),
  })
  .strict();

export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type SupplierPatch = z.infer<typeof supplierPatchSchema>;
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
