import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  confrontaProdotto,
  meritaAvviso,
  type OffertaDaConfrontare,
  type OpzioniConfronto,
} from './comparison';

/**
 * Il confronto fra fornitori.
 *
 * Il momento di riferimento è fisso: un test che dipende da «oggi» cambia
 * risultato col passare dei mesi, e quando fallisce non si sa se è colpa del
 * codice o del calendario.
 */
const ADESSO = new Date('2026-08-08T12:00:00Z');
const OPZIONI: OpzioniConfronto = { adesso: ADESSO, mesiPrimaDiConsiderarloFermo: 12 };

function offerta(dati: Partial<OffertaDaConfrontare> = {}): OffertaDaConfrontare {
  return {
    id: 'o-1',
    attiva: true,
    prezzoNetto: '9.00',
    contenutoPerConfezione: '6',
    base: 'L',
    confezioneCerta: true,
    valeDa: new Date('2026-07-01T00:00:00Z'),
    ...dati,
  };
}

describe('tre offerte a confezioni diverse: il caso 12/24', () => {
  /**
   * Il criterio della roadmap, alla lettera. La stessa acqua da mezzo litro
   * venduta in tre colli diversi:
   *
   *   collo da 12 →  6 L a  9,00 €  →  1,5000 €/L
   *   collo da 24 → 12 L a 16,00 €  →  1,3333 €/L
   *   collo da  6 →  3 L a  4,20 €  →  1,4000 €/L
   *
   * Ordinando per prezzo netto vince il collo da 6, che è il **peggiore**;
   * il migliore è il collo da 24, che è il netto più alto di tutti.
   */
  const offerte = [
    offerta({ id: 'collo-12', prezzoNetto: '9.00', contenutoPerConfezione: '6' }),
    offerta({ id: 'collo-24', prezzoNetto: '16.00', contenutoPerConfezione: '12' }),
    offerta({ id: 'collo-6', prezzoNetto: '4.20', contenutoPerConfezione: '3' }),
  ];
  const c = confrontaProdotto(offerte, OPZIONI);

  it('vince il collo da 24, che ha il netto più alto', () => {
    assert.equal(c.migliore?.id, 'collo-24');
    assert.equal(c.migliore?.prezzoUnitario.toFixed(4), '1.3333');
  });

  it('il netto più basso è in fondo alla classifica, non in cima', () => {
    // Se questo test si rompe, il progetto ha smesso di fare la sua unica cosa.
    const perNetto = [...offerte].sort((a, b) => Number(a.prezzoNetto) - Number(b.prezzoNetto));
    assert.equal(perNetto[0]!.id, 'collo-6');
    assert.notEqual(c.migliore?.id, 'collo-6');
  });

  it('la classifica è completa e ordinata per prezzo unitario', () => {
    assert.deepEqual(
      c.classifica.map((r) => r.id),
      ['collo-24', 'collo-6', 'collo-12'],
    );
  });

  it('la più cara è quella col prezzo unitario più alto', () => {
    assert.equal(c.piuCara?.id, 'collo-12');
  });

  it('il risparmio è su una confezione della migliore, e torna a mano', () => {
    // (1,5000 − 1,3333) × 12 L = 2,00 €
    assert.equal(c.risparmioPerConfezione?.toString(), '2');
    assert.equal(c.risparmioPct?.toString(), '11.11');
  });

  it('lo stato dice che il confronto è avvenuto', () => {
    assert.equal(c.stato, 'CONFRONTATO');
    assert.equal(c.motivo, null);
  });
});

describe('un solo fornitore non è un vuoto', () => {
  const c = confrontaProdotto([offerta()], OPZIONI);

  it('lo stato lo dichiara', () => {
    assert.equal(c.stato, 'OFFERTA_UNICA');
  });

  it('il prezzo unitario c’è comunque', () => {
    assert.equal(c.migliore?.prezzoUnitario.toFixed(2), '1.50');
  });

  it('ma non c’è risparmio, perché non c’è alternativa', () => {
    assert.equal(c.risparmioPerConfezione, null);
    assert.equal(c.piuCara, null);
  });

  it('e il motivo è scritto per essere mostrato', () => {
    assert.match(c.motivo!, /niente da confrontare/);
  });
});

describe('quello che si rifiuta di confrontare', () => {
  it('chili contro litri: servirebbe una densità che non abbiamo', () => {
    const c = confrontaProdotto(
      [
        offerta({ id: 'litri-1', base: 'L' }),
        offerta({ id: 'litri-2', base: 'L', prezzoNetto: '8.00' }),
        offerta({ id: 'chili', base: 'KG' }),
      ],
      OPZIONI,
    );
    assert.equal(c.stato, 'CONFRONTATO');
    // I due in litri si confrontano fra loro; quello a chili si dichiara.
    assert.deepEqual(
      c.classifica.map((r) => r.id),
      ['litri-2', 'litri-1'],
    );
    assert.deepEqual(c.escluse, [{ id: 'chili', motivo: 'unità non confrontabile' }]);
  });

  it('la confezione non dichiarata esclude, col motivo', () => {
    // Il prezzo al litro di un collo di cui non si sa quante bottiglie
    // contenga non è un dato: è un'ipotesi.
    const c = confrontaProdotto(
      [offerta({ id: 'certa' }), offerta({ id: 'ignota', confezioneCerta: false })],
      OPZIONI,
    );
    assert.equal(c.stato, 'OFFERTA_UNICA');
    assert.deepEqual(c.escluse, [{ id: 'ignota', motivo: 'confezione non dichiarata' }]);
  });

  it('un fornitore che non lo tiene più a listino non partecipa', () => {
    const c = confrontaProdotto([offerta({ id: 'vecchia', attiva: false })], OPZIONI);
    assert.equal(c.stato, 'SENZA_PREZZO');
    assert.match(c.motivo!, /Nessun fornitore lo tiene più a listino/);
  });

  it('nessun fornitore collegato: si dice così, non «—»', () => {
    assert.match(confrontaProdotto([], OPZIONI).motivo!, /Nessun fornitore collegato/);
  });
});

describe('i prezzi fermi si dichiarano, non si nascondono', () => {
  it('più vecchio della soglia: fermo', () => {
    // Escluderlo farebbe sparire un fornitore senza dirlo. Chi guarda decide.
    const c = confrontaProdotto(
      [offerta({ valeDa: new Date('2024-01-01T00:00:00Z') })],
      OPZIONI,
    );
    assert.equal(c.migliore?.fermo, true);
    assert.equal(c.qualcunoFermo, true);
  });

  it('dentro la soglia: non fermo', () => {
    assert.equal(confrontaProdotto([offerta()], OPZIONI).migliore?.fermo, false);
  });

  it('il confine si misura in mesi, non in giorni approssimati', () => {
    // Con soglia 12 mesi e «adesso» all'8 agosto 2026, il limite è l'8 agosto
    // 2025: il 7 è fermo, il 9 no.
    const prima = confrontaProdotto([offerta({ valeDa: new Date('2025-08-07') })], OPZIONI);
    const dopo = confrontaProdotto([offerta({ valeDa: new Date('2025-08-09') })], OPZIONI);
    assert.equal(prima.migliore?.fermo, true);
    assert.equal(dopo.migliore?.fermo, false);
  });

  it('un prezzo fermo resta in classifica e può vincere', () => {
    const c = confrontaProdotto(
      [
        offerta({ id: 'vecchio-economico', prezzoNetto: '6.00', valeDa: new Date('2023-01-01') }),
        offerta({ id: 'nuovo-caro', prezzoNetto: '9.00' }),
      ],
      OPZIONI,
    );
    assert.equal(c.migliore?.id, 'vecchio-economico');
    assert.equal(c.migliore?.fermo, true);
    assert.equal(c.qualcunoFermo, true);
  });
});

describe('quando un confronto merita di essere segnalato', () => {
  const grande = confrontaProdotto(
    [
      offerta({ id: 'economica', prezzoNetto: '16.00', contenutoPerConfezione: '12' }),
      offerta({ id: 'cara', prezzoNetto: '9.00', contenutoPerConfezione: '6' }),
    ],
    OPZIONI,
  );

  it('supera entrambe le soglie', () => {
    assert.equal(meritaAvviso(grande, { percentuale: 10, euro: 1 }), true);
  });

  it('la percentuale c’è ma gli euro no: non si segnala', () => {
    // Il 30% su una bottiglia da mezzo euro è quindici centesimi. Riempire
    // l'elenco di quelle lo rende inutile proprio quando servirebbe.
    assert.equal(meritaAvviso(grande, { percentuale: 10, euro: 5 }), false);
  });

  it('gli euro ci sono ma la percentuale no: non si segnala', () => {
    assert.equal(meritaAvviso(grande, { percentuale: 50, euro: 1 }), false);
  });

  it('senza confronto non si segnala niente', () => {
    const solo = confrontaProdotto([offerta()], OPZIONI);
    assert.equal(meritaAvviso(solo, { percentuale: 0, euro: 0 }), false);
  });
});
