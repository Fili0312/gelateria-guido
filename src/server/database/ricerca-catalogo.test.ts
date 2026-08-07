import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { costruisciSqlRicerca, preparaTermine } from './ricerca-catalogo';

/**
 * L'SQL della ricerca è l'unico punto del codice applicativo che non passa
 * dal client scoped: l'estensione che filtra per organizzazione non può
 * intercettare una query grezza. Questi test verificano l'invariante che lì
 * viene a mancare — che il filtro ci sia comunque, sempre, in ogni ramo.
 *
 * Girano senza database: `Prisma.sql` è una struttura ispezionabile.
 */

const ORG = 'org-gelateria';

function valori(sql: { values: unknown[] }): unknown[] {
  return sql.values;
}

function testo(sql: { strings: readonly string[] }): string {
  return sql.strings.join('?');
}

describe('preparaTermine', () => {
  it('normalizza con la stessa funzione usata in scrittura', () => {
    assert.equal(preparaTermine('  BIRRA  ').normalizzato, 'birra');
    assert.equal(preparaTermine('Però').normalizzato, 'pero');
    assert.equal(preparaTermine('Coca-Cola').normalizzato, 'coca cola');
  });

  it('sotto i tre caratteri passa al prefisso', () => {
    assert.equal(preparaTermine('bi').strategia, 'prefisso');
    assert.equal(preparaTermine('b').strategia, 'prefisso');
    assert.equal(preparaTermine('bir').strategia, 'somiglianza');
  });
});

describe('costruisciSqlRicerca', () => {
  it('rifiuta una ricerca senza organizzazione', () => {
    assert.throws(
      () => costruisciSqlRicerca('', preparaTermine('birra'), 20),
      /organizationId obbligatorio/,
    );
  });

  for (const termine of ['birra', 'bi']) {
    it(`filtra per organizzazione in ogni ramo — termine "${termine}"`, () => {
      const sql = costruisciSqlRicerca(ORG, preparaTermine(termine), 20);

      // Ogni `organization_id = ?` nella query deve corrispondere a un
      // parametro che vale l'organizzazione richiesta.
      const occorrenze = testo(sql).split('p.organization_id = ?').length - 1;
      assert.ok(occorrenze >= 2, `atteso almeno un filtro per ramo, trovati ${occorrenze}`);

      const quanteVolteOrg = valori(sql).filter((v) => v === ORG).length;
      assert.equal(
        quanteVolteOrg,
        occorrenze,
        'ogni filtro deve ricevere davvero l organizzazione, non un altro parametro',
      );
    });
  }

  it('non concatena mai il termine nel testo della query', () => {
    const sql = costruisciSqlRicerca(ORG, preparaTermine("birra'; DROP TABLE product; --"), 20);
    assert.ok(!testo(sql).includes('DROP TABLE'), 'il termine deve restare un parametro');
    assert.ok(
      valori(sql).some((v) => typeof v === 'string' && v.includes('drop table')),
      'il termine normalizzato deve essere fra i parametri',
    );
  });

  it('neutralizza i jolly digitati dall utente', () => {
    const sql = costruisciSqlRicerca(ORG, preparaTermine('50%'), 20);
    const conEscape = valori(sql).filter((v) => typeof v === 'string' && v.includes('\\%'));
    assert.ok(conEscape.length > 0, 'una percentuale digitata non deve diventare un jolly');
  });

  it('usa il trigram sopra i tre caratteri e il prefisso sotto', () => {
    assert.ok(testo(costruisciSqlRicerca(ORG, preparaTermine('birra'), 20)).includes('word_similarity'));
    assert.ok(!testo(costruisciSqlRicerca(ORG, preparaTermine('bi'), 20)).includes('word_similarity'));
  });

  it('cerca il codice articolo a prefisso in entrambe le strategie', () => {
    for (const termine of ['birra', 'bi']) {
      assert.ok(
        testo(costruisciSqlRicerca(ORG, preparaTermine(termine), 20)).includes('lower(sp.supplier_code) LIKE'),
        `il codice deve essere cercato anche col termine "${termine}"`,
      );
    }
  });

  it('porta il limite come parametro', () => {
    assert.ok(valori(costruisciSqlRicerca(ORG, preparaTermine('birra'), 7)).includes(7));
  });
});
