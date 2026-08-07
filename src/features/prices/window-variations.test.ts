import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateWindowVariations, type PriceTimelineRow } from './window-variations';

const rows: PriceTimelineRow[] = [
  {
    id: 'may',
    validFrom: '2026-05-01',
    validTo: '2026-06-01',
    createdAt: '2026-05-01T00:00:00Z',
    priceNet: '9.50',
  },
  {
    id: 'jun',
    validFrom: '2026-06-01',
    validTo: '2026-07-01',
    createdAt: '2026-06-01T00:00:00Z',
    priceNet: '9.80',
  },
  {
    id: 'jul-old',
    validFrom: '2026-07-01',
    validTo: '2026-07-01',
    createdAt: '2026-07-01T08:00:00Z',
    priceNet: '11.00',
  },
  {
    id: 'jul',
    validFrom: '2026-07-01',
    validTo: null,
    createdAt: '2026-07-01T09:00:00Z',
    priceNet: '10.20',
  },
];

describe('variazioni per finestra', () => {
  it('confronta prezzo efficace odierno e prezzo efficace 30 giorni fa', () => {
    const windows = calculateWindowVariations(rows, '2026-07-01');
    assert.deepEqual(
      windows.map((window) => window.days),
      [30, 90, 180],
    );
    assert.equal(windows[0]!.fromDate, '2026-06-01');
    assert.equal(windows[0]!.toDate, '2026-07-01');
    assert.equal(windows[0]!.basePrice, '9.80');
    assert.equal(windows[0]!.currentPrice, '10.20');
    assert.equal(windows[0]!.variation?.absolute, '0.4');
    assert.equal(windows[0]!.variation?.percent, '4.08');
    assert.equal(windows[0]!.variation?.direction, 'AUMENTO');
  });

  it('lascia la variazione nulla se alla data base non esisteva un prezzo', () => {
    const windows = calculateWindowVariations(rows, '2026-07-01');
    assert.equal(windows[1]!.basePrice, null);
    assert.equal(windows[1]!.currentPrice, '10.20');
    assert.equal(windows[1]!.variation, null);
    assert.equal(windows[2]!.variation, null);
  });

  it('esclude una correzione annullata nello stesso giorno', () => {
    const current = calculateWindowVariations(rows, '2026-07-01')[0]!;
    assert.equal(current.currentPrice, '10.20');
  });

  it('non inventa una variazione quando oggi non c e un prezzo efficace', () => {
    const closed = rows.map((row) => (row.id === 'jul' ? { ...row, validTo: '2026-07-10' } : row));
    const window = calculateWindowVariations(closed, '2026-08-01')[0]!;
    assert.equal(window.currentPrice, null);
    assert.equal(window.variation, null);
  });
});
