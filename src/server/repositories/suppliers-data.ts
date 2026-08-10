import type { SupplierInput } from '@/features/suppliers/schema';

/**
 * Da input validato a riga di database.
 *
 * Esportata solo per il test che verifica che **nessun campo dello schema
 * resti fuori**: elencarli a mano è chiaro da leggere, ma dimenticarne uno
 * non dà nessun errore — il campo si valida, si mostra nel form, si salva
 * senza lamentele e semplicemente non arriva mai al database. È successo con
 * lo sconto extra: la scheda diceva «salvato» e la colonna restava vuota.
 */
export function supplierData(organizationId: string, input: SupplierInput) {
  return {
    organizationId,
    name: input.name,
    code: input.code,
    vatNumber: input.vatNumber,
    email: input.email,
    phone: input.phone,
    contactName: input.contactName,
    address: input.address,
    notes: input.notes,
    pricesIncludeVat: input.pricesIncludeVat,
    defaultVatRate: input.defaultVatRate,
    minOrderValue: input.minOrderValue,
    deliveryDays: input.deliveryDays,
    extraDiscountPct: input.extraDiscountPct,
    extraDiscountNote: input.extraDiscountNote,
    orderEmail: input.orderEmail,
    orderEmailCc: input.orderEmailCc,
    sendOrdersByEmail: input.sendOrdersByEmail,
    emailNote: input.emailNote,
    active: input.active,
  };
}
