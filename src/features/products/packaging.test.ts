import assert from 'node:assert/strict';
import test from 'node:test';
import { colloInLinea, descriviCollo, quantitaOrdinata } from './packaging';

const base = { unitSize: '70', unitOfMeasure: 'CL' as const, packQuantityConfirmed: true };

test('un collo dice quanti pezzi ci sono dentro', () => {
  const collo = descriviCollo({ ...base, packagingType: 'CO', packQuantity: 24 });
  assert.equal(collo.titolo, 'Collo da 24');
  assert.equal(collo.dettaglio, '70 cl l’uno');
  assert.equal(collo.pezzi, 24);
  assert.equal(collo.singolo, false);
});

test('una bottiglia singola si chiama bottiglia, perché lo dice il listino', () => {
  const collo = descriviCollo({ ...base, packagingType: 'BT', packQuantity: 1 });
  assert.equal(collo.titolo, '1 bottiglia');
  assert.equal(collo.dettaglio, '70 cl');
  assert.equal(collo.singolo, true);
});

test('senza sigla non si inventa il nome del pezzo', () => {
  // Sapere che è «una confezione» è vero; dire «una bottiglia» sarebbe un
  // indovinello, e su un listino di cialde sarebbe sbagliato.
  assert.equal(
    descriviCollo({ ...base, packagingType: null, packQuantity: 1 }).titolo,
    'Confezione singola',
  );
  assert.equal(
    descriviCollo({ ...base, packagingType: null, packQuantity: 6 }).titolo,
    'Confezione da 6',
  );
});

test('dentro un collo non si dichiara cosa siano i pezzi', () => {
  // «Collo da 24 bottiglie» sarebbe una parola in più che il listino non ha
  // detto. Il formato accanto — «70 cl l'uno» — dice quello che serve.
  const collo = descriviCollo({ ...base, packagingType: 'CT', packQuantity: 12 });
  assert.equal(collo.titolo, 'Cartone da 12');
  assert.ok(!collo.titolo.includes('bottigli'), collo.titolo);
});

test('un collo che dichiara un pezzo solo si contraddice, e lo dice', () => {
  // È il caso dei 24 articoli in produzione: sigla «CO» e pack_quantity 1,
  // che vuol dire che il numero non è stato letto. Scrivere «1» farebbe
  // credere che 4,72 € sia il prezzo della bottiglia: sbagliato di 24 volte.
  const collo = descriviCollo({
    ...base,
    packagingType: 'CO',
    packQuantity: 1,
    packQuantityConfirmed: false,
  });
  assert.equal(collo.titolo, 'Collo, pezzi da definire');
  assert.equal(collo.daDefinire, true);
  assert.equal(collo.singolo, false);
});

test('su una riga sola: titolo e formato', () => {
  assert.equal(
    colloInLinea({ ...base, packagingType: 'CO', packQuantity: 24 }),
    'Collo da 24 · 70 cl l’uno',
  );
});

test('quanto si sta ordinando, come lo legge il fornitore', () => {
  // La richiesta è precisa: «ordino 3 confezioni da 12 bottiglie».
  assert.equal(
    quantitaOrdinata({ ...base, packagingType: 'CT', packQuantity: 12 }, 3),
    '3 × cartone da 12 · 36 pezzi in tutto',
  );
  // Con la confezione singola il totale dei pezzi sarebbe una ripetizione.
  assert.equal(
    quantitaOrdinata({ ...base, packagingType: 'BT', packQuantity: 1 }, 3),
    '3 × bottiglia',
  );
});

test('i pezzi totali si moltiplicano, non si sommano a caso', () => {
  const collo = descriviCollo({ ...base, packagingType: 'CO', packQuantity: 40 });
  assert.equal(collo.pezzi * 3, 120);
  assert.ok(
    quantitaOrdinata({ ...base, packagingType: 'CO', packQuantity: 40 }, 3).includes('120'),
  );
});

test('un contenitore da un pezzo si smaschera anche senza il flag', () => {
  // Sugli snapshot di un ordine il flag «confezione da definire» non c'è:
  // congelano cosa si è comprato, non i nostri dubbi. La contraddizione però
  // sta nel dato — «collo» e «1 pezzo» insieme — e va vista lo stesso.
  const collo = descriviCollo({
    ...base,
    packagingType: 'CO',
    packQuantity: 1,
    packQuantityConfirmed: true,
  });
  assert.equal(collo.daDefinire, true);
  assert.equal(collo.titolo, 'Collo, pezzi da definire');
});

test('una bottiglia da un pezzo invece è normalissima', () => {
  const collo = descriviCollo({
    ...base,
    packagingType: 'BT',
    packQuantity: 1,
    packQuantityConfirmed: true,
  });
  assert.equal(collo.daDefinire, false);
});
