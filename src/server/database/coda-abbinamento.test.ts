import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CodaQuery } from '@/features/matching/schema';
import {
  calcolaPaginazione,
  costruisciSqlConteggiCoda,
  costruisciSqlRigheCoda,
} from './coda-abbinamento';

const query = (overrides: Partial<CodaQuery> = {}): CodaQuery => ({
  priceListId: '',
  stato: 'PENDING',
  limite: 200,
  pagina: 1,
  ...overrides,
});

describe('paginazione della coda di abbinamento', () => {
  it('rende raggiungibili anche le righe dopo le prime 200', () => {
    assert.deepEqual(calcolaPaginazione(451, 2, 200), {
      paginaCorrente: 2,
      pagine: 3,
      limite: 200,
      offset: 200,
      haPrecedente: true,
      haSuccessiva: true,
    });
    assert.equal(calcolaPaginazione(451, 3, 200).offset, 400);
  });

  it("riporta una pagina fuori intervallo all'ultima pagina reale", () => {
    assert.equal(calcolaPaginazione(201, 999, 200).paginaCorrente, 2);
  });
});

describe('query scoped e limitata della coda', () => {
  it('filtra sempre per organizzazione e parametrizza input, limite e offset', () => {
    const organizzazione = "org' OR '1'='1";
    const listino = "list' OR '1'='1";
    const sql = costruisciSqlRigheCoda(
      organizzazione,
      query({ priceListId: listino, stato: 'tutti' }),
      200,
    );
    const testo = sql.strings.join('?');

    assert.match(testo, /pl\.organization_id = \?/);
    assert.doesNotMatch(testo, /OR '1'/);
    assert.ok(sql.values.includes(organizzazione));
    assert.ok(sql.values.includes(listino));
    assert.ok(sql.values.includes(200));
    assert.match(testo, /LIMIT \?/);
    assert.match(testo, /OFFSET \?/);
  });

  it('applica lo stesso filtro di stato al conteggio e alla pagina', () => {
    const conteggi = costruisciSqlConteggiCoda('org-1', query({ stato: 'NEW' }));
    const righe = costruisciSqlRigheCoda('org-1', query({ stato: 'NEW' }), 0);
    for (const sql of [conteggi, righe]) {
      assert.match(sql.strings.join('?'), /r\.match_status::text = \?/);
      assert.ok(sql.values.includes('NEW'));
    }
  });

  it('include una riga bloccante anche quando reviewedAt è già valorizzato', () => {
    for (const sql of [
      costruisciSqlConteggiCoda('org-1', query({ stato: 'tutti' })),
      costruisciSqlRigheCoda('org-1', query({ stato: 'tutti' }), 0),
    ]) {
      const testo = sql.strings.join('?');
      assert.match(testo, /reviewed_at IS NULL OR/);
      assert.match(testo, /validation_errors/);
      assert.match(testo, /importabile/);
      assert.match(testo, /match_status::text = 'PENDING'/);
    }
  });

  it('rifiuta di costruire una query senza organizzazione', () => {
    assert.throws(() => costruisciSqlRigheCoda('', query(), 0), /organizationId obbligatorio/);
    assert.throws(() => costruisciSqlConteggiCoda('', query()), /organizationId obbligatorio/);
  });
});
