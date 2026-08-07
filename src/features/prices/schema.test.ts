import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calendarDaySchema,
  manualPriceSchema,
  priceHistoryQuerySchema,
  setPriceSchema,
} from './schema';

describe('manualPriceSchema', () => {
  it('normalizza prezzo e IVA, con sconti vuoti di default', () => {
    const value = manualPriceSchema.parse({
      priceList: ' 009,5000 ',
      vatRate: '22,00',
      validFrom: '2026-05-01',
    });
    assert.equal(value.priceList, '9.5');
    assert.equal(value.vatRate, '22');
    assert.deepEqual(value.discounts, []);
  });

  it('accetta una cascata di sconti ma non valori fuori percentuale', () => {
    assert.deepEqual(
      manualPriceSchema.parse({
        priceList: '10',
        discounts: [6, 10],
        validFrom: '2026-05-01',
      }).discounts,
      [6, 10],
    );
    for (const discount of [0, 100, -1, Number.NaN]) {
      assert.equal(
        manualPriceSchema.safeParse({
          priceList: '10',
          discounts: [discount],
          validFrom: '2026-05-01',
        }).success,
        false,
      );
    }
  });

  it('non confonde gli errori floating point con troppe cifre decimali', () => {
    for (const discount of [1.11, 0.07, 6.125, 12.3456]) {
      assert.equal(
        manualPriceSchema.safeParse({
          priceList: '10',
          discounts: [discount],
          validFrom: '2026-05-01',
        }).success,
        true,
        `${discount} deve essere accettato`,
      );
    }
    assert.equal(
      manualPriceSchema.safeParse({
        priceList: '10',
        discounts: [1.12345],
        validFrom: '2026-05-01',
      }).success,
      false,
    );
  });

  it('non accetta netto, unitario o fonte dal client', () => {
    for (const field of ['priceNet', 'unitPrice', 'source', 'currency', 'priceListId']) {
      assert.equal(
        manualPriceSchema.safeParse({
          priceList: '10',
          validFrom: '2026-05-01',
          [field]: 'MANUAL',
        }).success,
        false,
      );
    }
  });

  it('rispetta la precisione Decimal(12,4)', () => {
    assert.equal(
      manualPriceSchema.safeParse({ priceList: '1.23456', validFrom: '2026-05-01' }).success,
      false,
    );
    assert.equal(
      manualPriceSchema.safeParse({ priceList: '100000000', validFrom: '2026-05-01' }).success,
      false,
    );
  });
});

describe('setPriceSchema — contratto interno', () => {
  it('lega obbligatoriamente una fonte PRICE_LIST al listino di origine', () => {
    assert.equal(
      setPriceSchema.safeParse({
        priceList: '10',
        validFrom: '2026-05-01',
        source: 'PRICE_LIST',
      }).success,
      false,
    );
    const parsed = setPriceSchema.parse({
      priceList: '10',
      validFrom: '2026-05-01',
      source: 'PRICE_LIST',
      priceListId: 'listino-1',
    });
    assert.equal(parsed.priceListId, 'listino-1');
  });

  it('accetta e normalizza il netto autorevole del documento', () => {
    const parsed = setPriceSchema.parse({
      priceList: '5,2500',
      discounts: [10],
      priceNet: '4,73',
      vatRate: '22,00',
      validFrom: '2026-05-01',
      source: 'PRICE_LIST',
      priceListId: 'listino-1',
    });
    assert.equal(parsed.priceList, '5.25');
    assert.equal(parsed.priceNet, '4.73');
    assert.equal(parsed.vatRate, '22');
  });

  it('una fonte non da listino mantiene nullo il riferimento di default', () => {
    assert.equal(
      setPriceSchema.parse({
        priceList: '10',
        validFrom: '2026-05-01',
        source: 'ORDER',
      }).priceListId,
      null,
    );
  });

  it('non associa listini a fonti MANUAL o ORDER', () => {
    for (const source of ['MANUAL', 'ORDER'] as const) {
      assert.equal(
        setPriceSchema.safeParse({
          priceList: '10',
          validFrom: '2026-05-01',
          source,
          priceListId: 'listino-1',
        }).success,
        false,
      );
    }
  });
});

describe('giorni di validita', () => {
  it('accetta solo date reali in forma ISO senza orario', () => {
    assert.equal(calendarDaySchema.parse('2024-02-29'), '2024-02-29');
    for (const value of ['2026-02-29', '2026-13-01', '01/05/2026', '2026-05-01T10:00:00Z']) {
      assert.equal(calendarDaySchema.safeParse(value).success, false, value);
    }
  });

  it('la data di lettura e opzionale', () => {
    assert.deepEqual(priceHistoryQuerySchema.parse({}), {});
    assert.equal(priceHistoryQuerySchema.parse({ at: '2026-06-15' }).at, '2026-06-15');
  });
});
