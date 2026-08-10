import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PackagingDecisionError,
  confermaNuovaConfezione,
  mantieniConfezionePrecedente,
} from './packaging-decision-domain';

describe('decisione sulla confezione cambiata', () => {
  it('MANTIENI_PRECEDENTE sostituisce solo i campi confezione', () => {
    const campi = mantieniConfezionePrecedente(
      {
        descrizione: 'Acqua 50 cl',
        prezzoNetto: '9.50',
        packQuantity: 12,
        unitSize: '50',
        unitOfMeasure: 'CL',
      },
      {
        packagingType: 'CO',
        packQuantity: 24,
        packQuantityConfirmed: true,
        unitSize: { toString: () => '50' },
        unitOfMeasure: 'CL',
        contentPerPack: { toString: () => '12' },
        baseUnit: 'L',
      },
    );
    assert.equal(campi.prezzoNetto, '9.50');
    assert.equal(campi.packQuantity, 24);
    assert.equal(campi.contentPerPack, '12');
    assert.equal(campi.baseUnit, 'L');
  });

  it('ACCETTA_NUOVA conferma i pezzi e ricalcola i derivati', () => {
    const campi = confermaNuovaConfezione({
      descrizione: 'Acqua 50 cl',
      packQuantity: 12,
      packQuantityConfirmed: false,
      unitSize: '50',
      unitOfMeasure: 'CL',
      contentPerPack: '999',
      baseUnit: 'KG',
    });
    assert.equal(campi.packQuantityConfirmed, true);
    assert.equal(campi.contentPerPack, '6');
    assert.equal(campi.baseUnit, 'L');
  });

  it('rifiuta valori ambigui prima di marcare la decisione', () => {
    assert.throws(
      () =>
        confermaNuovaConfezione({
          packQuantity: 0,
          unitSize: '50',
          unitOfMeasure: 'CL',
        }),
      PackagingDecisionError,
    );
    assert.throws(
      () =>
        confermaNuovaConfezione({
          packQuantity: 12,
          unitSize: 'non-un-numero',
          unitOfMeasure: 'CL',
        }),
      PackagingDecisionError,
    );
  });
});
