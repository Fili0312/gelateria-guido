import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decisioneConfezioneApplicabile,
  motivoStatoNonApplicabile,
  trovaRigheBloccanti,
} from './apply-guards';

describe('stato applicabile del listino', () => {
  it('ammette soltanto REVIEW con job DONE', () => {
    assert.equal(motivoStatoNonApplicabile('REVIEW', 'DONE'), null);
    assert.match(motivoStatoNonApplicabile('UPLOADED', 'DONE')!, /soltanto.*revisione/i);
    assert.match(motivoStatoNonApplicabile('FAILED', 'FAILED')!, /soltanto.*revisione/i);
    assert.match(motivoStatoNonApplicabile('REVIEW', 'MATCHING')!, /non è conclusa/i);
    assert.match(motivoStatoNonApplicabile('REVIEW', null)!, /non è conclusa/i);
  });
});

describe('righe che bloccano l’applicazione', () => {
  it('blocca un abbinamento PENDING anche quando ha già un productId proposto a valle', () => {
    const esito = trovaRigheBloccanti([
      { id: 'ambigua', excluded: false, matchStatus: 'PENDING', importabile: true },
    ]);
    assert.deepEqual(esito.pending, ['ambigua']);
  });

  it('blocca importabile=false e le segnalazioni con gravità errore', () => {
    const esito = trovaRigheBloccanti([
      { id: 'a', excluded: false, matchStatus: 'AUTO', importabile: false },
      {
        id: 'b',
        excluded: false,
        matchStatus: 'NEW',
        validationErrors: [{ gravita: 'errore', campo: 'prezzoNetto' }],
      },
    ]);
    assert.deepEqual(esito.nonImportabili, ['a', 'b']);
  });

  it('non blocca gli avvisi né le righe escluse esplicitamente', () => {
    const esito = trovaRigheBloccanti([
      {
        id: 'avviso',
        excluded: false,
        matchStatus: 'AUTO',
        importabile: true,
        validationErrors: [{ gravita: 'avviso', campo: 'packQuantity' }],
      },
      {
        id: 'esclusa-pending',
        excluded: true,
        matchStatus: 'PENDING',
        importabile: false,
        validationErrors: [{ gravita: 'errore' }],
      },
    ]);
    assert.deepEqual(esito, { pending: [], nonImportabili: [] });
  });
});

describe('decisione sulla confezione applicabile', () => {
  const decisa = {
    proposedAction: 'PACKAGING_CHANGED',
    matchStatus: 'CONFIRMED',
    supplierProductId: 'offerta-1',
    reviewedAt: new Date(),
    reviewedById: 'utente-1',
  };

  it('richiede decisione umana completa sulla stessa offerta', () => {
    assert.equal(decisioneConfezioneApplicabile(decisa, 'offerta-1'), true);
  });

  it('rifiuta stati parziali o un riferimento diverso', () => {
    assert.equal(
      decisioneConfezioneApplicabile({ ...decisa, reviewedById: null }, 'offerta-1'),
      false,
    );
    assert.equal(decisioneConfezioneApplicabile(decisa, 'offerta-2'), false);
    assert.equal(
      decisioneConfezioneApplicabile({ ...decisa, matchStatus: 'AUTO' }, 'offerta-1'),
      false,
    );
  });
});
