import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeNextPath } from './redirect-path';

describe('destinazione dopo il login', () => {
  it('conserva percorso, query e frammento interni', () => {
    assert.equal(safeNextPath('/fornitori?pagina=2#recenti'), '/fornitori?pagina=2#recenti');
    assert.equal(safeNextPath(['/prodotti', '/ordini']), '/prodotti');
  });

  it('rifiuta URL assoluti e protocol-relative', () => {
    assert.equal(safeNextPath('https://example.com'), '/');
    assert.equal(safeNextPath('//example.com'), '/');
    assert.equal(safeNextPath('/\\example.com'), '/');
  });

  it('torna alla dashboard per valori assenti o non relativi', () => {
    assert.equal(safeNextPath(undefined), '/');
    assert.equal(safeNextPath('fornitori'), '/');
  });
});
