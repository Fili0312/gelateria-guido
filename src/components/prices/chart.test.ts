import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPriceChart } from './chart';

const price = (id: string, validFrom: string, priceNet: string, validTo: string | null = null) => ({
  id,
  validFrom,
  validTo,
  priceNet,
});

test('costruisce una serie cronologica a gradini con le date in scala', () => {
  const chart = buildPriceChart([
    price('luglio', '2026-07-01', '10.20'),
    price('maggio', '2026-05-01', '9.50', '2026-06-01'),
    price('giugno', '2026-06-01', '9.80', '2026-07-01'),
  ]);

  assert.ok(chart);
  assert.deepEqual(
    chart.points.map((point) => point.id),
    ['maggio', 'giugno', 'luglio'],
  );
  assert.equal(chart.points[0]!.x, 48);
  assert.equal(chart.points[2]!.x, 672);
  assert.ok(chart.points[1]!.x > 350 && chart.points[1]!.x < 370);
  assert.ok(chart.points[2]!.y < chart.points[1]!.y);
  assert.match(chart.stepPath, /^M 48 196 H /);
});

test('esclude dal grafico le correzioni annullate nello stesso giorno', () => {
  const chart = buildPriceChart([
    { ...price('vecchio', '2026-06-01', '9.80', '2026-06-01'), annulled: true },
    price('corretto', '2026-06-01', '9.75'),
  ]);

  assert.ok(chart);
  assert.deepEqual(
    chart.points.map((point) => point.id),
    ['corretto'],
  );
  assert.equal(chart.points[0]!.x, 360);
  assert.equal(chart.points[0]!.y, 110);
});

test('in assenza del flag, l’ultima riga dello stesso giorno è quella visibile', () => {
  const chart = buildPriceChart([
    price('prima', '2026-06-01', '9.80'),
    price('ultima', '2026-06-01', '9.90'),
  ]);

  assert.ok(chart);
  assert.equal(chart.points.length, 1);
  assert.equal(chart.points[0]!.id, 'ultima');
});

test('ignora valori e date non validi senza produrre coordinate NaN', () => {
  assert.equal(buildPriceChart([price('x', '2026-02-30', '9.00')]), null);
  assert.equal(buildPriceChart([price('x', '2026-02-01', 'non-numero')]), null);
});
