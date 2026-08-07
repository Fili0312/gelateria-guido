import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aliasInputSchema,
  productInputSchema,
  productListQuerySchema,
  productSearchQuerySchema,
  supplierProductInputSchema,
} from './schema';

function errori(risultato: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (risultato.error?.issues ?? []).map((i) => String(i.path[0]));
}

describe('productInputSchema', () => {
  it('accetta il minimo indispensabile e riempie il resto con null', () => {
    const esito = productInputSchema.parse({
      name: '  Birra XYZ  ',
      unitSize: '33',
      unitOfMeasure: 'CL',
    });
    assert.equal(esito.name, 'Birra XYZ');
    assert.equal(esito.brand, null);
    assert.equal(esito.gtin, null);
  });

  it('rifiuta un formato pari a zero', () => {
    const esito = productInputSchema.safeParse({
      name: 'X',
      unitSize: '0',
      unitOfMeasure: 'CL',
    });
    assert.equal(esito.success, false);
    assert.ok(errori(esito).includes('unitSize'));
  });

  it('accetta la virgola come separatore decimale e la normalizza', () => {
    const esito = productInputSchema.parse({ name: 'X', unitSize: '2,5', unitOfMeasure: 'KG' });
    assert.equal(esito.unitSize, '2.5', 'a database deve arrivare la forma canonica');
  });

  it('rifiuta un formato assurdo', () => {
    // 500 kg di prodotto in un pezzo: in una gelateria e' un errore di
    // battitura, non un articolo.
    const esito = productInputSchema.safeParse({
      name: 'X',
      unitSize: '500000',
      unitOfMeasure: 'KG',
    });
    assert.equal(esito.success, false);
  });

  it('accetta un codice a barre di sole cifre e rifiuta il resto', () => {
    assert.equal(
      productInputSchema.parse({
        name: 'X',
        unitSize: '1',
        unitOfMeasure: 'L',
        gtin: '8001234567890',
      }).gtin,
      '8001234567890',
    );
    const storto = productInputSchema.safeParse({
      name: 'X',
      unitSize: '1',
      unitOfMeasure: 'L',
      gtin: 'EAN-1234',
    });
    assert.equal(storto.success, false);
  });

  it('rifiuta campi non previsti', () => {
    const esito = productInputSchema.safeParse({
      name: 'X',
      unitSize: '1',
      unitOfMeasure: 'L',
      baseUnit: 'L',
    });
    assert.equal(
      esito.success,
      false,
      'i campi derivati non si accettano dal client: li calcola il repository',
    );
  });
});

describe('supplierProductInputSchema', () => {
  const minimo = {
    supplierId: 'sup1',
    rawName: 'BIRRA XYZ CL.33 X24',
    unitSize: '33',
    unitOfMeasure: 'CL',
  };

  it('parte da confezione 1 non confermata', () => {
    const esito = supplierProductInputSchema.parse(minimo);
    assert.equal(esito.packQuantity, 1);
    assert.equal(
      esito.packQuantityConfirmed,
      false,
      'il valore di ripiego non deve mai spacciarsi per un dato',
    );
  });

  it('rifiuta pezzi per confezione non interi o nulli', () => {
    for (const packQuantity of [0, -3, 2.5]) {
      assert.equal(
        supplierProductInputSchema.safeParse({ ...minimo, packQuantity }).success,
        false,
        `packQuantity ${packQuantity} non deve passare`,
      );
    }
  });

  it('non accetta i campi calcolati', () => {
    for (const campo of ['contentPerPack', 'baseUnit', 'fingerprint', 'normalizedName']) {
      assert.equal(
        supplierProductInputSchema.safeParse({ ...minimo, [campo]: 'x' }).success,
        false,
        `${campo} e derivato e non deve arrivare dal client`,
      );
    }
  });
});

describe('productSearchQuerySchema', () => {
  it('vuole un termine e ha un limite di default', () => {
    assert.equal(productSearchQuerySchema.parse({ q: 'birra' }).limite, 20);
    assert.equal(productSearchQuerySchema.safeParse({ q: '' }).success, false);
  });

  it('non lascia chiedere pagine enormi', () => {
    assert.equal(productSearchQuerySchema.safeParse({ q: 'birra', limite: '5000' }).success, false);
  });

  it('accetta il limite come stringa, perche arriva dalla query string', () => {
    assert.equal(productSearchQuerySchema.parse({ q: 'birra', limite: '5' }).limite, 5);
  });
});

describe('aliasInputSchema', () => {
  it('rifiuta un sinonimo di una lettera sola', () => {
    assert.equal(aliasInputSchema.safeParse({ text: 'a' }).success, false);
  });

  it('di default un sinonimo e positivo', () => {
    assert.equal(aliasInputSchema.parse({ text: 'birra xyz' }).negative, false);
  });
});

describe('la categoria del prodotto è un identificativo, non un testo', () => {
  const base = { name: 'Birra XYZ', unitSize: '0.33', unitOfMeasure: 'L' } as const;

  it('senza categoria il prodotto è valido: resta «da classificare»', () => {
    assert.equal(productInputSchema.parse(base).categoryId, null);
  });

  it('accetta un identificativo di categoria', () => {
    assert.equal(productInputSchema.parse({ ...base, categoryId: 'abc123' }).categoryId, 'abc123');
  });

  it('rifiuta il vecchio campo di testo libero invece di ignorarlo', () => {
    // È il punto della fase: se `category: 'Amari'` passasse in silenzio, un
    // client non aggiornato continuerebbe a inviarlo e nessuno se ne
    // accorgerebbe finché non manca la categoria in ordine.
    assert.equal(productInputSchema.safeParse({ ...base, category: 'Amari' }).success, false);
  });

  it('una stringa vuota diventa nessuna categoria', () => {
    assert.equal(productInputSchema.parse({ ...base, categoryId: '   ' }).categoryId, null);
  });
});

describe('i filtri dell’elenco prodotti', () => {
  it('senza parametri non filtra niente', () => {
    const q = productListQuerySchema.parse({});
    assert.equal(q.departmentId, '');
    assert.equal(q.categoryId, '');
    assert.equal(q.classification, 'all');
  });

  it('«da classificare» è un filtro a sé, separato da «senza offerte»', () => {
    const q = productListQuerySchema.parse({ classification: 'unclassified', status: 'orphan' });
    assert.equal(q.classification, 'unclassified');
    assert.equal(q.status, 'orphan');
  });

  it('rifiuta una classificazione inventata', () => {
    assert.equal(productListQuerySchema.safeParse({ classification: 'boh' }).success, false);
  });
});
