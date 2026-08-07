import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  categoryInputSchema,
  categoryPatchSchema,
  departmentInputSchema,
  departmentPatchSchema,
  taxonomyQuerySchema,
} from './schema';

describe('departmentInputSchema', () => {
  it('accetta il minimo indispensabile e riempie il resto', () => {
    const esito = departmentInputSchema.parse({ name: '  Bar  ' });
    assert.equal(esito.name, 'Bar', 'il nome viene rifilato');
    assert.equal(esito.color, null);
    assert.equal(esito.sortOrder, 0);
    assert.equal(esito.active, true);
  });

  it('rifiuta un nome vuoto o fatto di soli spazi', () => {
    assert.equal(departmentInputSchema.safeParse({ name: '' }).success, false);
    assert.equal(departmentInputSchema.safeParse({ name: '   ' }).success, false);
  });

  it('accetta un colore esadecimale e rifiuta tutto il resto', () => {
    assert.equal(departmentInputSchema.parse({ name: 'Bar', color: '#b45309' }).color, '#b45309');
    for (const scarto of ['rgb(1,2,3)', 'red', '#fff', '#b45309ff', 'b45309']) {
      assert.equal(
        departmentInputSchema.safeParse({ name: 'Bar', color: scarto }).success,
        false,
        `"${scarto}" non è un colore ammesso`,
      );
    }
  });

  it('una stringa vuota diventa nessun colore, non un colore vuoto', () => {
    assert.equal(departmentInputSchema.parse({ name: 'Bar', color: '' }).color, null);
  });

  it('rifiuta i campi non previsti invece di ignorarli', () => {
    // `id` e `organizationId` non si accettano dal client: se il payload li
    // contiene è un errore di chi chiama, e passarlo sotto silenzio lo
    // renderebbe difficile da trovare.
    assert.equal(departmentInputSchema.safeParse({ name: 'Bar', id: 'x' }).success, false);
    assert.equal(
      departmentInputSchema.safeParse({ name: 'Bar', organizationId: 'x' }).success,
      false,
    );
  });

  it('rifiuta un ordine negativo o non intero', () => {
    assert.equal(departmentInputSchema.safeParse({ name: 'Bar', sortOrder: -1 }).success, false);
    assert.equal(departmentInputSchema.safeParse({ name: 'Bar', sortOrder: 1.5 }).success, false);
  });
});

describe('departmentPatchSchema', () => {
  it('vuole almeno una modifica', () => {
    assert.equal(departmentPatchSchema.safeParse({}).success, false);
  });

  it('una modifica sola basta', () => {
    assert.deepEqual(departmentPatchSchema.parse({ active: false }), { active: false });
  });
});

describe('categoryInputSchema', () => {
  it('il reparto è obbligatorio', () => {
    assert.equal(categoryInputSchema.safeParse({ name: 'Amari' }).success, false);
    assert.equal(categoryInputSchema.safeParse({ name: 'Amari', departmentId: '' }).success, false);
  });

  it('accetta reparto e nome', () => {
    const esito = categoryInputSchema.parse({ departmentId: 'abc', name: 'Amari e liquori' });
    assert.equal(esito.departmentId, 'abc');
    assert.equal(esito.name, 'Amari e liquori');
    assert.equal(esito.active, true);
  });

  it('spostare una categoria di reparto è una modifica valida', () => {
    assert.deepEqual(categoryPatchSchema.parse({ departmentId: 'xyz' }), { departmentId: 'xyz' });
  });
});

describe('taxonomyQuerySchema', () => {
  it('senza parametri mostra solo ciò che è attivo', () => {
    assert.equal(taxonomyQuerySchema.parse({}).includiInattivi, false);
  });

  it("legge la stringa 'true' della query, non solo il booleano", () => {
    assert.equal(taxonomyQuerySchema.parse({ includiInattivi: 'true' }).includiInattivi, true);
    assert.equal(taxonomyQuerySchema.parse({ includiInattivi: 'false' }).includiInattivi, false);
  });

  it('rifiuta un valore che non è né vero né falso, invece di leggerlo come falso', () => {
    // `Boolean('no')` è `true`: una conversione permissiva qui mostrerebbe i
    // reparti disattivati a chi non li ha chiesti.
    assert.equal(taxonomyQuerySchema.safeParse({ includiInattivi: 'no' }).success, false);
  });
});
