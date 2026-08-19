import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estraiFormatoAdBeverage,
  estraiImmagineAdBeverage,
  condivideParolaIdentificativa,
  isFornitoreAdBeverage,
  matchAdBeverageProduct,
  normalizzaAdBeverage,
  selezionaCandidatiAdBeverage,
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
  it('porta a DeepSeek anche un candidato con un refuso ampio', () => {
    const candidati = selezionaCandidatiAdBeverage(
      locale({
        name: 'ARDGERG 10 ANNI CL 70',
        brand: 'Ardgerg',
        categoria: 'Whisky',
        unitSize: 70,
        unitOfMeasure: 'CL',
      }),
      [
        ad({ id: 'altro', nome: 'WHISKY ABERLOUR 10 ANNI 70 CL' }),
        ad({ id: 'giusto', nome: 'WHISKY ARDBEG 10 ANNI 70 CL' }),
      ],
    );
    assert.equal(candidati[0]?.prodotto.id, 'giusto');
    assert.ok(candidati[0]!.richiamo >= 0.3);
  });
  it('accetta dalla regola un prodotto esatto anche senza formato locale', () => {
    const esito = matchAdBeverageProduct(
      locale({
        name: 'DIPLOMATICO PLANAS',
        brand: 'Diplomatico',
        categoria: 'Rum',
        unitSize: 1,
        unitOfMeasure: 'PIECE',
      }),
      ad({ nome: 'RUM DIPLOMATICO PLANAS 47° 70 CL' }),
    );
    assert.equal(esito.accettato, true, esito.motivo);
    assert.ok(esito.confidenza >= 0.85);
  });
  it('riconosce 3Y come la stessa età di 3 Y O', () => {
    const esito = matchAdBeverageProduct(
      locale({
        name: 'HAVANA CLUB 3Y RON 40% LT.1',
        brand: 'Havana Club',
        categoria: 'Rum',
        unitSize: 1,
        unitOfMeasure: 'L',
      }),
      ad({ nome: 'RUM HAVANA CLUB 3 Y O 37 5 1 L' }),
    );
    assert.equal(esito.accettato, true, esito.motivo);
  });
  it('usa soltanto equivalenze commerciali AD verificate', () => {
    const casi = [
      [
        locale({ name: 'BATIDA DE COCO NEW CL.70', categoria: 'Liquore' }),
        ad({ nome: 'LIQUORE MANGAROCA BATIDA DE COCO 16 1 L' }),
      ],
      [
        locale({
          name: 'SCIROPPO PASSION FRUIT ODK',
          brand: 'ODK',
          categoria: 'Sciroppo',
        }),
        ad({ nome: 'SCIROPPO ORSA DRINKS PASSION FRUIT SYRUP VP 750 ML' }),
      ],
      [
        locale({
          name: 'ZACAPA CENTENARIO 23 ANNI CL 70',
          brand: 'Zacapa',
          categoria: 'Rum',
        }),
        ad({ nome: 'RUM ZACAPA SOLERA GRAN RESERVA 40 70 CL' }),
      ],
    ] as const;
    for (const [prodotto, scheda] of casi) {
      const esito = matchAdBeverageProduct(prodotto, scheda);
      assert.equal(esito.accettato, true, esito.motivo);
      assert.match(esito.motivo, /equivalenza foto AD verificata/);
    }
  });
});

describe('confini della fonte', () => {
  it('pretende una parola propria in comune con la scheda scelta', () => {
    // Caso vero: DeepSeek ha dato a «GINARTE» la foto di «SIPSMITH»
    // scrivendo «corrisponde al candidato Gin Arte» — che nel catalogo non
    // esiste. Le due schede non condividono niente se non «gin» e «dry»,
    // che sono categoria e stile.
    assert.equal(
      condivideParolaIdentificativa(
        'GINARTE DISTILLED DRY GIN CL.70 43,5%',
        'GIN SIPSMITH LONDON DRY 41 6  70 CL',
      ),
      false,
    );
    // Non deve però rifare il lavoro del confronto: i refusi e le grafie
    // diverse devono passare, o si perde tutto quello che il modello serve
    // a recuperare.
    assert.equal(
      condivideParolaIdentificativa(
        'KINGSTONE 62 GOLD RUM 40° LT 1',
        'RUM KINGSTON 62 GOLD 40  1 L',
      ),
      true,
    );
    assert.equal(
      condivideParolaIdentificativa(
        'AMARETTO DI SARONNO LT 1',
        'LIQUORE AMARETTO DISARONNO 28  1 L',
      ),
      true,
    );
    // Marca attaccata da una parte e staccata dall'altra.
    assert.equal(
      condivideParolaIdentificativa(
        'SAN PELLEGRINO CHINO CL 20 VAP',
        'CHINOTTO SANPELLEGRINO VAP TC 200 ML',
      ),
      true,
    );
    // Refuso che sposta due lettere ma lascia intatte le prime sette.
    assert.equal(
      condivideParolaIdentificativa(
        'BUSHMILSS ORIG.40% CL 70',
        'WHISKY BUSHMILL S ORIGINAL IRISH 40  70 CL',
      ),
      true,
    );
    // La parola dentro l'altra non deve aprire la porta a «gin» dentro
    // «ginarte»: sotto le cinque lettere non vale.
    assert.equal(
      condivideParolaIdentificativa('GINARTE CL.70', 'GIN DOLCE VITA DRY 40  70 CL'),
      false,
    );
    // Un nome fatto solo di categoria non è verificabile.
    assert.equal(condivideParolaIdentificativa('VODKA LITRO', 'VODKA ABSOLUT BLU 40  1 L'), false);
  });

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
