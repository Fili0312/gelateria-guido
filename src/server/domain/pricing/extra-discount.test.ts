import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  haScontoExtra,
  nettoEffettivo,
  percentualeApplicata,
  ritornoPerConfezione,
  type ScontoExtra,
} from './extra-discount';

function sconto(dati: Partial<ScontoExtra> = {}): ScontoExtra {
  return { percentualeFornitore: '10', esclusa: false, percentualeSua: null, ...dati };
}

describe('«un ulteriore 10% su tutti i prodotti»', () => {
  it('il netto effettivo è quello scontato', () => {
    assert.equal(nettoEffettivo('22.86', sconto()).toString(), '20.57');
  });

  it('e si sa quanto torna indietro', () => {
    assert.equal(ritornoPerConfezione('22.86', sconto()).toString(), '2.29');
  });

  it('senza sconto concordato non cambia niente', () => {
    const senza = sconto({ percentualeFornitore: null });
    assert.equal(nettoEffettivo('22.86', senza).toString(), '22.86');
    assert.equal(haScontoExtra(senza), false);
  });
});

describe('«esclusi alcuni»', () => {
  it('un articolo escluso paga il listino pieno', () => {
    const escluso = sconto({ esclusa: true });
    assert.equal(nettoEffettivo('22.86', escluso).toString(), '22.86');
    assert.equal(haScontoExtra(escluso), false);
  });

  it('l’esclusione vince anche su una percentuale sua', () => {
    // «Escluso» è una risposta netta: se poi una percentuale ci fosse
    // comunque, l'esclusione non vorrebbe dire niente.
    assert.equal(percentualeApplicata(sconto({ esclusa: true, percentualeSua: '20' })).toString(), '0');
  });
});

describe('una percentuale diversa per un articolo', () => {
  it('sostituisce quella del fornitore, non ci si somma', () => {
    // Due sconti che si moltiplicano danno un numero che nessuno sa rifare a
    // mano: 10% e poi 5% non è 15%, ed è la strada più corta per un totale
    // che non torna con nessun documento.
    const suo = sconto({ percentualeFornitore: '10', percentualeSua: '5' });
    assert.equal(percentualeApplicata(suo).toString(), '5');
    assert.equal(nettoEffettivo('100', suo).toString(), '95');
  });

  it('vale anche quando il fornitore non ne ha uno', () => {
    const suo = sconto({ percentualeFornitore: null, percentualeSua: '15' });
    assert.equal(nettoEffettivo('100', suo).toString(), '85');
  });
});

describe('arrotondamento', () => {
  it('due decimali all’even, come i netti di listino', () => {
    // Un prezzo effettivo arrotondato diversamente dai netti creerebbe
    // differenze da un centesimo che sembrano differenze vere.
    assert.equal(nettoEffettivo('0.125', sconto({ percentualeFornitore: '0' })).toString(), '0.125');
    assert.equal(nettoEffettivo('1.25', sconto({ percentualeFornitore: '10' })).toString(), '1.12');
  });

  it('uno sconto a zero non tocca il prezzo nemmeno nell’arrotondamento', () => {
    assert.equal(nettoEffettivo('1.234', sconto({ percentualeFornitore: '0' })).toString(), '1.234');
  });
});
