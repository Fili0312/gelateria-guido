import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mappaRigaCoda, type RigaCodaGrezza } from './queue';

const riga = (overrides: Partial<RigaCodaGrezza> = {}): RigaCodaGrezza => ({
  id: 'row-1',
  priceListId: 'list-1',
  listino: 'Generale',
  fornitore: 'Fornitore',
  pageNumber: 3,
  rawText: 'testo originale della riga',
  extracted: {
    campi: { descrizione: 'Birra 33 cl', unitSize: '33', unitOfMeasure: 'CL' },
    abbinamento: { candidati: [] },
  },
  validationErrors: null,
  matchStatus: 'PENDING',
  productId: null,
  productName: null,
  reviewedAt: null,
  bloccaImport: true,
  ...overrides,
});

describe('mapping della coda di abbinamento', () => {
  it('non fa sparire una riga senza descrizione', () => {
    const mapped = mappaRigaCoda(
      riga({
        extracted: { tipo: 'prodotto', campi: { descrizione: null } },
        validationErrors: [
          { campo: 'descrizione', gravita: 'errore', messaggio: 'La riga non ha descrizione.' },
        ],
      }),
    );

    assert.equal(mapped.id, 'row-1');
    assert.equal(mapped.descrizione, 'testo originale della riga');
    assert.deepEqual(mapped.problemi, ['La riga non ha descrizione.']);
  });

  it('resta decidibile anche quando tutto il JSON estratto è malformato', () => {
    const mapped = mappaRigaCoda(riga({ rawText: '', extracted: ['dato', 'rotto'] }));
    assert.match(mapped.descrizione, /Riga senza testo leggibile/);
    assert.match(mapped.problemi.join(' '), /descrizione strutturata/);
    assert.deepEqual(mapped.candidati, []);
  });

  it('mantiene visibile e marcata una riga bloccante già rivista', () => {
    const reviewedAt = new Date('2026-08-10T10:00:00.000Z');
    const mapped = mappaRigaCoda(
      riga({ matchStatus: 'CONFIRMED', reviewedAt, bloccaImport: true }),
    );
    assert.equal(mapped.stato, 'CONFIRMED');
    assert.equal(mapped.giaRivista, true);
    assert.equal(mapped.bloccaImport, true);
  });

  it("scarta soltanto i candidati JSON incompleti, non l'intera riga", () => {
    const mapped = mappaRigaCoda(
      riga({
        extracted: {
          campi: { descrizione: 'Birra' },
          abbinamento: {
            candidati: [
              { productId: 'p1', nome: 'Birra buona', punteggio: 0.8, trigram: 0.9, via: 'nome' },
              { productId: 'p2' },
            ],
          },
        },
      }),
    );
    assert.equal(mapped.candidati.length, 1);
    assert.equal(mapped.candidati[0]?.productId, 'p1');
  });
});
