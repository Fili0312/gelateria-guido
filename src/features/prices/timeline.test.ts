import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { effectiveRowAt, planTimelineInsertion, sortTimeline, type TimelineRow } from './timeline';

const rows: TimelineRow[] = [
  { id: 'may', validFrom: '2026-05-01', validTo: '2026-06-01', createdAt: '2026-05-01T10:00:00Z' },
  { id: 'jun', validFrom: '2026-06-01', validTo: '2026-07-01', createdAt: '2026-06-01T10:00:00Z' },
  { id: 'jul', validFrom: '2026-07-01', validTo: null, createdAt: '2026-07-01T10:00:00Z' },
];

describe('timeline prezzi append-only', () => {
  it('legge il prezzo alla data con intervalli [da, a)', () => {
    assert.equal(effectiveRowAt(rows, '2026-06-15')?.id, 'jun');
    assert.equal(effectiveRowAt(rows, '2026-06-01')?.id, 'jun');
    assert.equal(effectiveRowAt(rows, '2026-04-30'), null);
  });

  it('un retroattivo spezza il periodo che era efficace', () => {
    assert.deepEqual(planTimelineInsertion(rows, '2026-06-15'), {
      effectiveRowId: 'jun',
      closeRowId: 'jun',
      newValidTo: '2026-07-01',
    });
  });

  it('un prezzo precedente al primo si chiude quando comincia il primo', () => {
    assert.deepEqual(planTimelineInsertion(rows, '2026-04-01'), {
      effectiveRowId: null,
      closeRowId: null,
      newValidTo: '2026-05-01',
    });
  });

  it('una correzione nello stesso giorno annulla la riga precedente', () => {
    const corrected: TimelineRow[] = [
      ...rows.slice(0, 2),
      { ...rows[2]!, validTo: '2026-07-01' },
      {
        id: 'jul-correct',
        validFrom: '2026-07-01',
        validTo: null,
        createdAt: '2026-07-02T09:00:00Z',
      },
    ];
    assert.equal(effectiveRowAt(corrected, '2026-07-01')?.id, 'jul-correct');
    assert.deepEqual(planTimelineInsertion(corrected, '2026-07-01'), {
      effectiveRowId: 'jul-correct',
      closeRowId: 'jul-correct',
      newValidTo: null,
    });
  });

  it('ordina in modo stabile le sostituzioni dello stesso giorno', () => {
    const mixed = [
      { id: 'new', validFrom: '2026-05-01', validTo: null, createdAt: '2026-05-02T00:00:00Z' },
      {
        id: 'old',
        validFrom: '2026-05-01',
        validTo: '2026-05-01',
        createdAt: '2026-05-01T00:00:00Z',
      },
    ];
    assert.deepEqual(
      sortTimeline(mixed).map((row) => row.id),
      ['old', 'new'],
    );
  });
});
