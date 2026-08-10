import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  supplierInputSchema,
  supplierListQuerySchema,
  supplierPatchSchema,
  type SupplierInput,
  type SupplierListQuery,
  type SupplierPatch,
} from './schema';

describe('supplierInputSchema', () => {
  it('produce un input completo con default e NULL espliciti', () => {
    const supplier: SupplierInput = supplierInputSchema.parse({ name: '  Barzelli  ' });

    assert.deepEqual(supplier, {
      name: 'Barzelli',
      code: null,
      vatNumber: null,
      email: null,
      phone: null,
      contactName: null,
      address: null,
      notes: null,
      pricesIncludeVat: false,
      defaultVatRate: null,
      minOrderValue: null,
      deliveryDays: null,
      extraDiscountPct: null,
      extraDiscountNote: null,
      orderEmail: null,
      orderEmailCc: null,
      sendOrdersByEmail: false,
      emailNote: null,
      active: true,
    });
  });

  it('rifila tutte le stringhe e converte quelle vuote in NULL', () => {
    const supplier = supplierInputSchema.parse({
      name: '  Cecconi ',
      code: ' CEC ',
      vatNumber: '   ',
      email: ' commerciale@example.com ',
      phone: ' 055 123 ',
      contactName: ' Mario Rossi ',
      address: ' Via Roma 1 ',
      notes: '\n Nota interna \n',
      deliveryDays: ' lunedì e giovedì ',
      orderEmail: ' ordini@example.com ',
      orderEmailCc: ' copia@example.com ',
      pricesIncludeVat: true,
      sendOrdersByEmail: true,
      emailNote: ' Codice cliente 42 ',
      active: false,
    });

    assert.equal(supplier.name, 'Cecconi');
    assert.equal(supplier.code, 'CEC');
    assert.equal(supplier.vatNumber, null);
    assert.equal(supplier.email, 'commerciale@example.com');
    assert.equal(supplier.phone, '055 123');
    assert.equal(supplier.contactName, 'Mario Rossi');
    assert.equal(supplier.address, 'Via Roma 1');
    assert.equal(supplier.notes, 'Nota interna');
    assert.equal(supplier.deliveryDays, 'lunedì e giovedì');
    assert.equal(supplier.orderEmail, 'ordini@example.com');
    assert.equal(supplier.orderEmailCc, 'copia@example.com');
    assert.equal(supplier.pricesIncludeVat, true);
    assert.equal(supplier.sendOrdersByEmail, true);
    assert.equal(supplier.emailNote, 'Codice cliente 42');
    assert.equal(supplier.active, false);
  });

  it('normalizza i Decimal senza convertirli in number', () => {
    const supplier = supplierInputSchema.parse({
      name: 'Fornitore',
      defaultVatRate: ' 022,00 ',
      minOrderValue: '000012.30',
    });

    assert.equal(supplier.defaultVatRate, '22');
    assert.equal(supplier.minOrderValue, '12.3');
    assert.equal(typeof supplier.defaultVatRate, 'string');
    assert.equal(typeof supplier.minOrderValue, 'string');

    assert.equal(
      supplierInputSchema.parse({ name: 'F', defaultVatRate: '0.00' }).defaultVatRate,
      '0',
    );
    assert.equal(
      supplierInputSchema.parse({ name: 'F', defaultVatRate: '100.00' }).defaultVatRate,
      '100',
    );
    assert.equal(
      supplierInputSchema.parse({ name: 'F', minOrderValue: '9999999999.99' }).minOrderValue,
      '9999999999.99',
    );
  });

  it('rifiuta number, sintassi non canonizzabile e valori fuori dominio per i Decimal', () => {
    for (const value of [22, -1, 100.01]) {
      assert.equal(
        supplierInputSchema.safeParse({ name: 'F', defaultVatRate: value }).success,
        false,
      );
    }

    for (const value of ['-1', '1.234', '1e2', '.5', '1.', 'NaN', 'Infinity', '1,2,3']) {
      assert.equal(
        supplierInputSchema.safeParse({ name: 'F', minOrderValue: value }).success,
        false,
        `minOrderValue=${value}`,
      );
    }

    assert.equal(
      supplierInputSchema.safeParse({ name: 'F', defaultVatRate: '100.01' }).success,
      false,
    );
    assert.equal(
      supplierInputSchema.safeParse({ name: 'F', minOrderValue: '10000000000' }).success,
      false,
    );
  });

  it('rifiuta nome assente o vuoto', () => {
    assert.equal(supplierInputSchema.safeParse({}).success, false);
    assert.equal(supplierInputSchema.safeParse({ name: '   ' }).success, false);
    assert.equal(supplierInputSchema.safeParse({ name: null }).success, false);
  });

  it('valida tutte le email e accetta NULL', () => {
    for (const field of ['email', 'orderEmail', 'orderEmailCc'] as const) {
      assert.equal(
        supplierInputSchema.safeParse({ name: 'F', [field]: 'non-una-email' }).success,
        false,
        field,
      );
      assert.equal(supplierInputSchema.safeParse({ name: 'F', [field]: null }).success, true);
      assert.equal(supplierInputSchema.safeParse({ name: 'F', [field]: '   ' }).success, true);
    }

    assert.equal(
      supplierInputSchema.safeParse({
        name: 'F',
        orderEmailCc: 'uno@example.com, due@example.com',
      }).success,
      false,
    );
  });

  it("richiede l'email ordini quando l'invio automatico è attivo", () => {
    const missingEmail = supplierInputSchema.safeParse({
      name: 'Fornitore',
      sendOrdersByEmail: true,
    });
    assert.equal(missingEmail.success, false);
    if (!missingEmail.success) {
      assert.deepEqual(missingEmail.error.issues[0]?.path, ['orderEmail']);
    }

    assert.equal(
      supplierInputSchema.safeParse({
        name: 'Fornitore',
        sendOrdersByEmail: true,
        orderEmail: 'ordini@example.com',
      }).success,
      true,
    );
  });

  it('accetta soltanto booleani reali', () => {
    for (const field of ['pricesIncludeVat', 'sendOrdersByEmail', 'active'] as const) {
      for (const value of ['true', 'false', 0, 1]) {
        assert.equal(
          supplierInputSchema.safeParse({ name: 'F', [field]: value }).success,
          false,
          `${field}=${String(value)}`,
        );
      }
    }
  });

  it('rifiuta campi non previsti', () => {
    assert.equal(
      supplierInputSchema.safeParse({ name: 'F', organizationId: 'org-esterna' }).success,
      false,
    );
    assert.equal(supplierInputSchema.safeParse({ name: 'F', id: 'supplier-1' }).success, false);
  });

  it('applica limiti di lunghezza coerenti con il form e il database', () => {
    const tooLongValues = {
      name: 'x'.repeat(161),
      code: 'x'.repeat(61),
      vatNumber: 'x'.repeat(33),
      phone: 'x'.repeat(51),
      contactName: 'x'.repeat(121),
      address: 'x'.repeat(501),
      notes: 'x'.repeat(3_001),
      deliveryDays: 'x'.repeat(161),
      emailNote: 'x'.repeat(1_501),
    } as const;

    for (const [field, value] of Object.entries(tooLongValues)) {
      assert.equal(
        supplierInputSchema.safeParse({ name: 'F', [field]: value }).success,
        false,
        field,
      );
    }

    assert.equal(
      supplierInputSchema.safeParse({ name: 'F', email: `${'a'.repeat(250)}@example.com` }).success,
      false,
    );
  });
});

describe('supplierPatchSchema', () => {
  it('richiede almeno una modifica significativa', () => {
    assert.equal(supplierPatchSchema.safeParse({}).success, false);
    assert.equal(supplierPatchSchema.safeParse({ notes: undefined }).success, false);
  });

  it('normalizza soltanto i campi presenti e non applica default', () => {
    const patch: SupplierPatch = supplierPatchSchema.parse({
      notes: '   ',
      minOrderValue: ' 010,50 ',
      active: false,
    });

    assert.deepEqual(patch, {
      notes: null,
      minOrderValue: '10.5',
      active: false,
    });
  });

  it('non applica al delta il vincolo che dipende dal record completo', () => {
    const enableEmail = supplierPatchSchema.parse({ sendOrdersByEmail: true });
    const clearEmail = supplierPatchSchema.parse({ orderEmail: null });

    assert.deepEqual(enableEmail, { sendOrdersByEmail: true });
    assert.deepEqual(clearEmail, { orderEmail: null });

    const current = supplierInputSchema.parse({ name: 'Fornitore' });
    assert.equal(supplierInputSchema.safeParse({ ...current, ...enableEmail }).success, false);
  });

  it('continua a validare tipo, email, Decimal, nome e campi sconosciuti', () => {
    assert.equal(supplierPatchSchema.safeParse({ active: 'false' }).success, false);
    assert.equal(supplierPatchSchema.safeParse({ email: 'errata' }).success, false);
    assert.equal(supplierPatchSchema.safeParse({ minOrderValue: 10 }).success, false);
    assert.equal(supplierPatchSchema.safeParse({ name: '  ' }).success, false);
    assert.equal(supplierPatchSchema.safeParse({ organizationId: 'org-esterna' }).success, false);
  });
});

describe('supplierListQuerySchema', () => {
  it('applica default stabili', () => {
    const query: SupplierListQuery = supplierListQuerySchema.parse({});
    assert.deepEqual(query, { q: '', status: 'all', sort: 'name-asc' });
  });

  it('rifila la ricerca e accetta soltanto stato e ordinamento in whitelist', () => {
    assert.deepEqual(
      supplierListQuerySchema.parse({ q: '  cecconi  ', status: 'inactive', sort: 'updated-desc' }),
      { q: 'cecconi', status: 'inactive', sort: 'updated-desc' },
    );

    for (const status of ['all', 'active', 'inactive']) {
      assert.equal(supplierListQuerySchema.safeParse({ status }).success, true, status);
    }
    for (const sort of ['name-asc', 'name-desc', 'updated-desc', 'updated-asc']) {
      assert.equal(supplierListQuerySchema.safeParse({ sort }).success, true, sort);
    }
  });

  it('rifiuta valori fuori whitelist, query troppo lunghe e chiavi sconosciute', () => {
    assert.equal(supplierListQuerySchema.safeParse({ status: 'enabled' }).success, false);
    assert.equal(supplierListQuerySchema.safeParse({ sort: 'name;drop-table' }).success, false);
    assert.equal(supplierListQuerySchema.safeParse({ q: 'x'.repeat(101) }).success, false);
    assert.equal(supplierListQuerySchema.safeParse({ page: '1' }).success, false);
  });
});
