import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contaParole, leggiBbox } from './bbox';

const XML = `<html><head><title>Listino &amp; prezzi</title>
<meta name="Creator" content="GAMMA"/>
<meta name="Producer" content="TeamSystem s.p.a."/>
</head><body><doc>
  <page width="595.5" height="842.8">
    <flow><block xMin="1" yMin="1" xMax="9" yMax="9">
      <line xMin="1" yMin="1" xMax="9" yMax="9">
        <word xMin="18.5" yMin="234.8" xMax="42.5" yMax="241.1">AP112</word>
        <word xMin="119.3" yMin="234.8" xMax="157.7" yMax="241.1">S.BENED.</word>
        <word xMin="200.0" yMin="234.8" xMax="210.0" yMax="241.1"> </word>
        <word xMin="220.0" yMin="234.8" xMax="240.0" yMax="241.1">A&amp;B &lt;x&gt;</word>
      </line>
    </block></flow>
  </page>
  <page width="595.5" height="842.8">
    <flow><block xMin="1" yMin="1" xMax="9" yMax="9">
      <line xMin="1" yMin="1" xMax="9" yMax="9">
        <word xMin="10" yMin="20" xMax="30" yMax="28">Pag.</word>
      </line>
    </block></flow>
  </page>
</doc></body></html>`;

describe('leggiBbox', () => {
  const documento = leggiBbox(XML);

  it('separa le pagine e le numera da 1', () => {
    assert.equal(documento.pagine.length, 2);
    assert.deepEqual(
      documento.pagine.map((p) => p.numero),
      [1, 2],
    );
    assert.equal(documento.pagine[0]!.larghezza, 595.5);
  });

  it('assegna ogni parola alla propria pagina', () => {
    assert.equal(documento.pagine[0]!.parole.length, 3);
    assert.equal(documento.pagine[1]!.parole.length, 1);
    assert.equal(documento.pagine[1]!.parole[0]!.testo, 'Pag.');
  });

  it('scarta le parole fatte di soli spazi', () => {
    // poppler ne emette qualcuna: conteggiarle sposterebbe i confini delle
    // colonne verso posizioni dove non c'e' scritto niente.
    assert.equal(
      documento.pagine[0]!.parole.some((p) => !p.testo.trim()),
      false,
    );
  });

  it('decodifica le entita', () => {
    assert.equal(documento.pagine[0]!.parole[2]!.testo, 'A&B <x>');
    assert.equal(documento.metadati.titolo, 'Listino & prezzi');
  });

  it('legge le coordinate come numeri', () => {
    const prima = documento.pagine[0]!.parole[0]!;
    assert.deepEqual(
      { x: prima.x, y: prima.y, xFine: prima.xFine },
      { x: 18.5, y: 234.8, xFine: 42.5 },
    );
  });

  it('riporta chi ha prodotto il file', () => {
    assert.equal(documento.metadati.creatore, 'GAMMA');
    assert.equal(documento.metadati.produttore, 'TeamSystem s.p.a.');
  });

  it('conta le parole di tutto il documento', () => {
    assert.equal(contaParole(documento), 4);
  });
});

describe('leggiBbox su un documento senza testo', () => {
  it('restituisce pagine vuote invece di fallire', () => {
    // E' cosi' che si riconosce un PDF scansionato: pagine ci sono, parole no.
    const scansionato = leggiBbox(
      '<html><body><doc><page width="595" height="842"></page></doc></body></html>',
    );
    assert.equal(scansionato.pagine.length, 1);
    assert.equal(contaParole(scansionato), 0);
  });
});
