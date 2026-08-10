import assert from 'node:assert/strict';
import test from 'node:test';
import { eArticolo, statoIniziale } from './riga-articolo';

/** I campi che la strutturazione produce per una riga prodotto. */
const CAMPI = { descrizione: 'AMARETTO DI SARONNO 1/1', prezzoNetto: '16.83', importabile: true };

test('una riga prodotto con campi è un articolo', () => {
  assert.equal(eArticolo({ tipo: 'prodotto', campi: CAMPI }), true);
});

test('le righe vere scartate dal listino Cecconi non sono articoli', () => {
  // Testi presi dal listino in produzione: sono esattamente le venti righe
  // che finivano nella coda degli abbinamenti chiedendo una decisione.
  const scarti = [
    'Destinazione: 8610000020 Ordine di vendita',
    'GELATERIA GUIDO SNC DI PAGANO JAVIE 001686 del: 28/02/2025',
    'PIAZZA FRATELLI BRANCONDI Fatturazione : 8610000020',
    '62017 PORTORECANATI (MC)',
    'P.IVA: 00910200435',
    'Pagamento: 20 R.B. 30 GG F.M. (MC)',
    'Tel.: Fax.:',
    'Imponibile % Iva Importo Totale merce: 4.337,27',
    'Totale iva:(*) 949,84',
    'Totale ordine: 5.287,11',
    'Note:',
    '2.482,40 TOT 546,13 EUR 3.028,53 EUR 3.028,53',
    '1)RD. 3.028,53 29/04/2026',
  ];
  for (const testo of scarti) {
    // Il segmentatore le marca «ignota» e la strutturazione non produce campi:
    // non c'è un nome, non c'è un prezzo, non c'è niente da abbinare.
    assert.equal(
      eArticolo({ tipo: 'ignota', campi: null }),
      false,
      `«${testo}» non deve risultare un articolo`,
    );
  }
});

test('i titoli di sezione non sono articoli', () => {
  // «LIQUORI», «AMARI»: dicono cosa viene dopo, non sono una cosa da comprare.
  assert.equal(eArticolo({ tipo: 'sezione', campi: null }), false);
  assert.equal(eArticolo({ tipo: 'intestazione', campi: null }), false);
});

test('senza campi non è un articolo nemmeno se il tipo dice prodotto', () => {
  // Se la strutturazione non ha ricavato niente non c'è cosa importare, e
  // metterla in coda chiede una decisione che non si può prendere.
  assert.equal(eArticolo({ tipo: 'prodotto', campi: null }), false);
  assert.equal(eArticolo({ tipo: 'prodotto', campi: undefined }), false);
});

test('gli articoli nascono da decidere, i non-articoli già chiusi', () => {
  assert.deepEqual(statoIniziale({ tipo: 'prodotto', campi: CAMPI }), {
    matchStatus: 'PENDING',
    proposedAction: 'AMBIGUOUS',
    excluded: false,
  });
  // Stesso stato di «Ignora questa riga», ma senza revisore: la decisione
  // l'ha presa il sistema, e dalla riga si deve poter vedere.
  assert.deepEqual(statoIniziale({ tipo: 'ignota', campi: null }), {
    matchStatus: 'IGNORED',
    proposedAction: 'IGNORE',
    excluded: true,
  });
});

test('escluse vuol dire fuori dalla coda, non cancellate', () => {
  // `excluded` le toglie dai conteggi e dal blocco dell'apply; restano nel
  // database, dove servono a capire cosa c'era nel PDF quando un'estrazione
  // va storta.
  const stato = statoIniziale({ tipo: 'ignota', campi: null });
  assert.equal(stato.excluded, true);
  assert.notEqual(stato.matchStatus, 'REJECTED');
});
