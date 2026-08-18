import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estraiFormatoAdBeverage,
  estraiImmagineAdBeverage,
  isFornitoreAdBeverage,
  matchAdBeverageProduct,
  normalizzaAdBeverage,
  trovaMiglioreAdBeverage,
  type ProdottoAdBeverage,
} from './ad-beverage';
import type { DatiProdotto } from './normalizza';

const locale = (dati: Partial<DatiProdotto> = {}): DatiProdotto => ({
  name: 'JAGERMEISTER LT 1',
  brand: 'Jagermeister',
  categoria: 'Amaro',
  unitSize: '1',
  unitOfMeasure: 'L',
  fornitori: ['AD Beverage'],
  ...dati,
});
const ad = (dati: Partial<ProdottoAdBeverage> = {}): ProdottoAdBeverage => ({
  id: 'id-ad-1',
  codice: '123456',
  nome: 'AMARO JAGERMEISTER 35° 1 L',
  categoria: 'KC ALCOLICI',
  descrizione: null,
  fotoUrl:
    'https://hvyglhcdxfpsqlmlezqg.supabase.co/storage/v1/object/public/prodotti-foto/123456.jpg',
  ...dati,
});

describe('normalizzazione AD Beverage', () => {
  it('unifica i formati', () => {
    for (const f of ['CL 100', 'CL.100', '100 CL', 'LT 1', 'LT.1', 'LITRO', '1 L'])
      assert.equal(estraiFormatoAdBeverage(f)?.base, 1_000, f);
    for (const f of ['70 CL', 'CL.70', '0,7 L', '700 ML'])
      assert.equal(estraiFormatoAdBeverage(f)?.base, 700, f);
    assert.equal(estraiFormatoAdBeverage('COCA COLA BARATTOLO 33X24')?.base, 330);
    assert.equal(estraiFormatoAdBeverage('CEDRATA TASSONI CL.18X25')?.base, 180);
  });
  it('toglie il rumore commerciale', () => {
    assert.equal(
      normalizzaAdBeverage('BARCELO RUM BIANCO LITRO (in sostituz. Kingstone White) ASS0DRINK OFF')
        .testo,
      'barcelo rum bianco',
    );
    assert.equal(
      normalizzaAdBeverage('CAFFE BORGHETTI LITRO ANCORA IN PROMOZIONE').testo,
      'caffe borghetti',
    );
    assert.equal(
      normalizzaAdBeverage('CORONA prezzo errato ft 28.07.26 inviato messaggio').testo,
      'corona',
    );
  });
});

describe('matching AD Beverage', () => {
  it('accetta un match forte', () => {
    const esito = matchAdBeverageProduct(locale(), ad());
    assert.equal(esito.accettato, true, esito.motivo);
    assert.ok(esito.confidenza >= 0.9);
  });
  it('rifiuta Absolut della variante sbagliata', () => {
    const esito = matchAdBeverageProduct(
      locale({ name: 'ABSOLUT CITRON VODKA LITRO', brand: 'Absolut', categoria: 'Vodka' }),
      ad({ nome: 'ABSOLUT VANILIA VODKA 1 L' }),
    );
    assert.equal(esito.accettato, false);
    assert.match(esito.motivo, /variante diversa/);
    assert.ok(esito.confidenza < 0.8);
  });
  it('rifiuta marca, formato e contenitore diversi', () => {
    assert.match(
      matchAdBeverageProduct(
        locale({ name: 'AMARO MONTENEGRO 1 L', brand: 'Montenegro' }),
        ad({ nome: 'AMARO AVERNA 1 L' }),
      ).motivo,
      /marca diversa/,
    );
    assert.match(
      matchAdBeverageProduct(locale(), ad({ nome: 'AMARO JAGERMEISTER 70 CL' })).motivo,
      /formato diverso/,
    );
    assert.match(
      matchAdBeverageProduct(
        locale({ name: 'COCA COLA BARATTOLO 33 CL', brand: 'Coca-Cola', categoria: 'Analcolico' }),
        ad({ nome: 'COCA COLA VAP 33 CL', categoria: 'K2 BEVANDE' }),
      ).motivo,
      /confezione diversa/,
    );
  });
  it('rifiuta la variante aggiunta al prodotto base', () => {
    const esito = matchAdBeverageProduct(
      locale({
        name: 'COCA COLA 33 CL',
        brand: 'Coca-Cola',
        categoria: 'Analcolico',
        unitSize: 33,
        unitOfMeasure: 'CL',
      }),
      ad({ nome: 'COCA COLA ZERO 33 CL', categoria: 'K2 BEVANDE' }),
    );
    assert.equal(esito.accettato, false);
    assert.match(esito.motivo, /variante diversa/);
  });
  it('senza marca pretende due parole distintive', () => {
    assert.equal(
      matchAdBeverageProduct(
        locale({ name: 'APERITIVO GREEN P31 LITRO', brand: null, categoria: 'Aperitivo/Bitter' }),
        ad({ nome: 'APERITIVO GREEN P31 1 L' }),
      ).accettato,
      true,
    );
    assert.match(
      matchAdBeverageProduct(
        locale({ name: 'ACQUA LITRO', brand: null, categoria: 'Acqua' }),
        ad({ nome: 'ACQUA MINERALE NATURALE 1 L', categoria: 'K1 ACQUE' }),
      ).motivo,
      /troppo generico/,
    );
  });
  it('valuta tutti i candidati', () => {
    const esito = trovaMiglioreAdBeverage(
      locale({ name: 'ABSOLUT CITRON VODKA LITRO', brand: 'Absolut', categoria: 'Vodka' }),
      [
        ad({ id: 'sbagliato', nome: 'ABSOLUT VANILIA VODKA 1 L' }),
        ad({ id: 'giusto', nome: 'ABSOLUT CITRON VODKA 1 L' }),
      ],
    );
    assert.equal(esito.prodotto?.id, 'giusto');
    assert.equal(esito.accettato, true);
  });
  it('non tratta stile e imballo come varianti', () => {
    assert.equal(
      matchAdBeverageProduct(
        locale({ name: 'BOMBAY SAPPHIRE LITRO', brand: 'Bombay', categoria: 'Gin' }),
        ad({ nome: 'GIN BOMBAY SAPPHIRE LONDON DRY 40° 1 L' }),
      ).accettato,
      true,
    );
    assert.equal(
      matchAdBeverageProduct(
        locale({
          name: 'CEDRATA TASSONI CL.18X25',
          brand: 'Tassoni',
          categoria: 'Analcolico',
          unitSize: 18,
          unitOfMeasure: 'CL',
        }),
        ad({ nome: 'CEDRATA TASSONI VAP TC 180 ML', categoria: 'K2 BEVANDE' }),
      ).accettato,
      true,
    );
  });
  it('non confonde annate diverse', () => {
    const esito = matchAdBeverageProduct(
      locale({
        name: 'CHAMPAGNE DOM PERIGNON VINTAGE BRUT 2013 CL 75',
        brand: 'Dom Pérignon',
        categoria: 'Spumante',
        unitSize: 75,
        unitOfMeasure: 'CL',
      }),
      ad({ nome: 'CHAMPAGNE DOM PERIGNON BRUT 2012 75 CL', categoria: 'K5 VINI' }),
    );
    assert.equal(esito.accettato, false);
    assert.match(esito.motivo, /variante diversa/);
  });
});

describe('confini della fonte', () => {
  it('non abilita AD per altri fornitori', () => {
    assert.equal(isFornitoreAdBeverage('AD Beverage'), true);
    assert.equal(isFornitoreAdBeverage('A.D. Beverage'), true);
    assert.equal(isFornitoreAdBeverage('Cecconi'), false);
    assert.equal(isFornitoreAdBeverage('Barzelli'), false);
  });
  it('accetta solo immagini ufficiali', () => {
    assert.ok(estraiImmagineAdBeverage(ad()));
    assert.equal(estraiImmagineAdBeverage(ad({ fotoUrl: 'https://example.com/foto.jpg' })), null);
  });
});
