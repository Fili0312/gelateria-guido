import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  condizioneCasDecisione,
  motivoDecisioneNonApplicabile,
  rigaBloccaApplicazione,
} from './review';

describe('guardia concorrente delle decisioni di matching', () => {
  it('considera decidibili soltanto gli stati di coda non ancora rivisti', () => {
    for (const matchStatus of ['AUTO', 'PENDING', 'NEW'] as const) {
      assert.equal(
        motivoDecisioneNonApplicabile({ matchStatus, reviewedAt: null, excluded: false }),
        null,
      );
    }
    assert.match(
      motivoDecisioneNonApplicabile({
        matchStatus: 'CONFIRMED',
        reviewedAt: null,
        excluded: false,
      }) ?? '',
      /non è più decidibile/,
    );
  });

  it('rifiuta una seconda decisione già conclusa o esclusa', () => {
    assert.match(
      motivoDecisioneNonApplicabile({
        matchStatus: 'PENDING',
        reviewedAt: new Date(),
        excluded: false,
      }) ?? '',
      /già stata rivista/,
    );
    assert.match(
      motivoDecisioneNonApplicabile({
        matchStatus: 'PENDING',
        reviewedAt: null,
        excluded: true,
      }) ?? '',
      /già stata esclusa/,
    );
  });

  it('il CAS ricontrolla id, reviewedAt, esclusione e stato', () => {
    const reviewedAt = new Date('2026-08-10T10:00:00.000Z');
    assert.deepEqual(condizioneCasDecisione('row-1', 'PENDING', reviewedAt), {
      id: 'row-1',
      reviewedAt,
      excluded: false,
      matchStatus: 'PENDING',
    });
  });

  it('riconosce come bloccante una riga invalida anche se già rivista', () => {
    assert.equal(
      rigaBloccaApplicazione({
        id: 'row-1',
        extracted: { tipo: 'prodotto', campi: { importabile: false } },
        validationErrors: [{ gravita: 'errore', messaggio: 'Descrizione mancante' }],
        matchStatus: 'CONFIRMED',
        excluded: false,
      }),
      true,
    );
  });

  it('non considera bloccanti sezioni, avvisi o righe già escluse', () => {
    const base = {
      extracted: { tipo: 'prodotto', campi: { importabile: true } },
      validationErrors: [{ gravita: 'avviso' }],
      matchStatus: 'AUTO',
      excluded: false,
    };
    assert.equal(
      rigaBloccaApplicazione({
        ...base,
        id: 'section',
        extracted: { tipo: 'sezione' },
        validationErrors: [{ gravita: 'errore' }],
        matchStatus: 'PENDING',
      }),
      false,
    );
    assert.equal(rigaBloccaApplicazione({ ...base, id: 'warning' }), false);
    assert.equal(
      rigaBloccaApplicazione({
        ...base,
        id: 'excluded',
        extracted: { tipo: 'prodotto', campi: { importabile: false } },
        validationErrors: [{ gravita: 'errore' }],
        matchStatus: 'PENDING',
        excluded: true,
      }),
      false,
    );
  });
});
