import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { costruisciSqlCandidati, costruisciSqlEsclusi } from './candidati-abbinamento';

/**
 * Il costruttore dell'SQL dei candidati.
 *
 * Come per la ricerca del catalogo, quello che va verificato non e' che la
 * query «funzioni» — lo dice il collaudo sui dati veri — ma che non possa
 * **mai** uscire dall'organizzazione e che il testo non finisca concatenato.
 * Un commento che lo raccomanda non lo garantisce.
 */

const sql = (org = 'org-1', nucleo = 'birra xyz', base = 'L', limite = 5) =>
  costruisciSqlCandidati(org, nucleo, base, limite);

describe('il filtro per organizzazione', () => {
  it('c’e in ogni ramo della query', () => {
    const q = sql();
    const rami = q.strings.join('?').split('UNION ALL');
    assert.equal(rami.length, 2, 'la query ha due rami: nome e alias');
    for (const [i, ramo] of rami.entries()) {
      assert.match(ramo, /organization_id = \?/, `il ramo ${i} non filtra per organizzazione`);
    }
  });

  it('l’organizzazione e un parametro, non testo cucito nella query', () => {
    const q = sql("org-1' OR '1'='1");
    assert.doesNotMatch(q.strings.join(''), /OR '1'/);
    assert.ok(q.values.includes("org-1' OR '1'='1"));
  });

  it('senza organizzazione si rifiuta di costruirla', () => {
    assert.throws(() => sql(''), /organizationId obbligatorio/);
    assert.throws(() => costruisciSqlEsclusi('', 'x'), /organizationId obbligatorio/);
  });
});

describe('i parametri', () => {
  it('il nucleo non viene mai concatenato', () => {
    const q = sql('org-1', "birra'; drop table product; --");
    assert.doesNotMatch(q.strings.join(''), /drop table/i);
    assert.ok(q.values.includes("birra'; drop table product; --"));
  });

  it('il limite e un parametro', () => {
    const q = sql('org-1', 'birra', 'L', 42);
    assert.ok(q.values.includes(42));
  });

  it('un nucleo vuoto non produce una query', () => {
    // Cercare candidati per una descrizione vuota li troverebbe tutti.
    assert.throws(() => sql('org-1', '   '), /Nucleo vuoto/);
  });
});

describe('il filtro sull’unita base', () => {
  it('e nella query, in entrambi i rami', () => {
    const q = sql('org-1', 'birra', 'L');
    const occorrenze = q.strings.join('?').match(/base_unit::text = \?/g) ?? [];
    assert.equal(occorrenze.length, 2);
    assert.ok(q.values.includes('L'));
  });
});

describe('la soglia di somiglianza', () => {
  it('e un parametro e scarta i candidati sotto soglia dentro la query', () => {
    // Filtrarli dopo li porterebbe comunque tutti fuori dal database.
    const q = sql();
    assert.match(q.strings.join('?'), /HAVING max\(r\.trigram\) >= \?/);
  });
});

describe('i sinonimi negativi', () => {
  it('cercano solo quelli marcati negativi, nell’organizzazione', () => {
    const q = costruisciSqlEsclusi('org-1', 'birra xyz');
    assert.match(q.strings.join('?'), /negative = true/);
    assert.match(q.strings.join('?'), /organization_id = \?/);
    assert.ok(q.values.includes('birra xyz'));
  });
});
