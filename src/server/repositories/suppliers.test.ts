import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { supplierInputSchema } from '@/features/suppliers/schema';
import { supplierData } from './suppliers-data';

/**
 * Nessun campo dello schema deve restare fuori dalla scrittura.
 *
 * È il difetto che non dà errore: il campo si valida, compare nel form, si
 * salva senza lamentele, e semplicemente non arriva mai al database. La
 * scheda dice «salvato» e la colonna resta vuota.
 *
 * È successo davvero con lo sconto extra del fornitore, ed è successo perché
 * l'elenco dei campi è scritto a mano in due posti. Continuerà a essere
 * scritto a mano — è più chiaro da leggere — ma da qui in poi con qualcuno
 * che controlla.
 */
describe('supplierData copre tutti i campi dello schema', () => {
  it('non ne dimentica nessuno', () => {
    const input = supplierInputSchema.parse({ name: 'Prova' });
    const scritti = new Set(Object.keys(supplierData('org-1', input)));

    const mancanti = Object.keys(input).filter((campo) => !scritti.has(campo));
    assert.deepEqual(
      mancanti,
      [],
      `Campi validati ma mai scritti nel database: ${mancanti.join(', ')}`,
    );
  });

  it('e ci mette l’organizzazione', () => {
    const input = supplierInputSchema.parse({ name: 'Prova' });
    assert.equal(supplierData('org-1', input).organizationId, 'org-1');
  });

  it('lo sconto extra arriva fino in fondo', () => {
    // Il caso concreto che ha fatto nascere questo test.
    const input = supplierInputSchema.parse({ name: 'Prova', extraDiscountPct: '10' });
    assert.equal(supplierData('org-1', input).extraDiscountPct, '10');
  });
});
