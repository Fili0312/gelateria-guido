import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { productStatsChartBucketKey } from './stats';

describe('periodi del grafico acquisti prodotto', () => {
  it('usa il giorno Europe/Rome oltre la mezzanotte italiana', () => {
    const instant = '2026-08-31T22:30:00.000Z';
    assert.equal(productStatsChartBucketKey(instant, 30), '2026-09-01');
    assert.equal(productStatsChartBucketKey(instant, 365), '2026-09');
  });

  it('porta nel nuovo anno un acquisto ancora datato 31 dicembre in UTC', () => {
    const instant = '2026-12-31T23:30:00.000Z';
    assert.equal(productStatsChartBucketKey(instant, 30), '2027-01-01');
    assert.equal(productStatsChartBucketKey(instant, 90), '2027-01');
  });
});
